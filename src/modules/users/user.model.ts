import { Schema, model } from 'mongoose';

export const User = model(
  'User',
  new Schema({
    email: { type: String, required: true, unique: true, lowercase: true }, // login lookup
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
  }),
);
