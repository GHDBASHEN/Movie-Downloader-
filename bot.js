require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const { fork } = require('child_process');
const { searchMovies, getMagnet } = require('./utils/searcher');
const Movie = require('./models/Movie');

// --- DATABASE CONNECTION DEBUGGING ---
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 5000 
    });
    console.log('✅ MongoDB Connected Successfully');
  } catch (err) {
    console.error('❌ MongoDB Connection Error:', err.message);
  }
};
connectDB();

const bot = new Telegraf(process.env.BOT_TOKEN);
const searchCache = new Map(); 

// 1. Start Command
bot.start((ctx) => ctx.reply("👋 Welcome! Type a movie name (e.g. 'Inception') to search."));

// ---------------------------------------------------------
// PART 4: THE INDEXER (MISSING IN YOUR CODE)
// This listens to the Storage Channel and fixes the "PENDING" ID
// ---------------------------------------------------------
bot.on('channel_post', async (ctx) => {
  // 1. Verify it's the correct channel
  if (ctx.chat.id.toString() !== process.env.STORAGE_CHANNEL_ID) return;

  // 2. Check if it's a video/document
  const video = ctx.channelPost.video || ctx.channelPost.document;
  if (!video) return;

  const realFileId = video.file_id;
  console.log(`📥 New File Detected in Channel: ID ending in ...${realFileId.slice(-5)}`);

  try {
    // 3. Find the most recent movie that is waiting for this file
    // We sort by 'created_at: -1' to get the latest download
    const pendingMovie = await Movie.findOne({ file_id: "PENDING_BOT_MUST_READ_CHANNEL" })
                                    .sort({ created_at: -1 });

    if (pendingMovie) {
        console.log(`🔄 Linking File ID to Database for: "${pendingMovie.title}"`);
        
        // UPDATE THE RECORD
        pendingMovie.file_id = realFileId;
        pendingMovie.message_id = ctx.channelPost.message_id;
        pendingMovie.quality = "HD (Auto-Linked)"; 
        
        await pendingMovie.save();
        console.log(`✅ FIXED: "${pendingMovie.title}" is now ready for users!`);
    } else {
        console.log("⚠️ Received file, but no 'PENDING' movie found in DB to link it to.");
    }
  } catch (err) {
    console.error("Indexer Error:", err);
  }
});

// ---------------------------------------------------------

// 2. Search Handler (User types text)
bot.on('text', async (ctx) => {
  const query = ctx.message.text;
  if (query.startsWith('/')) return; 

  // A. Check Database first (Instant Delivery)
  // We explicitly check that file_id is NOT "PENDING"
  const cachedMovie = await Movie.findOne({ 
      title: { $regex: query, $options: 'i' },
      file_id: { $ne: "PENDING_BOT_MUST_READ_CHANNEL" } 
  });

  if (cachedMovie) {
    return ctx.replyWithDocument(cachedMovie.file_id, {
      caption: `🚀 <b>Instant Delivery from Cache!</b>\n\n🎬 ${cachedMovie.title}\n📊 Rating: ${cachedMovie.imdb_rating || 'N/A'}`,
      parse_mode: 'HTML'
    });
  }

  // B. If not in DB, Search Torrents
  await ctx.reply(`🔎 Searching the web for "${query}"...`);
  const results = await searchMovies(query);

  if (results.length === 0) return ctx.reply("❌ No movies found.");

  const buttons = results.map((t) => {
    const id = uuidv4().split('-')[0];
    searchCache.set(id, t);
    return [Markup.button.callback(`📥 ${t.size} | ${t.source} | S:${t.seeds}`, `dl_${id}`)];
  });

  ctx.reply(`Found ${results.length} results. Choose quality:`, Markup.inlineKeyboard(buttons));
});

// 3. Download Handler
bot.action(/^dl_(.+)$/, async (ctx) => {
  const id = ctx.match[1];
  const torrent = searchCache.get(id);
  if (!torrent) return ctx.reply("⚠️ Session expired. Search again.");

  ctx.editMessageText(`♻️ Fetching Magnet for <b>${torrent.title}</b>...`, { parse_mode: 'HTML' });
  const magnet = await getMagnet(torrent);

  if (!magnet) return ctx.reply("❌ Error fetching magnet link.");

  ctx.reply(`⏳ <b>Download Started!</b>\n\nMovie: ${torrent.title}\n\n<i>This will take time. I will send it to your DM when finished.</i>`, { parse_mode: 'HTML' });

  // Spawn Worker
  const child = fork('./worker.js', [magnet, ctx.chat.id, torrent.title]);

  child.on('message', async (msg) => {
    if (msg.status === 'success') {
       // Just notify the user. 
       // The actual File ID update happens in 'bot.on(channel_post)' above.
       ctx.reply(`✅ <b>Download Complete!</b>\n\nThe file is uploaded. Search for "${torrent.title}" again to get it immediately.`, { parse_mode: 'HTML' });
    } else if (msg.status === 'error') {
      ctx.reply(`⚠️ Download Failed: ${msg.error}`);
    }
    child.kill(); 
  });
});

bot.launch();
console.log('🤖 Bot is online...');