const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const input = require('input'); 
require('dotenv').config();

const apiId = parseInt(process.env.API_ID);
const apiHash = process.env.API_HASH;
const stringSession = new StringSession(""); 

(async () => {
  console.log("🔄 Logging in to generate session string...");
  
  const client = new TelegramClient(stringSession, apiId, apiHash, { connectionRetries: 5 });
  
  await client.start({
    phoneNumber: async () => await input.text("Enter your phone number (with country code): "),
    password: async () => await input.text("Enter 2FA Password (if set): "),
    phoneCode: async () => await input.text("Enter Telegram Code: "),
    onError: (err) => console.log(err),
  });

  console.log("\n✅ LOGIN SUCCESSFUL!");
  console.log("👇 COPY THIS STRING AND PASTE INTO YOUR .env FILE AS 'SESSION_STRING':\n");
  console.log(client.session.save()); 
  console.log("\n");
  process.exit(0);
})();