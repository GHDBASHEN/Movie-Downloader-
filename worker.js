require('dotenv').config();
const WebTorrent = require('webtorrent');
const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const Movie = require('./models/Movie');

const [magnetURI, userChatId, movieTitle] = process.argv.slice(2);

// Connect DB
mongoose.connect(process.env.MONGO_URI);

const client = new WebTorrent();
const session = new StringSession(process.env.SESSION_STRING);

// 1. Connection Settings (Optimized for Upload Stability)
const telegram = new TelegramClient(session, parseInt(process.env.API_ID), process.env.API_HASH, { 
    connectionRetries: 10,
    useWSS: true, // Secure WebSockets (Fix for ISP blocks)
    autoReconnect: true,
});

(async () => {
  try {
    console.log("🔄 Worker connecting to Telegram...");
    await telegram.connect();
    console.log("✅ Worker connected!");
    
    // 2. Download Torrent
    client.add(magnetURI, { path: './downloads' }, (torrent) => {
      console.log(`⬇️ Downloading: ${movieTitle}`);
      
      torrent.on('done', async () => {
        console.log("✅ Download Finished. Finding video file...");
        
        // Find largest video file
        const file = torrent.files.find(f => f.name.endsWith('.mp4') || f.name.endsWith('.mkv') || f.name.endsWith('.avi'));
        
        if (!file) {
           console.error("❌ No video file found.");
           if (process.send) process.send({ status: 'error', error: 'No video file found.' });
           process.exit();
        }

        const filePath = path.join('./downloads', file.path);
        const fileSizeMB = (file.length / 1024 / 1024).toFixed(2);
        
        console.log(`📤 Starting Upload: ${file.name} (${fileSizeMB} MB)`);

        try {
          // 3. ROBUST UPLOAD CONFIGURATION (Fix for FILE_PARTS_INVALID)
          const uploadedMsg = await telegram.sendFile(process.env.STORAGE_CHANNEL_ID, {
            file: filePath,
            caption: `🎬 ${movieTitle}\n📏 Size: ${fileSizeMB} MB`,
            forceDocument: true,
            // --- CRITICAL SETTINGS BELOW ---
            partSizeKB: 512, // Smaller chunks = More stable upload
            workers: 1,      // Single thread upload prevents part mixing errors
            progressCallback: (progress) => {
                const percent = Math.round(progress * 100);
                // Log every 10% to keep logs clean
                if (percent % 10 === 0) console.log(`📤 Uploading: ${percent}%`);
            }
          });

          console.log("✅ Upload Complete!");

          // 4. Create PENDING record
          await Movie.create({
            title: movieTitle,
            file_id: "PENDING_BOT_MUST_READ_CHANNEL", 
            message_id: uploadedMsg.id,
            quality: "Auto-Download"
          });

          // 5. Cleanup
          fs.unlinkSync(filePath); 
          
          if (process.send) process.send({ status: 'success', message_id: uploadedMsg.id });
          process.exit();

        } catch (err) {
          console.error("❌ Upload Error:", err);
          if (process.send) process.send({ status: 'error', error: err.message });
          process.exit();
        }
      });
      
      // Log Torrent Progress
      torrent.on('download', (bytes) => {
          // Optional: You can log torrent progress here if needed
      });
    });

  } catch (e) {
    console.error("❌ Worker Error:", e);
    if (process.send) process.send({ status: 'error', error: e.message });
    process.exit();
  }
})();