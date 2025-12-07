require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const { fork } = require('child_process');
const { searchMovies, getMagnet } = require('./utils/searcher');
const Movie = require('./models/Movie');

// Connect Database
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ MongoDB Connected'))
  .catch(err => console.error('DB Error:', err));

const bot = new Telegraf(process.env.BOT_TOKEN);
const searchCache = new Map(); // Stores search results temporarily

// 1. Start Command
bot.start((ctx) => ctx.reply("👋 Welcome! Type a movie name (e.g. 'Inception') to search."));

bot.on('channel_post', async (ctx) => {
  // 1. Check if this post is from our Storage Channel
  const channelId = ctx.chat.id.toString();
  const envChannelId = process.env.STORAGE_CHANNEL_ID.toString();
  
  if (channelId !== envChannelId) return;

  // 2. Get the file details
  const video = ctx.channelPost.video || ctx.channelPost.document;
  if (!video) return;

  const realFileId = video.file_id;
  
  // The worker puts the Movie Title in the caption usually. 
  // We can also find the "PENDING" record by sorting by latest created.
  
  try {
    // Find the most recent movie with "PENDING" status
    const pendingMovie = await Movie.findOne({ file_id: "PENDING_BOT_MUST_READ_CHANNEL" }).sort({ created_at: -1 });

    if (pendingMovie) {
        console.log(`🔄 Updating DB for: ${pendingMovie.title}`);
        
        pendingMovie.file_id = realFileId;
        pendingMovie.message_id = ctx.channelPost.message_id;
        pendingMovie.quality = "HD (Auto)"; // Update quality if needed
        
        await pendingMovie.save();
        console.log(`✅ FIXED: "${pendingMovie.title}" is now ready for users!`);
    }
  } catch (err) {
    console.error("Indexer Error:", err);
  }
});

// 3. Download Handler (User clicks button)
bot.action(/^dl_(.+)$/, async (ctx) => {
  const id = ctx.match[1];
  const torrent = searchCache.get(id);
  if (!torrent) return ctx.reply("⚠️ Session expired. Search again.");

  ctx.editMessageText(`♻️ Fetching Magnet for <b>${torrent.title}</b>...`, { parse_mode: 'HTML' });
  const magnet = await getMagnet(torrent);

  if (!magnet) return ctx.reply("❌ Error fetching magnet link.");

  ctx.reply(`⏳ <b>Download Started!</b>\n\nMovie: ${torrent.title}\n\n<i>This will take time. I will send it to your DM when finished.</i>`, { parse_mode: 'HTML' });

  // 4. SPAWN THE WORKER
  // We run worker.js as a separate process to prevent the bot from freezing
  const child = fork('./worker.js', [magnet, ctx.chat.id, torrent.title]);

  child.on('message', async (msg) => {
    if (msg.status === 'success') {
      // Forward the file to the user from the Storage Channel
      try {
        await ctx.telegram.forwardMessage(ctx.chat.id, process.env.STORAGE_CHANNEL_ID, msg.message_id);
      } catch (e) {
        ctx.reply("✅ Upload done, but I couldn't forward it. Check the channel.");
      }
    } else if (msg.status === 'error') {
      ctx.reply(`⚠️ Download Failed: ${msg.error}`);
    }
    child.kill(); // Kill worker to free RAM
  });
});

bot.launch();
console.log('🤖 Bot is online...');