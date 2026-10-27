import mongoose from 'mongoose';

export const MOOD_IDS = ['none', 'happy', 'focused', 'sleepy', 'celebrating', 'busy', 'chilling', 'love'];

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 60 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    avatar: { type: String, default: '' },
    bio: { type: String, default: '', maxlength: 140 },
    mood: { type: String, enum: MOOD_IDS, default: 'none' },
    lastSeen: { type: Date, default: null },
  },
  { timestamps: true }
);

export const User = mongoose.model('User', userSchema);
