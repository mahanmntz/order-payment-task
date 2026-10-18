import { Schema, model } from 'mongoose';

const productSchema = new Schema(
  {
    name: { type: String, required: true },
    price: { type: Number, required: true, min: 0 },
    stock: { type: Number, required: true, min: 0 },
    isActive: { type: Boolean, default: true },
    image: String,
  },
  { timestamps: true },
);
productSchema.index({ createdAt: -1 });

export const Product = model('Product', productSchema);
