import { Schema, model } from 'mongoose';

const paymentSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    orderId: { type: Schema.Types.ObjectId, ref: 'Order', required: true },
    amount: { type: Number, required: true },
    status: { type: String, enum: ['Pending', 'Succeeded', 'Failed'], default: 'Pending' },
    idempotencyKey: { type: String, required: true },
  },
  { timestamps: true },
);
paymentSchema.index({ userId: 1, idempotencyKey: 1 }, { unique: true });
paymentSchema.index({ orderId: 1 }, { unique: true, partialFilterExpression: { status: 'Pending' } });

export const Payment = model('Payment', paymentSchema);
