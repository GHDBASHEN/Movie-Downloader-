require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const { fork } = require('child_process');
const { searchMovies, getMagnet } = require('./utils/searcher');
const Movie = require('./models/Movie');

// --- DATABASE CONNECTION ---
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 5000 });
    console.log('✅ MongoDB Connected Successfully');
  } catch (err) {
    console.error('❌ MongoDB Connection Error:', err.message);
  }
};
connectDB();

const bot = new Telegraf(process.env.BOT_TOKEN);

// --- CACHES ---
const torrentCache = new Map(); 
const paginationCache = new Map();

// --- HELPER: Pagination Message ---
function getPage(chatId, pageIndex) {
    const session = paginationCache.get(chatId);
    if (!session) return null;

    const RESULTS_PER_PAGE = 20;
    const start = pageIndex * RESULTS_PER_PAGE;
    const totalPages = Math.ceil(session.results.length / RESULTS_PER_PAGE);
    const pageItems = session.results.slice(start, start + RESULTS_PER_PAGE);

    let messageText = `🔎 <b>Results for "${session.query}"</b>\n`;
    messageText += `📄 <i>Page ${pageIndex + 1} of ${totalPages}</i>\n\n`;

    const buttons = [];
    pageItems.forEach((t, index) => {
        const globalIndex = start + index + 1;
        const id = uuidv4().split('-')[0];
        torrentCache.set(id, t);
        
        messageText += `<b>${globalIndex}.</b> ${t.title}\n`;
        messageText += `   💿 ${t.size} | 🟢 S:${t.seeds} | ⚙️ ${t.source}\n\n`;

        buttons.push(Markup.button.callback(`⬇️ ${globalIndex}`, `dl_${id}`));
    });

    // Arrange buttons in rows of 4
    const keyboard = [];
    let tempRow = [];
    buttons.forEach((btn, i) => {
        tempRow.push(btn);
        if (tempRow.length === 4 || i === buttons.length - 1) {
            keyboard.push(tempRow);
            tempRow = [];
        }
    });

    // Navigation Buttons
    const navRow = [];
    if (pageIndex > 0) navRow.push(Markup.button.callback('⬅️ Prev', `page_${pageIndex - 1}`));
    if (pageIndex < totalPages - 1) navRow.push(Markup.button.callback('Next ➡️', `page_${pageIndex + 1}`));
    if (navRow.length > 0) keyboard.push(navRow);

    return { text: messageText, keyboard: keyboard };
}

// 1. Start Command
bot.start((ctx) => ctx.reply("👋 Welcome! \n\n🔹 Type a Movie Name to search.\n🔹 OR Paste a Magnet Link to download directly."));

// 2. Indexer (Updates DB when worker uploads)
bot.on('channel_post', async (ctx) => {
  if (ctx.chat.id.toString() !== process.env.STORAGE_CHANNEL_ID) return;
  const video = ctx.channelPost.video || ctx.channelPost.document;
  if (!video) return;

  try {
    const pending = await Movie.findOne({ file_id: "PENDING_BOT_MUST_READ_CHANNEL" }).sort({ created_at: -1 });
    if (pending) {
        pending.file_id = video.file_id;
        pending.message_id = ctx.channelPost.message_id;
        pending.quality = "HD (Auto)"; 
        await pending.save();
        console.log(`✅ Indexed: ${pending.title}`);
    }
  } catch (err) { console.error(err); }
});

// 3. MAIN HANDLER (Text or Magnet Link)
bot.on('text', async (ctx) => {
  const text = ctx.message.text.trim();
  if (text.startsWith('/')) return; 

  // --- OPTION A: CHECK FOR MAGNET LINK ---
  // Regex looks for "magnet:?xt=..." pattern
  if (text.match(/^magnet:\?xt=urn:[a-z0-9]+:[a-z0-9]{32,40}/i)) {
      
      await ctx.reply("🔗 <b>Magnet Link Detected!</b>\nStarting download...", { parse_mode: 'HTML' });
      
      // Spawn Worker Immediately
      // We pass "User Link" as title because we don't know the real name yet
      const child = fork('./worker.js', [text, ctx.chat.id, "User Link Download"]);

      child.on('message', async (msg) => {
        if (msg.status === 'success') {
           try {
               await ctx.telegram.forwardMessage(ctx.chat.id, process.env.STORAGE_CHANNEL_ID, msg.message_id);
               ctx.reply("✅ <b>Here is your file!</b>", { parse_mode: 'HTML' });
           } catch (err) {
               ctx.reply("✅ Upload complete. Check the channel.");
           }
        } else if (msg.status === 'error') {
          ctx.reply(`⚠️ Download Failed: ${msg.error}`);
        }
        child.kill(); 
      });
      return; // Stop here, don't search
  }

  // --- OPTION B: NORMAL SEARCH ---
  await ctx.reply(`🔎 Searching web for "${text}" (fetching 100+ results)...`);
  
  const results = await searchMovies(text);

  if (results.length === 0) return ctx.reply("❌ No movies found.");

  // Save results to cache
  paginationCache.set(ctx.chat.id, { query: text, results: results });

  // Show Page 0
  const pageData = getPage(ctx.chat.id, 0);
  ctx.reply(pageData.text, { 
      parse_mode: 'HTML', 
      disable_web_page_preview: true,
      ...Markup.inlineKeyboard(pageData.keyboard) 
  });
});

// 4. Pagination Handler
bot.action(/^page_(\d+)$/, async (ctx) => {
    const pageIndex = parseInt(ctx.match[1]);
    const pageData = getPage(ctx.chat.id, pageIndex);
    if (!pageData) return ctx.reply("⚠️ Expired.");

    try {
        await ctx.editMessageText(pageData.text, {
            parse_mode: 'HTML',
            disable_web_page_preview: true,
            ...Markup.inlineKeyboard(pageData.keyboard)
        });
    } catch (e) {}
});

// 5. Download Button Handler
bot.action(/^dl_(.+)$/, async (ctx) => {
  const id = ctx.match[1];
  const torrent = torrentCache.get(id);
  
  if (!torrent) return ctx.reply("⚠️ Expired.");

  ctx.editMessageText(`♻️ Fetching Magnet for <b>${torrent.title}</b>...`, { parse_mode: 'HTML' });
  const magnet = await getMagnet(torrent);

  if (!magnet) return ctx.reply("❌ Error fetching magnet.");

  ctx.reply(`⏳ <b>Download Started!</b>\n\nMovie: ${torrent.title}\nSize: ${torrent.size}`, { parse_mode: 'HTML' });

  const child = fork('./worker.js', [magnet, ctx.chat.id, torrent.title]);

  child.on('message', async (msg) => {
    if (msg.status === 'success') {
       try {
           await ctx.telegram.forwardMessage(ctx.chat.id, process.env.STORAGE_CHANNEL_ID, msg.message_id);
           ctx.reply("✅ <b>Here is your file!</b>", { parse_mode: 'HTML' });
       } catch (err) {
           ctx.reply("✅ Upload complete.");
       }
    } else if (msg.status === 'error') {
      ctx.reply(`⚠️ Failed: ${msg.error}`);
    }
    child.kill(); 
  });
});

bot.launch();
console.log('🤖 Bot is online...');