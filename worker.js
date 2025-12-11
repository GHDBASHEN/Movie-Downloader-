require('dotenv').config();
const WebTorrent = require('webtorrent');
const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const Movie = require('./models/Movie');

const [magnetURI, userChatId, movieTitle] = process.argv.slice(2);

// Connect DB (Needed to create the PENDING record)
mongoose.connect(process.env.MONGO_URI);

const client = new WebTorrent();
const session = new StringSession(process.env.SESSION_STRING);
const telegram = new TelegramClient(session, parseInt(process.env.API_ID), process.env.API_HASH, { 
    connectionRetries: 5,
    useWSS: true // Fix for Sri Lanka ISPs
});

(async () => {
  try {
    await telegram.connect();
    
    // 1. Download Torrent
    client.add(magnetURI, { path: './downloads' }, (torrent) => {
      
      torrent.on('done', async () => {
        const file = torrent.files.find(f => f.name.endsWith('.mp4') || f.name.endsWith('.mkv'));
        
        if (!file) {
           process.send({ status: 'error', error: 'No video file found.' });
           process.exit();
        }

        const filePath = path.join('./downloads', file.path);
        
        try {
          // 2. Upload to Telegram
          const uploadedMsg = await telegram.sendFile(process.env.STORAGE_CHANNEL_ID, {
            file: filePath,
            caption: `🎬 ${movieTitle}\n📏 Size: ${(file.length / 1024 / 1024).toFixed(2)} MB`,
            forceDocument: true
          });

          // 3. Create PENDING record (for Indexer)
          await Movie.create({
            title: movieTitle,
            file_id: "PENDING_BOT_MUST_READ_CHANNEL", 
            message_id: uploadedMsg.id,
            quality: "Auto-Download"
          });

          // 4. CLEANUP (DELETE FROM DISK)
          // This line deletes the movie from your VPS storage
          fs.unlinkSync(filePath); 
          
          // Send Success + Message ID back to Bot
          process.send({ status: 'success', message_id: uploadedMsg.id });
          process.exit();

        } catch (err) {
          process.send({ status: 'error', error: err.message });
          process.exit();
        }
      });
    });

  } catch (e) {
    process.send({ status: 'error', error: e.message });
    process.exit();
  }
})();