import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    telegramId: { type: String, required: true, unique: true, index: true },
    oilStartKm: { type: Number, default: null },
    oilStartAt: { type: Date, default: null },
    lastReadingKm: { type: Number, default: null },
    lastReadingAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export const User = mongoose.model('User', userSchema);
