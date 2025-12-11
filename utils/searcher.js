const TorrentSearchApi = require('torrent-search-api');

// Enable ALL public providers
TorrentSearchApi.enablePublicProviders();

async function searchMovies(query) {
  try {
    console.log(`🔎 Active Providers: ${TorrentSearchApi.getActiveProviders().map(p => p.name).join(', ')}`);
    
    // CHANGED: Limit increased from 20 to 100
    const torrents = await TorrentSearchApi.search(query, 'All', 100);
    
    console.log(`✅ Raw Results found: ${torrents.length}`);

    // Filter results
    const filtered = torrents.filter(t => {
      const isVideo = /1080p|720p|480p|BluRay|WEBRip|H.264|x265|HDR|AVI|MKV|MP4/i.test(t.title);
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