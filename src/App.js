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
  // 使用 FFmpeg 回報的進度 ratio (0~1)
  const [realRatio, setRealRatio] = useState(0);
  // 真實處理時間 (wall-clock 秒數)
  const [ffmpegTime, setFfmpegTime] = useState(0);

  // 隱藏 video 的參考（用於觸發播放，進度顯示僅依賴 FFmpeg 的 progress）
  const hiddenVideoRef = useRef(null);
  // 計時器 ref
  const timerRef = useRef(null);

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
    clearInterval(timerRef.current);
    setRealRatio(1);
    setIsExporting(false);
  };

  // 如果不需要用隱藏 video 的進度，可不更新進度
  const handleLocalVideoTimeUpdate = () => {
    // 此處省略，本例僅使用 FFmpeg 的進度回報
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
      corePath: "https://unpkg.com/@ffmpeg/core@0.12.10/dist/ffmpeg-core.js",
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
      
      // 記錄開始時間，並啟動計時器更新 wall‑clock 秒數
      const startTime = Date.now();
      timerRef.current = setInterval(() => {
        const elapsed = (Date.now() - startTime) / 1000;
        setFfmpegTime(elapsed);
      }, 500);
      
      startLocalDecoding();
      
      console.log('載入 FFmpeg 中...');
      await ffmpeg.load();
      console.log('FFmpeg 已成功載入。');
      
      // 使用 FFmpeg progress 事件，根據 wall‑clock 計時更新進度比例
      ffmpeg.on("progress", () => {
        if (videoDuration > 0) {
          const elapsed = (Date.now() - startTime) / 1000;
          const ratio = elapsed / videoDuration;
          const clampedRatio = Math.min(Math.max(ratio, 0), 1);
          setRealRatio(clampedRatio);
          console.log(`真實進度: ${elapsed.toFixed(2)}s, ratio=${clampedRatio}`);
        }
      });
      
      const videoFileName = 'input.mp4';
      console.log('開始寫入主影片:', videoUrl);
      await ffmpeg.writeFile(videoFileName, await fetchFile(videoUrl));
      console.log('主影片已寫入 (input.mp4)。');
      
      let ffmpegArgs;
      if (gifs.length === 0) {
        ffmpegArgs = [
          '-y',
          '-i', videoFileName,
          '-preset', 'fast',
          '-t', `${videoDuration}`,
          '-copyts',
          'output.mp4',
        ];
        console.log('無 GIF，直接執行 FFmpeg 命令：', ffmpegArgs.join(' '));
      } else {
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
  
        // 加入 enable 條件控制 GIF 出現與消失的時間（請確保 gif.startTime 與 gif.endTime 以秒為單位）
        const filterComplex = `[0:v][1:v] overlay=100:100:enable='between(t,${gif.startTime},${gif.endTime})' [out]`;
        console.log('filter_complex:', filterComplex);
  
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
          '-copyts',
          '-vsync', 'vfr',
          'output.mp4',
        ];
        console.log('即將執行 FFmpeg 命令：', ffmpegArgs.join(' '));
      }
      
      await ffmpeg.exec(ffmpegArgs);
      console.log('FFmpeg 執行完畢，開始檢查輸出。');
      
      clearInterval(timerRef.current);
      
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
      clearInterval(timerRef.current);
      setRealRatio(1);
      stopLocalDecoding();
      setIsExporting(false);
      setFfmpegInstance(null);
    }
  };
  
  // 進度百分比直接使用 FFmpeg 回報的 ratio (0~1) 乘以 100
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
            <p>處理時間：{ffmpegTime.toFixed(2)} 秒</p>
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
              onUpdate={(newGif) =>
                setGifs(gifs.map((g) => (g.id === newGif.id ? newGif : g)))
              }
              onSelect={handleSelectGif}
              isSelected={selectedGifId === gif.id}
            />
          ))}
        </div>
      
        <GifControls
          gifs={gifs}
          selectedGifId={selectedGifId}
          videoDuration={videoDuration}
          onUpdate={(updatedGif) =>
            setGifs(gifs.map((g) => (g.id === updatedGif.id ? updatedGif : g)))
          }
        />
      </div>
      
      <GifSearch
        onSelectGif={(gifUrl) => {
          const newGif = {
            id: Date.now(),
            url: gifUrl,
            startTime: 0, // 設定 GIF 出現的起始時間（秒）
            endTime: videoDuration, // 設定 GIF 消失的時間（根據需要調整）
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
