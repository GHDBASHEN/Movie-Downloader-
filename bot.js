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

// 2. Search Handler (User types text)
bot.on('text', async (ctx) => {
  const query = ctx.message.text;
  if (query.startsWith('/')) return; // Ignore commands

  // A. Check Database first (Instant Delivery)
  const cachedMovie = await Movie.findOne({ title: { $regex: query, $options: 'i' } });
  if (cachedMovie) {
    return ctx.replyWithDocument(cachedMovie.file_id, {
      caption: `🚀 <b>Instant Delivery from Cache!</b>\n\n🎬 ${cachedMovie.title}\n📊 Rating: ${cachedMovie.imdb_rating}`,
      parse_mode: 'HTML'
    });
  }

  // B. If not in DB, Search Torrents
  await ctx.reply(`🔎 Searching the web for "${query}"...`);
  const results = await searchMovies(query);

  if (results.length === 0) return ctx.reply("❌ No movies found.");

  // Create Buttons
  const buttons = results.map((t) => {
    const id = uuidv4().split('-')[0];
    searchCache.set(id, t); // Save to memory
    return [Markup.button.callback(`📥 ${t.size} | ${t.source} | S:${t.seeds}`, `dl_${id}`)];
  });

  ctx.reply(`Found ${results.length} results. Choose quality:`, Markup.inlineKeyboard(buttons));
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