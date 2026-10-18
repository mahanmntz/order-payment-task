import { Schema, model } from 'mongoose';

// Prices are integer minor units to avoid float errors.
const productSchema = new Schema(
  {
    name: { type: String, required: true },
    price: { type: Number, required: true, min: 0 },
    stock: { type: Number, required: true, min: 0 }, // schema guard; the atomic filter is the real protection
    isActive: { type: Boolean, default: true },
    image: String, // URL or path; optional
  },
  { timestamps: true },
);
productSchema.index({ createdAt: -1 }); // GET /products sorted newest first

export const Product = model('Product', productSchema);
