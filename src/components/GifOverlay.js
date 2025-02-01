import React, { useRef, useEffect, useState } from 'react';
import GifTimeline from './GifTimeline';

const GifOverlay = ({ gif, currentTime, videoDuration, onUpdate, onSelect, isSelected }) => {
  const containerRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [transform, setTransform] = useState(gif.transform);

  useEffect(() => {
    setTransform(gif.transform); // Sync transform with gif updates
  }, [gif.transform]);

  // Update transform origin to the center of the GIF's current position
  useEffect(() => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      containerRef.current.style.transformOrigin = `${centerX}px ${centerY}px`;
    }
  }, [transform]);

  // Handle dragging of the GIF
  const handleMouseDown = (e) => {
    e.preventDefault();
    setIsDragging(true);
    onSelect(gif.id); // Notify parent component that this GIF is selected
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;

    const deltaX = e.movementX;
    const deltaY = e.movementY;

    setTransform((prevTransform) => ({
      ...prevTransform,
      x: prevTransform.x + deltaX,
      y: prevTransform.y + deltaY,
    }));
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    onUpdate({ ...gif, transform });
  };

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    } else {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  return (
    <div
      ref={containerRef}
      className={`gif-container ${isSelected ? 'selected' : ''}`}
      style={{
        position: 'absolute',
        left: `${transform.x}px`,
        top: `${transform.y}px`,
        transform: `scale(${transform.scale}) rotate(${transform.rotate}deg)`,
        display: currentTime >= gif.startTime && currentTime <= gif.endTime ? 'block' : 'none',
        cursor: 'grab',
        zIndex: isSelected ? 11 : 10, // Highlight selected GIF
      }}
      onMouseDown={handleMouseDown}
    >
      <img src={gif.url} alt="gif-overlay" style={{ width: '100%', height: '100%' }} />
    </div>
  );
};

const GifControls = ({ gifs, selectedGifId, videoDuration, onUpdate }) => {
  const selectedGif = gifs.find((gif) => gif.id === selectedGifId);

  if (!selectedGif) return null; // Only show controls when a GIF is selected

  return (
    <div className="gif-controls" style={{ position: 'relative', marginLeft: '20px', display: 'flex', flexDirection: 'column', gap: '10px', padding: '10px', border: '1px solid #ddd', backgroundColor: '#f9f9f9', borderRadius: '5px' }}>
      <div style={{ border: '1px solid #ccc', padding: '10px', borderRadius: '5px' }}>
        <GifTimeline step={0.1} startTime={selectedGif.startTime || 0} endTime={selectedGif.endTime || videoDuration} videoDuration={videoDuration} onChange={(newStart, newEnd) => {
            onUpdate({ ...selectedGif, startTime: newStart, endTime: newEnd });
          }}
        />
        <div>
          <label>Rotate:</label>
          <input
            type="range"
            min="-360"
            max="360"
            value={selectedGif.transform.rotate}
            onChange={(e) => {
              const newRotate = parseFloat(e.target.value);
              onUpdate({ ...selectedGif, transform: { ...selectedGif.transform, rotate: newRotate } });
            }}
          />
        </div>
        <div>
          <label>Scale:</label>
          <input
            type="range"
            min="-3"
            max="3"
            step="0.1"
            value={selectedGif.transform.scale}
            onChange={(e) => {
              const newScale = parseFloat(e.target.value);
              onUpdate({ ...selectedGif, transform: { ...selectedGif.transform, scale: newScale } });
            }}
          />
        </div>
      </div>
    </div>
  );
};

export { GifOverlay, GifControls };
