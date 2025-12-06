const TorrentSearchApi = require('torrent-search-api');

// Enable providers (You can add 'ThePirateBay', 'Rarbg', etc.)
TorrentSearchApi.enableProvider('1337x');
TorrentSearchApi.enableProvider('Yts');

async function searchMovies(query) {
  try {
    // Search for movies, limit to top 5
    const torrents = await TorrentSearchApi.search(query, 'Movies', 5);
    
    // Filter results that have at least 1 seed
    return torrents.filter(t => t.seeds > 0).map(t => ({
      title: t.title,
      size: t.size,
      seeds: t.seeds,
      source: t.provider,
      magnet: null, // We fetch this later to save time
      data: t // Raw data needed to fetch magnet
    }));
  } catch (err) {
    console.error("Search Error:", err.message);
    return [];
  }
}

async function getMagnet(torrent) {
  try {
    return await TorrentSearchApi.getMagnet(torrent.data);
  } catch (err) {
    return null;
  }
}

module.exports = { searchMovies, getMagnet };