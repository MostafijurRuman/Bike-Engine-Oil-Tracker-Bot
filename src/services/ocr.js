import { createWorker } from 'tesseract.js';
import sharp from 'sharp';

// Force OCR to English only
const DEFAULT_LANG = 'eng';

const bengaliToArabic = {
  '\u09E6': '0',
  '\u09E7': '1',
  '\u09E8': '2',
  '\u09E9': '3',
  '\u09EA': '4',
  '\u09EB': '5',
  '\u09EC': '6',
  '\u09ED': '7',
  '\u09EE': '8',
  '\u09EF': '9',
};

const bengaliDigitRange = /[\u09E6-\u09EF]/g;

let workerPromise;

async function getWorker() {
  if (workerPromise) {
    return workerPromise;
  }

  workerPromise = (async () => {
    // Tesseract v7 initializes and loads languages via createWorker
    const worker = await createWorker(DEFAULT_LANG, undefined, { logger: () => {} });
    return worker;
  })();

  return workerPromise;
}

function normalizeDigits(text) {
  if (!text) {
    return '';
  }

  return text
    .replace(bengaliDigitRange, (digit) => bengaliToArabic[digit] ?? digit)
    .replace(/[^\d]/g, ' ')
    .trim();
}

function pickOdometerValue(numbers) {
  const plausible = numbers.filter((n) => n >= 0 && n <= 300000);
  if (!plausible.length) {
    return null;
  }

  plausible.sort((a, b) => b - a);
  return plausible[0];
}

export async function detectOdometerKm(imageBuffer) {
  const processed = await sharp(imageBuffer)
    .rotate()
    .resize({ width: 1280, height: 1280, fit: 'inside' })
    .greyscale()
    .normalise()
    .toBuffer();

  const worker = await getWorker();
  const { data } = await worker.recognize(processed);

  const rawText = data?.text ?? '';
  const normalized = normalizeDigits(rawText);
  const candidates = normalized
    ? normalized
        .split(/\s+/)
        .filter(Boolean)
        .map((token) => parseInt(token, 10))
        .filter(Number.isFinite)
    : [];

  const km = pickOdometerValue(candidates);

  return { km, rawText, candidates };
}
