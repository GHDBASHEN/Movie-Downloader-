const mongoose = require('mongoose');

const MovieSchema = new mongoose.Schema({
  title: { type: String, required: true, index: true },
  year: String,
  imdb_rating: String,
  quality: String,      // e.g., "1080p WebRip"
  size: String,         // e.g., "2.1 GB"
  file_id: String,      // Telegram File ID (For instant forwarding)
  message_id: Number,   // Message ID in Storage Channel
  caption: String,
  request_count: { type: Number, default: 1 },
  created_at: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Movie', MovieSchema);