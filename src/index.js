import { Telegraf, session } from 'telegraf';
import { loadEnv } from './config/env.js';
import { connectDb } from './db/connection.js';
import { detectOdometerKm } from './services/ocr.js';
import { toBengaliDigits } from './utils/numbers.js';
import {
  getOrCreateUser,
  isReadingPlausible,
  setOilStart,
  updateReading,
  kmSinceOil,
  resetUserData,
} from './services/userService.js';

const env = loadEnv();
await connectDb(env.mongoUri);

const TIME_ZONE = process.env.TZ || 'Asia/Dhaka';

const bot = new Telegraf(env.botToken);

bot.use(session());
bot.use((ctx, next) => {
  ctx.session ??= {};
  return next();
});

const OIL_THRESHOLDS = {
  warning: 800,
  critical: 1000,
};

bot.start(async (ctx) => {
  await ctx.reply(
    'হ্যালো! আমি আপনার বাইকের ইঞ্জিন অয়েলের হিসাব রাখব। /new_oil লিখে নতুন ইঞ্জিন অয়েলের শুরু কিলোমিটার সেট করুন, তারপর মিটারের পরিষ্কার ছবি পাঠান। ছবির বদলে চাইলে /km 12345 লিখে কিলোমিটার পাঠাতে পারেন।'
  );
});

bot.command('new_oil', async (ctx) => {
  ctx.session.awaitingOilStart = true;
  await ctx.reply('ঠিক আছে! নতুন ইঞ্জিন অয়েলের শুরু ধরতে মিটারের পরিষ্কার ছবি পাঠান অথবা /km 12345 লিখে কিলোমিটার পাঠান।');
});

bot.command('reset', async (ctx) => {
  const telegramId = String(ctx.from.id);
  await resetUserData(telegramId);
  ctx.session.awaitingOilStart = false;
  await ctx.reply('আপনার ইঞ্জিন অয়েল ও মিটারের তথ্য রিসেট করা হয়েছে। নতুন করে শুরু করতে /new_oil লিখে কিলোমিটার দিন।');
});

bot.command(['km', 'reading'], async (ctx) => {
  const telegramId = String(ctx.from.id);
  const awaitingOilStart = Boolean(ctx.session?.awaitingOilStart);
  const km = parseKmFromText(ctx.message?.text);

  if (!Number.isFinite(km)) {
    await ctx.reply('দয়া করে /km 12345 এর মতো একটি কিলোমিটার লিখুন।');
    return;
  }

  const user = await getOrCreateUser(telegramId);

  if (!isReadingPlausible(user, km)) {
    await ctx.reply('এই রিডিংটা আগেরটার সাথে মেলে না। একটু দেখে সঠিক কিলোমিটার পাঠাবেন?');
    return;
  }

  if (awaitingOilStart) {
    const record = await setOilStart(telegramId, km);
    ctx.session.awaitingOilStart = false;
    await ctx.reply(
      `ইঞ্জিন অয়েলের শুরুর কিলোমিটার ${formatKm(km)} ধরে রাখলাম। সময়: ${formatDateTime(record.oilStartAt)}। এরপর যেকোনো সময় নতুন ছবি বা /km দিলে আপডেট জানাব।`
    );
    return;
  }

  if (user.oilStartKm == null) {
    await ctx.reply('আগে /new_oil দিয়ে ইঞ্জিন অয়েলের শুরুর কিলোমিটার সেট করুন, তারপর /km বা ছবি পাঠান।');
    return;
  }

  const updated = await updateReading(telegramId, km);
  const distance = kmSinceOil(updated);
  const status = computeOilStatus(distance);

  await ctx.reply(buildStatusMessage({
    kmReading: km,
    distance,
    status,
    startAt: updated.oilStartAt,
    updatedAt: updated.lastReadingAt,
  }));
});

bot.on('photo', async (ctx) => {
  const telegramId = String(ctx.from.id);
  const awaitingOilStart = Boolean(ctx.session?.awaitingOilStart);

  try {
    const photoSizes = ctx.message.photo;
    if (!photoSizes?.length) {
      await ctx.reply('ছবিটি পেলাম না। আবার পাঠাবেন?');
      return;
    }

    const bestPhoto = photoSizes[photoSizes.length - 1];
    const fileUrl = await ctx.telegram.getFileLink(bestPhoto.file_id);
    const imageBuffer = await downloadFileBuffer(fileUrl.toString());

    const { km } = await detectOdometerKm(imageBuffer);
    if (km == null) {
      await ctx.reply('দুঃখিত, মিটারের সংখ্যা পড়তে পারলাম না। একটু বেশি আলো বা পরিষ্কার ফোকাস দিয়ে আবার পাঠাবেন?');
      return;
    }

    const user = await getOrCreateUser(telegramId);
    if (!isReadingPlausible(user, km)) {
      await ctx.reply('এই রিডিংটা আগেরটার সাথে মেলে না। একটু কাছ থেকে বা পরিষ্কার ছবি পাঠাবেন?');
      return;
    }

    if (awaitingOilStart) {
      const record = await setOilStart(telegramId, km);
      ctx.session.awaitingOilStart = false;
      await ctx.reply(
        `ইঞ্জিন অয়েলের শুরুর কিলোমিটার ${formatKm(km)} ধরে রাখলাম। সময়: ${formatDateTime(record.oilStartAt)}। এরপর যেকোনো সময় নতুন ছবি দিলে আপডেট জানাব।`
      );
      return;
    }

    if (user.oilStartKm == null) {
      await ctx.reply('আগে /new_oil দিয়ে ইঞ্জিন অয়েলের শুরুর কিলোমিটার সেট করুন, তারপর ছবি পাঠান।');
      return;
    }

    const updated = await updateReading(telegramId, km);
    const distance = kmSinceOil(updated);
    const status = computeOilStatus(distance);

    await ctx.reply(buildStatusMessage({
      kmReading: km,
      distance,
      status,
      startAt: updated.oilStartAt,
      updatedAt: updated.lastReadingAt,
    }));
  } catch (err) {
    console.error('Photo handler error', err);
    await ctx.reply('দুঃখিত, ছবিটি প্রক্রিয়া করতে সমস্যা হচ্ছে। একটু পরে চেষ্টা করুন।');
  }
});

bot.catch(async (err, ctx) => {
  console.error('Bot error', err);
  try {
    await ctx.reply('দুঃখিত, একটু সমস্যা হয়েছে। পরে আবার চেষ্টা করুন।');
  } catch (replyErr) {
    console.error('Failed to reply on error', replyErr);
  }
});

await bot.launch();
console.log('Bot started');

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

async function downloadFileBuffer(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download photo: ${response.status}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

function computeOilStatus(distanceKm) {
  if (distanceKm >= OIL_THRESHOLDS.critical) {
    return 'critical';
  }
  if (distanceKm >= OIL_THRESHOLDS.warning) {
    return 'warning';
  }
  return 'ok';
}

function buildStatusMessage({ kmReading, distance, status, startAt, updatedAt }) {
  const readingText = formatKm(kmReading);
  const distanceText = formatKm(distance);
  const startText = formatDateTime(startAt);
  const updatedText = formatDateTime(updatedAt);
  const distanceNum = Number(distance);
  const remainingKm = Number.isFinite(distanceNum)
    ? OIL_THRESHOLDS.critical - distanceNum
    : null;
  const remainingText = remainingKm == null ? '???' : formatKm(remainingKm);
  const prefix = status === 'critical' ? '🚨' : status === 'warning' ? '⚠️' : '✅';

  let statusLine = 'সব ঠিক আছে, ইঞ্জিন অয়েল নিয়ে চিন্তা নেই।';
  if (status === 'warning') {
    statusLine = 'কিলোমিটার প্রায় ১০০০-এর কাছাকাছি। সুবিধামতো ইঞ্জিন অয়েল বদলে ফেলুন।';
  } else if (status === 'critical') {
    statusLine = 'ইঞ্জিন অয়েল দ্রুত বদলানো দরকার। দেরি করবেন না।';
  }

  return `${prefix} ইঞ্জিন অয়েল স্ট্যাটাস
🏍️ বর্তমান মিটার: ${readingText} কিমি
🛢️ শুরু সময়: ${startText}
📏 ইঞ্জিন অয়েলের পর থেকে চলেছে: ${distanceText} কিমি
🚗 ভালোভাবে চালাতে পারবেন আরও: ${remainingText} কিমি
⏱️ শেষ আপডেট: ${updatedText}
${statusLine}`;
}

function formatKm(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return '???';
  }
  return toBengaliDigits(Math.round(numeric).toString());
}

function formatDateTime(value) {
  if (!value) {
    return '???';
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '???';
  }
  return toBengaliDigits(
    date.toLocaleString('en-GB', {
      timeZone: TIME_ZONE,
      hour12: false,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  );
}

function parseKmFromText(text = '') {
  const parts = text.split(/\s+/).slice(1);
  const candidate = parts.find((part) => /^-?\d+(\.\d+)?$/.test(part));
  return candidate ? Number(candidate) : NaN;
}
