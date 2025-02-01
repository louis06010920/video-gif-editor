import React, { useState, useEffect } from 'react';

const GifSearch = ({ onSelectGif }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [gifs, setGifs] = useState([]);
  const [stickers, setStickers] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);

  const fetchGifs = async (type = 'gifs') => {
    const apiKey = 'mtJ7b8kDhfiCRNxRwK5vwF6NWr4nivpc'; // 替換為你的 Giphy API Key
    const limit = 10;
    const offset = (currentPage - 1) * limit;
    const url = `https://api.giphy.com/v1/${type}/search?api_key=${apiKey}&q=${searchTerm}&limit=${limit}&offset=${offset}`;

    const response = await fetch(url);
    const data = await response.json();

    if (type === 'gifs') {
      setGifs(data.data);
    } else {
      setStickers(data.data);
    }
  };

  const handleSearch = () => {
    fetchGifs('gifs');
    fetchGifs('stickers');
  };

  useEffect(() => {
    if (searchTerm) {
      handleSearch();
    }
  }, [currentPage]);

  return (
    <div className="gif-search" style={{ padding: '10px', border: '1px solid #ccc', borderRadius: '5px', marginTop: '20px' }}>
      <input
        type="text"
        placeholder="搜尋 GIF 或 Sticker"
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        style={{ width: '100%', padding: '10px', marginBottom: '10px' }}
      />
      <button
        onClick={handleSearch}
        style={{ display: 'block', width: '100%', padding: '10px', marginBottom: '20px', cursor: 'pointer', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '5px' }}
      >
        搜尋
      </button>

      <h3>GIF 結果</h3>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
        {gifs.map((gif) => (
          <img
            key={gif.id}
            src={gif.images.fixed_height.url}
            alt={gif.title}
            style={{ width: '100px', height: '100px', cursor: 'pointer' }}
            onClick={() => onSelectGif(gif.images.fixed_height.url)}
          />
        ))}
      </div>

      <h3>Sticker 結果</h3>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
        {stickers.map((sticker) => (
          <img
            key={sticker.id}
            src={sticker.images.fixed_height.url}
            alt={sticker.title}
            style={{ width: '100px', height: '100px', cursor: 'pointer' }}
            onClick={() => onSelectGif(sticker.images.fixed_height.url)}
          />
        ))}
      </div>

      <button
        onClick={() => setCurrentPage((prev) => prev + 1)}
        style={{ marginTop: '10px', padding: '10px', cursor: 'pointer', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '5px' }}
      >
        下一頁
      </button>
    </div>
  );
};

export default GifSearch;
