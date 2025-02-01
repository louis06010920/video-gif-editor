import React, { useState, useRef } from 'react';
import VideoPlayer from './components/VideoPlayer';
import { GifOverlay, GifControls } from './components/GifOverlay';
import GifSearch from './components/GifSearch';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';
import { parseGIF, decompressFrames } from 'gifuct-js';
import './App.css';

const App = () => {
  const [gifs, setGifs] = useState([]);
  const [currentTime, setCurrentTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const [videoUrl, setVideoUrl] = useState(null);
  const [selectedGifId, setSelectedGifId] = useState(null);

  // 控制匯出進度與 FFmpeg 狀態
  const [isExporting, setIsExporting] = useState(false);
  const [ffmpegInstance, setFfmpegInstance] = useState(null);
  // 這裡我們僅使用 FFmpeg 回報的進度（realRatio）
  const [realRatio, setRealRatio] = useState(0);   // FFmpeg 進度 (0~1)
  const [ffmpegTime, setFfmpegTime] = useState(0);   // FFmpeg 處理時間 (秒)

  // 隱藏 video 的參考（用於本機解碼進度，可選）
  const hiddenVideoRef = useRef(null);

  const handleVideoLoaded = (duration) => {
    setVideoDuration(duration);
  };

  const handleSelectGif = (id) => {
    setSelectedGifId(id);
  };

  const handleDeleteVideo = () => {
    setVideoUrl(null);
    setGifs([]);
    setVideoDuration(0);
  };

  const handleCancelExport = () => {
    if (ffmpegInstance) {
      try {
        ffmpegInstance.terminate();
      } catch (err) {
        console.error('FFmpeg 終止時出錯:', err);
      }
    }
    setRealRatio(1);
    setIsExporting(false);
  };

  // 本機解碼：這裡如果您不需要使用本機進度來平滑顯示，可省略
  const handleLocalVideoTimeUpdate = () => {
    const hiddenVideo = hiddenVideoRef.current;
    if (!hiddenVideo || videoDuration <= 0) return;
    // 如果僅依賴 FFmpeg 的進度，可以不更新本機進度
  };

  const startLocalDecoding = () => {
    const hiddenVideo = hiddenVideoRef.current;
    if (hiddenVideo) {
      hiddenVideo.currentTime = 0;
      hiddenVideo.playbackRate = 4.0;
      hiddenVideo.play().catch((err) => {
        console.error('隱藏 Video 無法播放:', err);
      });
    }
  };

  const stopLocalDecoding = () => {
    const hiddenVideo = hiddenVideoRef.current;
    if (hiddenVideo) {
      hiddenVideo.pause();
      hiddenVideo.currentTime = 0;
    }
  };

  // 使用 gifuct-js 獲取 GIF 的總時長（秒）
  const getGifDuration = async (gifUrl) => {
    try {
      const response = await fetch(gifUrl);
      const buffer = await response.arrayBuffer();
      const parsedGif = parseGIF(buffer);
      const frames = decompressFrames(parsedGif, true);
      const totalDuration = frames.reduce((acc, frame) => acc + frame.delay * 10, 0);
      return totalDuration / 1000;
    } catch (error) {
      console.error('獲取 GIF 時長失敗:', error);
      return 0;
    }
  };

  const handleExportVideo = async () => {
    if (!videoUrl) {
      alert('请先上传视频！');
      return;
    }
    
    const ffmpeg = new FFmpeg({
      log: true,
      corePath: '/ffmpeg-core.js',
      logger: ({ type, message }) => {
        if (type === 'stderr') {
          console.error(`[FFmpeg ${type}] ${message}`);
        } else {
          console.log(`[FFmpeg ${type}] ${message}`);
        }
      },
    });
    
    console.log('======== 開始輸出影片 ========');
    try {
      setIsExporting(true);
      setRealRatio(0);
      setFfmpegTime(0);
      setFfmpegInstance(ffmpeg);
      
      startLocalDecoding();
      
      console.log('載入 FFmpeg 中...');
      await ffmpeg.load();
      console.log('FFmpeg 已成功載入。');
      
      ffmpeg.on("progress", ({ time }) => {
        if (videoDuration > 0) {
          // 假設 FFmpeg 回報的 time 單位為微秒，轉換成秒（如果已經是秒，請移除 /1000000）
          const timeInSec = time / 1000000;
          const ratio = timeInSec / videoDuration;
          const clampedRatio = Math.min(Math.max(ratio, 0), 1);
          setRealRatio(clampedRatio);
          setFfmpegTime(timeInSec);
          console.log(`FFmpeg 處理時間: ${timeInSec.toFixed(2)}s, ratio=${clampedRatio}`);
        }
      });
      
      const videoFileName = 'input.mp4';
      console.log('開始寫入主影片:', videoUrl);
      await ffmpeg.writeFile(videoFileName, await fetchFile(videoUrl));
      console.log('主影片已寫入 (input.mp4)。');
      
      let ffmpegArgs;
      if (gifs.length === 0) {
        // 無 GIF 時，直接輸出主影片
        ffmpegArgs = [
          '-y',
          '-i', videoFileName,
          '-preset', 'fast',
          '-t', `${videoDuration}`,
          '-copyts', // 複製原始時間戳
          'output.mp4',
        ];
        console.log('無 GIF，直接執行 FFmpeg 命令：', ffmpegArgs.join(' '));
      } else {
        // 處理 GIF：此範例僅處理第一個 GIF
        const gif = gifs[0];
        const gifFileName = 'gif0.gif';
        console.log(`寫入 GIF [0] :`, gif.url);
        const gifData = await fetchFile(gif.url);
        await ffmpeg.writeFile(gifFileName, gifData);
  
        const gifDuration = await getGifDuration(gif.url);
        if (!gifDuration) {
          throw new Error('無法獲取 GIF 的時長');
        }
        console.log(`GIF 時長: ${gifDuration} 秒`);
  
        // 在 overlay 濾鏡中加上 enable 條件，控制 GIF 出現與消失的時間
        // 請確保 gif.startTime 與 gif.endTime 為以秒為單位的數值
        const filterComplex = `[0:v][1:v] overlay=100:100:enable='between(t,${gif.startTime},${gif.endTime})' [out]`;
        console.log('filter_complex:', filterComplex);
  
        // 使用 -stream_loop -1 讓 GIF 無限循環，再用 -t 截斷輸出影片時長
        ffmpegArgs = [
          '-y',
          '-i', videoFileName,
          '-ignore_loop', '0',
          '-stream_loop', '-1',
          '-i', gifFileName,
          '-filter_complex', filterComplex,
          '-map', '[out]',
          '-preset', 'fast',
          '-t', `${videoDuration}`,
          '-copyts', // 複製原始時間戳
          '-vsync', 'vfr',
          'output.mp4',
        ];
        console.log('即將執行 FFmpeg 命令：', ffmpegArgs.join(' '));
      }
      
      await ffmpeg.exec(ffmpegArgs);
      console.log('FFmpeg 執行完畢，開始檢查輸出。');
      
      stopLocalDecoding();
      
      let data;
      try {
        data = await ffmpeg.readFile('output.mp4');
        console.log('讀取 output.mp4 完成，大小:', data.byteLength, 'bytes');
      } catch (error) {
        console.error('未找到 output.mp4 或讀取失敗：', error);
        alert('輸出檔案未生成，請查看 Console 日誌。');
        return;
      }
      
      const url = URL.createObjectURL(new Blob([data.buffer], { type: 'video/mp4' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'output.mp4';
      a.click();
      
      console.log('影片下載連結已觸發。');
      alert('视频导出成功！');
    } catch (error) {
      console.error('導出過程中發生錯誤:', error);
      if (error.message?.includes('terminated')) {
        alert('已取消匯出或 FFmpeg 被中途終止。');
      } else {
        alert(`导出视频失败: ${error.message}`);
      }
    } finally {
      console.log('======== 輸出影片流程結束 ========');
      setRealRatio(1);
      stopLocalDecoding();
      setIsExporting(false);
      setFfmpegInstance(null);
    }
  };
  
  // 進度百分比直接使用 FFmpeg 回報的 ratio
  const displayProgress = realRatio * 100;
  
  return (
    <div className="App">
      <div className="button-container">
        <button onClick={() => document.getElementById('video-upload').click()} disabled={isExporting}>
          上傳影片
        </button>
        <button onClick={() => alert('請選擇 GIF')} disabled={isExporting}>
          選擇 GIF
        </button>
        <button onClick={handleDeleteVideo} disabled={isExporting}>
          刪除影片
        </button>
        <button onClick={handleExportVideo} disabled={isExporting}>
          輸出影片
        </button>
        <input
          id="video-upload"
          type="file"
          accept="video/*"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files[0];
            if (file) {
              const url = URL.createObjectURL(file);
              setVideoUrl(url);
            }
          }}
        />
      </div>
  
      {isExporting && (
        <div className="modal-backdrop">
          <div className="modal-content">
            <h3>正在匯出影片中...</h3>
            <p>進度：{displayProgress.toFixed(2)}%</p>
            <p>FFmpeg 處理時間：{ffmpegTime.toFixed(2)} 秒</p>
            <button onClick={handleCancelExport}>取消</button>
          </div>
        </div>
      )}
  
      <div className="app-container" style={{ display: 'flex' }}>
        <div className="video-container" style={{ flex: 1, position: 'relative', width: '640px', height: '360px' }}>
          {videoUrl && (
            <VideoPlayer
              videoUrl={videoUrl}
              onTimeUpdate={setCurrentTime}
              onDurationLoaded={handleVideoLoaded}
            />
          )}
          {gifs.map((gif) => (
            <GifOverlay
              key={gif.id}
              gif={gif}
              currentTime={currentTime}
              videoDuration={videoDuration}
              onUpdate={(newGif) => setGifs(gifs.map((g) => (g.id === newGif.id ? newGif : g)))}
              onSelect={handleSelectGif}
              isSelected={selectedGifId === gif.id}
            />
          ))}
        </div>
  
        <GifControls
          gifs={gifs}
          selectedGifId={selectedGifId}
          videoDuration={videoDuration}
          onUpdate={(updatedGif) => setGifs(gifs.map((g) => (g.id === updatedGif.id ? updatedGif : g)))}
        />
      </div>
  
      <GifSearch
        onSelectGif={(gifUrl) => {
          const newGif = {
            id: Date.now(),
            url: gifUrl,
            startTime: 0, // 設定 GIF 出現的起始時間（秒）
            endTime: videoDuration, // 設定 GIF 消失的時間，這裡假設全程顯示，您可根據需要調整
            transform: { x: 100, y: 100, scale: 1, rotate: 0 },
          };
          setGifs([...gifs, newGif]);
          setSelectedGifId(newGif.id);
        }}
      />
  
      <video
        ref={hiddenVideoRef}
        src={videoUrl || null}
        style={{ width: '1px', height: '1px', opacity: 0 }}
        onTimeUpdate={handleLocalVideoTimeUpdate}
        onLoadedMetadata={() => {
          if (hiddenVideoRef.current) {
            hiddenVideoRef.current.playbackRate = 4.0;
          }
        }}
      />
    </div>
  );
};

export default App;
