import React from 'react';

const GifTimeline = ({ startTime, endTime, videoDuration, onChange }) => {
  const handleStartChange = (e) => {
    const newStart = parseFloat(e.target.value);
    onChange(newStart, endTime);
  };

  const handleEndChange = (e) => {
    const newEnd = parseFloat(e.target.value);
    onChange(startTime, newEnd);
  };

  return (
    <div className="gif-timeline">
      <input
        type="range"
        min="0"
        max={videoDuration}
        value={startTime}
        onChange={handleStartChange}
      />
      <input
        type="range"
        min="0"
        max={videoDuration}
        value={endTime}
        onChange={handleEndChange}
      />
      <div>
        Time: {startTime.toFixed(1)}s - {endTime.toFixed(1)}s
      </div>
    </div>
  );
};

export default GifTimeline;