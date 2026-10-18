import { Schema, model } from 'mongoose';

const orderSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    items: [
      {
        _id: false,
        productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
        name: String,
        price: Number, // snapshot
        quantity: Number,
      },
    ],
    total: { type: Number, required: true },
    status: { type: String, enum: ['Pending', 'Paid', 'Cancelled', 'Failed'], default: 'Pending' },
  },
  { timestamps: true },
);
orderSchema.index({ userId: 1, createdAt: -1 });

export const Order = model('Order', orderSchema);
