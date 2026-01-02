import { User } from '../models/user.js';

export async function getOrCreateUser(telegramId) {
  let user = await User.findOne({ telegramId });
  if (!user) {
    user = await User.create({ telegramId });
  }
  return user;
}

export function isReadingPlausible(user, km) {
  if (km < 0 || km > 300000) {
    return false;
  }

  if (!user) {
    return true;
  }

  if (user.lastReadingKm != null) {
    const delta = km - user.lastReadingKm;
    if (delta < 0) {
      return false;
    }
    if (delta > 5000) {
      return false;
    }
  }

  if (user.oilStartKm != null && km < user.oilStartKm) {
    return false;
  }

  return true;
}

export async function setOilStart(telegramId, km) {
  const user = await getOrCreateUser(telegramId);
  user.oilStartKm = km;
  user.oilStartAt = new Date();
  user.lastReadingKm = km;
  user.lastReadingAt = new Date();
  await user.save();
  return user;
}

export async function updateReading(telegramId, km) {
  const user = await getOrCreateUser(telegramId);
  user.lastReadingKm = km;
  user.lastReadingAt = new Date();
  await user.save();
  return user;
}

export function kmSinceOil(user) {
  if (!user || user.oilStartKm == null || user.lastReadingKm == null) {
    return null;
  }
  return user.lastReadingKm - user.oilStartKm;
}

export async function resetUserData(telegramId) {
  const user = await getOrCreateUser(telegramId);
  user.oilStartKm = null;
  user.oilStartAt = null;
  user.lastReadingKm = null;
  user.lastReadingAt = null;
  await user.save();
  return user;
}
