import 'dotenv/config';

const requiredKeys = ['BOT_TOKEN', 'MONGO_URI'];

export function loadEnv() {
  const missing = requiredKeys.filter((key) => !process.env[key]);
  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  return {
    botToken: process.env.BOT_TOKEN,
    mongoUri: process.env.MONGO_URI,
    tesseractLang: process.env.TESSERACT_LANG || 'eng+ben',
  };
}
