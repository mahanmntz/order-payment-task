import { Schema, model } from 'mongoose';

export const PAYMENT_STATUS = ['Pending', 'Succeeded', 'Failed'] as const;

const paymentSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    orderId: { type: Schema.Types.ObjectId, ref: 'Order', required: true },
    amount: { type: Number, required: true },
    status: { type: String, enum: PAYMENT_STATUS, default: 'Pending' },
    idempotencyKey: { type: String, required: true },
  },
  { timestamps: true },
);
paymentSchema.index({ userId: 1, idempotencyKey: 1 }, { unique: true }); // idempotency, scoped per user
paymentSchema.index({ orderId: 1 }, { unique: true, partialFilterExpression: { status: 'Pending' } }); // one in-flight payment per order

export const Payment = model('Payment', paymentSchema);
