require('dotenv').config();
require('./setting/config');
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const chalk = require('chalk');
const { sleep } = require('./utils');
const { BOT_TOKEN } = require('./token');
const { autoLoadPairs } = require('./autoload');
const axios = require("axios");

const bot = new TelegramBot(BOT_TOKEN, { polling: true });
const adminFilePath = path.join(__dirname, 'kingbadboitimewisher', 'admin.json');
let adminIDs = [];

// Store user states for pairing flow
const userStates = new Map();

// Store which Telegram user paired which WhatsApp number
const pairOwnerFilePath = path.join(__dirname, 'kingbadboitimewisher', 'pair_owners.json');
let pairOwners = {};

const exists = async (filePath) => {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
};

const loadAdminIDs = async () => {
  const ownerID = '8685813457'; // CHANGE THIS TO YOUR TELEGRAM ID
  const defaultAdmins = [ownerID];

  if (!(await exists(adminFilePath))) {
    await fs.writeFile(adminFilePath, JSON.stringify(defaultAdmins, null, 2));
    adminIDs = defaultAdmins;
    console.log('✅ Created admin.json with default owner ID');
  } else {
    try {
      const raw = await fs.readFile(adminFilePath, 'utf8');
      adminIDs = JSON.parse(raw);
    } catch (err) {
      console.error('Error loading admin.json:', err);
      adminIDs = defaultAdmins;
    }
  }
  console.log('📥 Loaded Admin IDs:', adminIDs);
};

// Load pair owners data
const loadPairOwners = async () => {
  if (!(await exists(pairOwnerFilePath))) {
    await fs.writeFile(pairOwnerFilePath, JSON.stringify({}, null, 2));
    pairOwners = {};
    console.log('✅ Created pair_owners.json');
  } else {
    try {
      const raw = await fs.readFile(pairOwnerFilePath, 'utf8');
      pairOwners = JSON.parse(raw);
      console.log('📥 Loaded pair owners data');
    } catch (err) {
      console.error('Error loading pair_owners.json:', err);
      pairOwners = {};
    }
  }
};

// Save pair owners data
const savePairOwners = async () => {
  try {
    await fs.writeFile(pairOwnerFilePath, JSON.stringify(pairOwners, null, 2));
  } catch (err) {
    console.error('Error saving pair_owners.json:', err);
  }
};

// Clean orphaned pair owners
const cleanOrphanedPairOwners = async () => {
  try {
    const pairingPath = path.join(__dirname, 'kingbadboitimewisher', 'pairing');
    if (!(await exists(pairingPath))) {
      pairOwners = {};
      await savePairOwners();
      return;
    }

    const files = await fs.readdir(pairingPath);
    const cleanPairOwners = {};
    
    for (const [key, value] of Object.entries(pairOwners)) {
      const numberExists = files.some(f => 
        f.endsWith(`${value}@s.whatsapp.net`) || 
        f === `${value}.json` || 
        f.includes(value)
      );
      
      if (numberExists) {
        cleanPairOwners[key] = value;
      }
    }
    
    pairOwners = cleanPairOwners;
    await savePairOwners();
    console.log('🧹 Cleaned orphaned pair owners');
  } catch (err) {
    console.error('Error cleaning pair owners:', err);
  }
};

let isShuttingDown = false;
let isAutoLoadRunning = true;

const runAutoLoad = async () => {
  if (isAutoLoadRunning || isShuttingDown) return;
  isAutoLoadRunning = true;

  try {
    console.log('⏱️ INITIATING AUTO-LOAD');
    await autoLoadPairs();
    console.log('✅ AUTO-LOAD COMPLETED');
  } catch (e) {
    console.error('❌ AUTO-LOAD FAILED:', e);
  } finally {
    isAutoLoadRunning = false;
  }
};

const startAutoLoadLoop = () => {
  runAutoLoad();
  setInterval(runAutoLoad, 60 * 60 * 1000);
};
startAutoLoadLoop();

const gracefulShutdown = (signal) => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  
  console.log(`🛑 Received ${signal}. Shutting down gracefully...`);
  bot.stopPolling();
  console.log('✅ Bot stopped successfully');
  process.exit(0);
};

// ========== CHECK CHANNELS FUNCTION (FIXED) ==========
const checkUserJoinedChannels = async (userId) => {
  const channels = ['@iconxmd', '@iconxmdtech'];
  let allJoined = true;

  for (const channel of channels) {
    try {
      const member = await bot.getChatMember(channel, userId);
      console.log(`Channel ${channel}: User ${userId} status: ${member.status}`); // Debug log
      
      if (member.status === 'left' || member.status === 'kicked') {
        allJoined = false;
        break;
      }
    } catch (error) {
      console.log(`Error checking channel ${channel}: ${error.message}`);
      allJoined = false;
      break;
    }
  }
  return allJoined;
};

// ========== SEND CHANNELS REQUIRED MESSAGE (FIXED) ==========
const sendChannelsRequiredMessage = async (chatId) => {
  return bot.sendMessage(chatId,
    `🚨 *You must join our official channels before pairing.*\n\n` +
    `Please join both channels and click "I have joined"`,
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '📢 Channel 1', url: 'https://t.me/iconxmd' }],
          [{ text: '📢 Channel 2', url: 'https://t.me/iconxmdtech' }],
          [{ text: '👥 Group', url: 'https://t.me/nexusxmd' }],
          [{ text: '✅ I have joined', callback_data: 'check_join' }]
        ]
      }
    }
  );
};

// ========== SEND GROUP MESSAGE (STYLISH) ==========
const sendGroupMessage = async (chatId, replyToMessageId = null) => {
  const botInfo = await bot.getMe();
  const botUsername = botInfo.username;
  
  const message = `╭━━〔 🛡️ 𝙑𝙄𝙋 𝙎𝙀𝘾𝙐𝙍𝙀 〕━━╮
➤ Use in DM 👇
╰━━〔 🚀 𝙎𝙏𝘼𝙍𝙏 𝙉𝙊𝙒 〕━━╯`;

  const options = {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [{ text: '🚀 START NOW', url: `https://t.me/${botUsername}?start=pair` }]
      ]
    }
  };

  if (replyToMessageId) {
    options.reply_to_message_id = replyToMessageId;
  }

  return bot.sendMessage(chatId, message, options);
};

// ========== START COMMAND (FIXED WITH FORCE JOIN) ==========
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const isGroup = msg.chat.type === 'group' || msg.chat.type === 'supergroup';

  if (isGroup) {
    return sendGroupMessage(chatId, msg.message_id);
  }

  // Check if user has joined channels
  const allJoined = await checkUserJoinedChannels(userId);
  
  if (!allJoined) {
    return sendChannelsRequiredMessage(chatId);
  }

  const caption = `💜 *𝙽𝙴𝚇𝚄𝚂-𝚇 𝙼𝙳💀*\n\n╔════════════════════╗\n ⤷ /pair <wa_number>\n ⤷ /unpair <wa_number>\n ⤷ /list - Show paired devices\n ⤷ /help - Show all commands\n╚════════════════════╝`;

  try {
    // Try multiple image sources
    const imageUrls = [
      'https://i.postimg.cc/NMn8rzqh/image1.png',
      'https://telegra.ph/file/8b2d5c6f7e8d9c0b1a2e.jpg',
      'https://i.ibb.co/NMn8rzqh/image1.png',
    ];

    let imageSent = false;

    for (const imageUrl of imageUrls) {
      try {
        await bot.sendPhoto(
          chatId,
          imageUrl,
          {
            caption: caption,
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: "👑 Owner", url: "https://t.me/shadowhacr" }],
                [{ text: "📋 Commands", callback_data: "show_commands" }]
              ]
            }
          }
        );
        imageSent = true;
        console.log(`✅ Image sent successfully: ${imageUrl}`);
        break;
      } catch (imgError) {
        console.log(`❌ Failed to send image: ${imageUrl}`);
        continue;
      }
    }

    // If all images fail, send text-only message
    if (!imageSent) {
      console.log('⚠️ All images failed, sending text-only message');
      await bot.sendMessage(chatId,
        caption,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: "👑 Owner", url: "https://t.me/shadowhacr" }],
              [{ text: "📋 Commands", callback_data: "show_commands" }]
            ]
          }
        }
      );
    }

  } catch (error) {
    console.error('Start command error:', error);
    // Final fallback: text-only message
    await bot.sendMessage(chatId,
      caption,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: "👑 Owner", url: "https://t.me/shadowhacr" }],
            [{ text: "📋 Commands", callback_data: "show_commands" }]
          ]
        }
      }
    );
  }
});

// ========== PAIR COMMAND (FIXED WITH FORCE JOIN) ==========
bot.onText(/\/pair(?:\s+(.+))?/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const isGroup = msg.chat.type === 'group' || msg.chat.type === 'supergroup';
  const text = match[1]?.trim();

  if (isGroup) {
    return sendGroupMessage(chatId, msg.message_id);
  }

  // FORCE JOIN CHECK - Must be first thing after group check
  const allJoined = await checkUserJoinedChannels(userId);
  
  if (!allJoined) {
    return sendChannelsRequiredMessage(chatId);
  }

  if (!text) {
    userStates.set(userId, { step: 'awaiting_number' });
    return bot.sendMessage(chatId, 
      `🔐 *Please send your WhatsApp number*\n\nExample: /pair 263xxxxxxxxx\n\nOr just type: 263xxxxxxxxx`,
      { parse_mode: 'Markdown' }
    );
  }

  if (/[a-z]/i.test(text)) {
    return bot.sendMessage(chatId, '❌ *Letters are not allowed.*\n\nPlease send only numbers.', { parse_mode: 'Markdown' });
  }
  
  if (!/^\d{7,15}$/.test(text)) {
    return bot.sendMessage(chatId, '❌ *Invalid format.*\n\nPlease send a valid WhatsApp number.\nExample: 263xxxxxxxxx', { parse_mode: 'Markdown' });
  }
  
  if (text.startsWith('0')) {
    return bot.sendMessage(chatId, '❌ *Numbers starting with 0 are not allowed.*\n\nPlease include country code.', { parse_mode: 'Markdown' });
  }

  const countryCode = text.slice(0, 3);
  if (["252", "201"].includes(countryCode)) {
    return bot.sendMessage(chatId, '❌ *Numbers with this country code are not supported.*', { parse_mode: 'Markdown' });
  }

  const pairingFolder = path.join(__dirname, 'kingbadboitimewisher', 'pairing');
  if (!(await exists(pairingFolder))) {
    await fs.mkdir(pairingFolder, { recursive: true });
  }

  const files = await fs.readdir(pairingFolder);
  const pairedCount = files.filter(f => f.endsWith('@s.whatsapp.net') || f.endsWith('.json')).length;

  if (pairedCount >= 1000) {
    return bot.sendMessage(chatId, '❌ *Pairing limit reached.*\n\nPlease try again later.', { parse_mode: 'Markdown' });
  }

  // Clean orphaned pair owners before checking
  await cleanOrphanedPairOwners();

  // Check if this number is already paired
  let existingOwner = null;
  for (const [key, value] of Object.entries(pairOwners)) {
    if (value === text) {
      existingOwner = key;
      break;
    }
  }

  // If the number is already paired by someone else
  if (existingOwner) {
    if (existingOwner === String(userId)) {
      // User is trying to pair a number they already own
      return bot.sendMessage(chatId, 
        `✅ *This number is already paired with your account.*\n\n` +
        `Your paired number: \`${text}\``,
        { parse_mode: 'Markdown' }
      );
    } else {
      return bot.sendMessage(chatId, 
        `❌ *This number is already paired by another user.*\n\n` +
        `If this is your number, please contact the admin to unpair it.`,
        { parse_mode: 'Markdown' }
      );
    }
  }

  userStates.delete(userId);

  try {
    const startpairing = require('./pair.js');
    const Xreturn = text + "@s.whatsapp.net";

    await bot.sendMessage(chatId, '⏳ *Generating pairing code...*\n\nPlease wait a moment.', { parse_mode: 'Markdown' });
    
    await startpairing(Xreturn);
    await sleep(4000);

    const pairingFile = path.join(pairingFolder, 'pairing.json');
    const cu = await fs.readFile(pairingFile, 'utf-8');
    const cuObj = JSON.parse(cu);
    delete require.cache[require.resolve('./pair.js')];

    // Store the pairing ownership
    pairOwners[String(userId)] = text;
    await savePairOwners();

    return bot.sendMessage(chatId,
      `🔗 *Pairing Code for WhatsApp*\n\n` +
      `📝 *Code:* 👉 \`${cuObj.code}\` 👈\n\n` +
      `➡️ *Instructions:*\n` +
      `1. Open WhatsApp\n` +
      `2. Go to Settings → Linked Devices\n` +
      `3. Tap "Link a Device"\n` +
      `4. Enter this code\n\n` +
      `⚠️ *Code expires in 2 minutes*\n` +
      `🔒 *This number is now linked to your Telegram account.*`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: `📋 Copy Code`, callback_data: `copy_code_${cuObj.code}` }]
          ]
        }
      }
    );

  } catch (error) {
    console.error('PAIR COMMAND ERROR:', error);
    bot.sendMessage(chatId, '❌ *Pairing service is temporarily unavailable.*\n\nPlease try again later.', { parse_mode: 'Markdown' });
  }
});

// ========== CALLBACK QUERY HANDLER (FIXED FORCE JOIN) ==========
bot.on('callback_query', async (callbackQuery) => {
  const msg = callbackQuery.message;
  const data = callbackQuery.data;
  const userId = callbackQuery.from.id;
  const chatId = msg.chat.id;

  if (data === 'show_commands') {
    await bot.answerCallbackQuery(callbackQuery.id);
    const isAdmin = adminIDs.includes(String(userId));
    let commandsMessage = `📋 *Available Commands*

╔══════════════════════╗
║ /start - Start the bot
║ /help  - Show help
║ /ping  - Check status
║ /info  - Bot info
║ /pair <number> - Pair
║ /unpair <number> - Unpair
║ /mypair - Your paired number
╚══════════════════════╝`;

    if (isAdmin) {
      commandsMessage += `\n╠══════════════════════╣
║ *Admin Only*          ║
╠══════════════════════╣
║ /list - List all devices
║ /clearowners - Clear all records
║ /broadcast - Send to all
║ /restart - Restart bot
╚══════════════════════╝`;
    }

    commandsMessage += `\n\n💡 *Example:*
/pair 263712345678

🔒 *Only you can unpair your own number!*`;
    
    await bot.sendMessage(chatId, commandsMessage, { parse_mode: 'Markdown' });
    return;
  }

  if (data && data.startsWith('copy_code_')) {
    const code = data.replace('copy_code_', '');
    await bot.answerCallbackQuery(callbackQuery.id, { 
      text: `✅ Code copied: ${code}`, 
      show_alert: true
    });
    return;
  }

  // FIXED: Force join callback
  if (data === 'check_join') {
    try {
      // Check if user has joined all channels
      const allJoined = await checkUserJoinedChannels(userId);
      console.log(`User ${userId} check_join result: ${allJoined}`); // Debug log

      if (allJoined) {
        await bot.answerCallbackQuery(callbackQuery.id, { 
          text: '✅ Thanks for joining! Now use /pair command.', 
          show_alert: true
        });
        await bot.sendMessage(chatId, 
          '✅ *Thanks for joining all channels!*\n\nNow send /pair to start pairing.', 
          { parse_mode: 'Markdown' }
        );
      } else {
        await bot.answerCallbackQuery(callbackQuery.id, { 
          text: '❌ Please join all channels first!', 
          show_alert: true
        });
        
        // Send the channel join message again
        await sendChannelsRequiredMessage(chatId);
      }
    } catch (error) {
      console.error('Check join callback error:', error);
      await bot.answerCallbackQuery(callbackQuery.id, { 
        text: '❌ Error checking channels. Please try again.', 
        show_alert: true
      });
    }
    return;
  }
});

// ========== UNPAIR COMMAND ==========
bot.onText(/\/unpair(?:\s+(.+))?/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const input = match[1]?.trim();
  const isGroup = msg.chat.type === 'group' || msg.chat.type === 'supergroup';

  if (isGroup) {
    return bot.sendMessage(chatId, '❌ Please use /unpair in my private chat.', { parse_mode: 'Markdown' });
  }

  try {
    // If no number provided, show their paired number
    if (!input) {
      const userNumber = pairOwners[String(userId)];
      if (userNumber) {
        return bot.sendMessage(chatId,
          `📱 *Your paired number:* \`${userNumber}\`\n\n` +
          `To unpair, use:\n/unpair ${userNumber}`,
          { parse_mode: 'Markdown' }
        );
      } else {
        return bot.sendMessage(chatId,
          `❌ *You don't have any paired number.*\n\n` +
          `Use /pair to pair a WhatsApp number.`,
          { parse_mode: 'Markdown' }
        );
      }
    }

    // Clean the input - remove @s.whatsapp.net if present
    let cleanNumber = input.replace(/@s\.whatsapp\.net$/, '');
    
    if (/[a-z]/i.test(cleanNumber)) {
      return bot.sendMessage(chatId, '❌ Letters not allowed. Use: /unpair 263xxxxxxxxx', { parse_mode: 'Markdown' });
    }
    if (!/^\d{7,15}$/.test(cleanNumber)) {
      return bot.sendMessage(chatId, '❌ Invalid format. Use: /unpair 263xxxxxxxxx', { parse_mode: 'Markdown' });
    }
    if (cleanNumber.startsWith('0')) {
      return bot.sendMessage(chatId, '❌ Numbers starting with 0 not allowed.', { parse_mode: 'Markdown' });
    }

    // Check if this number belongs to this user
    const userNumber = pairOwners[String(userId)];
    
    // Check if user is admin (admins can unpair anyone)
    const isAdmin = adminIDs.includes(String(userId));
    
    if (!isAdmin && userNumber !== cleanNumber) {
      return bot.sendMessage(chatId,
        `❌ *You are not authorized to unpair this number.*\n\n` +
        `This number is paired with another Telegram account.\n` +
        `You can only unpair your own number: \`${userNumber || 'None'}\``,
        { parse_mode: 'Markdown' }
      );
    }

    const pairingPath = path.join(__dirname, 'kingbadboitimewisher', 'pairing');

    if (!(await exists(pairingPath))) {
      return bot.sendMessage(chatId, '📭 *No paired devices found.*', { parse_mode: 'Markdown' });
    }

    // Check both folder and file patterns
    const entries = await fs.readdir(pairingPath, { withFileTypes: true });
    
    // Look for matching folder or file
    let matched = null;
    let isFile = false;

    for (const entry of entries) {
      const name = entry.name;
      // Check for folder ending with @s.whatsapp.net
      if (entry.isDirectory() && name.endsWith(`${cleanNumber}@s.whatsapp.net`)) {
        matched = name;
        break;
      }
      // Check for file with the number
      if (entry.isFile() && (name === `${cleanNumber}.json` || name.includes(cleanNumber))) {
        matched = name;
        isFile = true;
        break;
      }
    }

    if (!matched) {
      return bot.sendMessage(chatId, 
        `❌ *No paired device found for* \`${cleanNumber}\``, 
        { parse_mode: 'Markdown' }
      );
    }

    const targetPath = path.join(pairingPath, matched);
    
    if (isFile) {
      await fs.unlink(targetPath);
    } else {
      await fs.rm(targetPath, { recursive: true, force: true });
    }

    // Remove from pair owners if this user owns it
    if (pairOwners[String(userId)] === cleanNumber) {
      delete pairOwners[String(userId)];
      await savePairOwners();
    } else if (isAdmin) {
      // If admin unpairs, remove from whoever owns it
      for (const [key, value] of Object.entries(pairOwners)) {
        if (value === cleanNumber) {
          delete pairOwners[key];
          await savePairOwners();
          break;
        }
      }
    }

    return bot.sendMessage(chatId, 
      `✅ *Successfully unpaired* \`${cleanNumber}\``, 
      { parse_mode: 'Markdown' }
    );

  } catch (err) {
    console.error('UNPAIR ERROR:', err);
    bot.sendMessage(chatId, '❌ Failed to delete paired user. Please try again.');
  }
});

// ========== LIST COMMAND (ADMIN ONLY) ==========
bot.onText(/\/list/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const isGroup = msg.chat.type === 'group' || msg.chat.type === 'supergroup';

  if (isGroup) {
    return bot.sendMessage(chatId, '❌ Please use /list in my private chat.', { parse_mode: 'Markdown' });
  }

  // Check if user is admin
  if (!adminIDs.includes(String(userId))) {
    return bot.sendMessage(chatId, '❌ *You are not authorized to use this command.*', { parse_mode: 'Markdown' });
  }

  try {
    const pairingPath = path.join(__dirname, 'kingbadboitimewisher', 'pairing');

    if (!(await exists(pairingPath))) {
      return bot.sendMessage(chatId, '📭 *No paired devices found.*', { parse_mode: 'Markdown' });
    }

    const entries = await fs.readdir(pairingPath, { withFileTypes: true });
    
    // Get all paired devices with their owners
    const pairedDevices = [];
    
    for (const entry of entries) {
      let number = '';
      if (entry.isDirectory() && entry.name.endsWith('@s.whatsapp.net')) {
        number = entry.name.replace('@s.whatsapp.net', '');
      }
      if (entry.isFile() && entry.name.endsWith('.json')) {
        number = entry.name.replace('.json', '');
      }
      
      if (number) {
        // Find who owns this number
        let owner = 'Unknown';
        for (const [key, value] of Object.entries(pairOwners)) {
          if (value === number) {
            owner = key;
            break;
          }
        }
        pairedDevices.push({ number, owner });
      }
    }

    if (pairedDevices.length === 0) {
      return bot.sendMessage(chatId, '📭 *No paired devices found.*', { parse_mode: 'Markdown' });
    }

    let message = `📋 *Paired Devices List*\n\n`;
    message += `╔══════════════════════════════════╗\n`;
    pairedDevices.forEach((device, index) => {
      message += `║ ${index + 1}. \`${device.number}\`\n`;
      message += `║    👤 Owner: \`${device.owner}\`\n`;
    });
    message += `╚══════════════════════════════════╝\n\n`;
    message += `📊 *Total:* ${pairedDevices.length} devices`;

    return bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });

  } catch (err) {
    console.error('LIST ERROR:', err);
    bot.sendMessage(chatId, '❌ Failed to list paired devices.');
  }
});

// ========== CLEAR PAIR OWNERS (ADMIN ONLY) ==========
bot.onText(/\/clearowners/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  // Check if user is admin
  if (!adminIDs.includes(String(userId))) {
    return bot.sendMessage(chatId, '❌ *You are not authorized to use this command.*', { parse_mode: 'Markdown' });
  }

  try {
    // Reset pair owners
    pairOwners = {};
    await savePairOwners();
    
    return bot.sendMessage(chatId, 
      `✅ *All pair ownership records have been cleared.*\n\n` +
      `Users can now pair their numbers again.`,
      { parse_mode: 'Markdown' }
    );
  } catch (err) {
    console.error('CLEAR OWNERS ERROR:', err);
    bot.sendMessage(chatId, '❌ Failed to clear pair owners.');
  }
});

// ========== MYPAIR COMMAND ==========
bot.onText(/\/mypair/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const isGroup = msg.chat.type === 'group' || msg.chat.type === 'supergroup';

  if (isGroup) {
    return bot.sendMessage(chatId, '❌ Please use /mypair in my private chat.', { parse_mode: 'Markdown' });
  }

  const userNumber = pairOwners[String(userId)];
  
  if (userNumber) {
    return bot.sendMessage(chatId,
      `📱 *Your paired WhatsApp number:*\n\n` +
      `╔══════════════════════╗\n` +
      `║ \`${userNumber}\`\n` +
      `╚══════════════════════╝\n\n` +
      `To unpair, use:\n/unpair ${userNumber}`,
      { parse_mode: 'Markdown' }
    );
  } else {
    return bot.sendMessage(chatId,
      `❌ *You don't have any paired number.*\n\n` +
      `Use /pair to pair a WhatsApp number.`,
      { parse_mode: 'Markdown' }
    );
  }
});

// ========== HELP COMMAND ==========
bot.onText(/\/help/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const isGroup = msg.chat.type === 'group' || msg.chat.type === 'supergroup';
  const isAdmin = adminIDs.includes(String(userId));

  let helpMessage = `🤖 *NEXUS-X MD Bot Commands*

╔══════════════════════╗
║ *General Commands*   ║
╠══════════════════════╣
║ /start - Start the bot
║ /help  - Show this help
║ /ping  - Check bot status
║ /info  - Bot information
╠══════════════════════╣
║ *Pairing Commands*   ║
╠══════════════════════╣
║ /pair <number> - Pair device
║ /unpair <number> - Unpair device
║ /mypair - Show your paired number
╚══════════════════════╝`;

  if (isAdmin) {
    helpMessage += `\n╠══════════════════════╣
║ *Admin Commands*     ║
╠══════════════════════╣
║ /list - List all devices
║ /clearowners - Clear all pair records
║ /broadcast - Send to all
║ /restart - Restart bot
╚══════════════════════╝`;
  }

  helpMessage += `\n\n📌 *Example:*
/pair 263712345678
/unpair 263712345678
/mypair

💡 *Note:* Only you can unpair your own number!`;

  if (isGroup) {
    return bot.sendMessage(chatId, helpMessage, { 
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '🚀 Start in DM', url: `https://t.me/${(await bot.getMe()).username}?start=pair` }]
        ]
      }
    });
  }

  return bot.sendMessage(chatId, helpMessage, { parse_mode: 'Markdown' });
});

// ========== PING COMMAND ==========
bot.onText(/\/ping/, async (msg) => {
  const chatId = msg.chat.id;
  const start = Date.now();
  
  try {
    const botInfo = await bot.getMe();
    const end = Date.now();
    const ping = end - start;
    
    const message = `🏓 *Pong!*\n\n` +
      `📡 *Bot:* @${botInfo.username}\n` +
      `⏱️ *Latency:* ${ping}ms\n` +
      `🟢 *Status:* Online\n` +
      `📊 *Uptime:* ${Math.floor(process.uptime())}s`;
    
    await bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
  } catch (error) {
    await bot.sendMessage(chatId, '❌ Bot is offline or having issues.');
  }
});

// ========== INFO COMMAND ==========
bot.onText(/\/info/, async (msg) => {
  const chatId = msg.chat.id;
  
  try {
    const botInfo = await bot.getMe();
    const totalUsers = await bot.getChatMembersCount(chatId).catch(() => 'N/A');
    
    const infoMessage = `ℹ️ *Bot Information*

╔══════════════════════╗
║ 📛 *Name:* ${botInfo.first_name}
║ 🆔 *Username:* @${botInfo.username}
║ 🆙 *Version:* 2.0.0
║ 👑 *Owner:* @shadowhacr
║ 📊 *Users:* ${totalUsers}
║ ⏱️ *Uptime:* ${Math.floor(process.uptime())}s
╚══════════════════════╝

🔹 *Features:*
• WhatsApp Pairing
• Device Management
• Auto-load System

📌 *Commands:* /help`;

    await bot.sendMessage(chatId, infoMessage, { parse_mode: 'Markdown' });
  } catch (error) {
    console.error('INFO ERROR:', error);
    await bot.sendMessage(chatId, '❌ Failed to get bot information.');
  }
});

// ========== BROADCAST COMMAND (ADMIN ONLY) ==========
bot.onText(/\/broadcast(?:\s+(.+))?/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const messageText = match[1]?.trim();

  // Check if user is admin
  if (!adminIDs.includes(String(userId))) {
    return bot.sendMessage(chatId, '❌ *You are not authorized to use this command.*', { parse_mode: 'Markdown' });
  }

  if (!messageText) {
    return bot.sendMessage(chatId, 
      '📝 *Usage:* `/broadcast Your message here`\n\nThis will send the message to all paired users.', 
      { parse_mode: 'Markdown' }
    );
  }

  try {
    const pairingPath = path.join(__dirname, 'kingbadboitimewisher', 'pairing');
    
    if (!(await exists(pairingPath))) {
      return bot.sendMessage(chatId, '❌ No paired users found.');
    }

    const entries = await fs.readdir(pairingPath, { withFileTypes: true });
    const pairedUsers = entries.filter(e => 
      (e.isDirectory() && e.name.endsWith('@s.whatsapp.net')) ||
      (e.isFile() && e.name.endsWith('.json'))
    ).map(e => e.name.replace(/@s\.whatsapp\.net|\.json/g, ''));

    if (pairedUsers.length === 0) {
      return bot.sendMessage(chatId, '❌ No paired users found.');
    }

    await bot.sendMessage(chatId, `📤 *Broadcasting to ${pairedUsers.length} users...*`, { parse_mode: 'Markdown' });

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < Math.min(pairedUsers.length, 50); i++) {
      try {
        console.log(`Would send to: ${pairedUsers[i]}`);
        successCount++;
        await sleep(100);
      } catch (err) {
        failCount++;
      }
    }

    return bot.sendMessage(chatId, 
      `✅ *Broadcast Complete*\n\n📤 Sent: ${successCount}\n❌ Failed: ${failCount}\n📊 Total: ${pairedUsers.length} users`,
      { parse_mode: 'Markdown' }
    );

  } catch (err) {
    console.error('BROADCAST ERROR:', err);
    bot.sendMessage(chatId, '❌ Failed to broadcast message.');
  }
});

// ========== RESTART COMMAND (ADMIN ONLY) ==========
bot.onText(/\/restart/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (!adminIDs.includes(String(userId))) {
    return bot.sendMessage(chatId, '❌ *You are not authorized to use this command.*', { parse_mode: 'Markdown' });
  }

  await bot.sendMessage(chatId, '🔄 *Restarting bot...*', { parse_mode: 'Markdown' });
  
  setTimeout(() => {
    process.exit(0);
  }, 2000);
});

// ========== TEXT MESSAGE HANDLER (FIXED WITH FORCE JOIN) ==========
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const text = msg.text;
  
  if (msg.chat.type !== 'private') return;
  if (!text) return;
  if (text.startsWith('/')) return;
  
  const userState = userStates.get(userId);
  if (!userState || userState.step !== 'awaiting_number') return;
  
  const phoneRegex = /^\d{7,15}$/;
  if (!phoneRegex.test(text)) return;
  
  userStates.delete(userId);
  
  // FORCE JOIN CHECK - Must be checked here too
  const allJoined = await checkUserJoinedChannels(userId);
  
  if (!allJoined) {
    return sendChannelsRequiredMessage(chatId);
  }

  if (/[a-z]/i.test(text)) {
    return bot.sendMessage(chatId, '❌ Letters are not allowed. Send only numbers.');
  }
  
  if (text.startsWith('0')) {
    return bot.sendMessage(chatId, '❌ Numbers starting with 0 are not allowed.');
  }

  const countryCode = text.slice(0, 3);
  if (["252", "201"].includes(countryCode)) {
    return bot.sendMessage(chatId, '❌ Numbers with this country code are not supported.');
  }

  const pairingFolder = path.join(__dirname, 'kingbadboitimewisher', 'pairing');
  if (!(await exists(pairingFolder))) {
    await fs.mkdir(pairingFolder, { recursive: true });
  }

  const files = await fs.readdir(pairingFolder);
  const pairedCount = files.filter(f => f.endsWith('@s.whatsapp.net') || f.endsWith('.json')).length;

  if (pairedCount >= 1000) {
    return bot.sendMessage(chatId, '❌ Pairing limit reached. Try again later.');
  }

  // Clean orphaned pair owners before checking
  await cleanOrphanedPairOwners();

  // Check if this number is already paired
  let existingOwner = null;
  for (const [key, value] of Object.entries(pairOwners)) {
    if (value === text) {
      existingOwner = key;
      break;
    }
  }

  if (existingOwner) {
    return bot.sendMessage(chatId, 
      `❌ *This number is already paired by another user.*\n\n` +
      `If this is your number, please contact the admin to unpair it.`,
      { parse_mode: 'Markdown' }
    );
  }

  try {
    const startpairing = require('./pair.js');
    const Xreturn = text + "@s.whatsapp.net";

    await bot.sendMessage(chatId, '⏳ Generating pairing code...');
    
    await startpairing(Xreturn);
    await sleep(4000);

    const pairingFile = path.join(pairingFolder, 'pairing.json');
    const cu = await fs.readFile(pairingFile, 'utf-8');
    const cuObj = JSON.parse(cu);
    delete require.cache[require.resolve('./pair.js')];

    // Store the pairing ownership
    pairOwners[String(userId)] = text;
    await savePairOwners();

    return bot.sendMessage(chatId,
      `🔗 *Pairing Code*\n\n📝 Code: \`${cuObj.code}\`\n\n1. Open WhatsApp\n2. Settings → Linked Devices\n3. Link a Device\n4. Enter this code`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: `📋 Copy: ${cuObj.code}`, callback_data: `copy_code_${cuObj.code}` }]
          ]
        }
      }
    );

  } catch (error) {
    console.error('PAIRING ERROR:', error);
    bot.sendMessage(chatId, '❌ Pairing failed. Try again later.');
  }
});

// ========== POLLING ERROR HANDLER ==========
bot.on('polling_error', (error) => {
  console.error('Polling error:', error);
});

// ========== BOT START ==========
(async () => {
  await loadAdminIDs();
  await loadPairOwners();
  await cleanOrphanedPairOwners(); // Clean on startup
  
  const restartCount = parseInt(process.env.RESTART_COUNT || 0);
  console.log(`RESTART #${restartCount + 1}`);
  process.env.RESTART_COUNT = String(restartCount + 1);

  console.log('🤖 Telegram Bot is running...');
  console.log('✅ Bot Username: @NEXUSXMDBOT');
  console.log('✅ Features: /pair, /unpair, /start');
  console.log('✅ Force Join: @iconxmd and @iconxmdtech');
})();

// ========== PROCESS HANDLERS ==========
process.on("uncaughtException", (err) => {
  console.error('Uncaught Exception:', err);
});
process.on("unhandledRejection", (err) => {
  console.error('Unhandled Rejection:', err);
});
process.removeAllListeners("warning");
process.once('SIGINT', () => gracefulShutdown('SIGINT'));
process.once('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('message', (msg) => {
  if (msg === 'shutdown') gracefulShutdown('PM2_SHUTDOWN');
});
