import { Schema, model } from 'mongoose';

export const ORDER_STATUS = ['Pending', 'Paid', 'Cancelled', 'Failed'] as const;

// OrderItems are embedded: they are always read/written with the order and never queried on their own.
const orderSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    items: [
      {
        _id: false,
        productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
        name: String,
        price: Number, // snapshot at creation
        quantity: Number,
      },
    ],
    total: { type: Number, required: true },
    status: { type: String, enum: ORDER_STATUS, default: 'Pending' },
  },
  { timestamps: true },
);
orderSchema.index({ userId: 1, createdAt: -1 }); // GET /orders (my orders, newest first)

export const Order = model('Order', orderSchema);
