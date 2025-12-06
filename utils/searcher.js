const TorrentSearchApi = require('torrent-search-api');

// 1. Enable ALL public providers (ThePirateBay, Kickass, 1337x, etc.)
// This increases the chance of finding a working site.
TorrentSearchApi.enablePublicProviders();

async function searchMovies(query) {
  try {
    console.log(`🔎 Active Providers: ${TorrentSearchApi.getActiveProviders().map(p => p.name).join(', ')}`);
    
    // 2. Search "All" categories instead of just 'Movies' to avoid category mismatch errors
    // We fetch 20 results to increase chances of finding good seeds
    const torrents = await TorrentSearchApi.search(query, 'All', 20);
    
    console.log(`✅ Raw Results found: ${torrents.length}`);

    // 3. Filter results: Must have seeds & be a video file
    const filtered = torrents.filter(t => {
      // Basic check to see if it looks like a movie file or folder
      const isVideo = /1080p|720p|480p|BluRay|WEBRip|H.264|x265/i.test(t.title);
      return t.seeds > 0 && isVideo;
    });

    return filtered.map(t => ({
      title: t.title,
      size: t.size,
      seeds: t.seeds,
      source: t.provider,
      magnet: null, 
      data: t 
    }));

  } catch (err) {
    console.error("❌ Search Error:", err.message);
    return [];
  }
}

async function getMagnet(torrent) {
  try {
    return await TorrentSearchApi.getMagnet(torrent.data);
  } catch (err) {
    console.error("Magnet Fetch Error:", err.message);
    return null;
  }
}

module.exports = { searchMovies, getMagnet };