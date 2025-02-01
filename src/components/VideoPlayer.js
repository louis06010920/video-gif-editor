import React, { useRef, useEffect } from 'react';

const VideoPlayer = ({ videoUrl, onTimeUpdate, onDurationLoaded }) => {
  const videoRef = useRef(null);

  useEffect(() => {
    const video = videoRef.current;
    if (video) {
      video.onloadedmetadata = () => {
        onDurationLoaded(video.duration);
      };
      video.ontimeupdate = () => {
        onTimeUpdate(video.currentTime);
      };
    }
  }, [videoUrl, onDurationLoaded, onTimeUpdate]);

  return (
    <video ref={videoRef} src={videoUrl} controls style={{ width: '100%', maxWidth: '640px' }} />
  );
};

export default VideoPlayer;
