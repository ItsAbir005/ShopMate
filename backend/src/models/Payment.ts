import mongoose, { Document, Schema } from 'mongoose';

export type PaymentStatus = 'pending' | 'successful' | 'failed' | 'refunded';

export interface IPayment extends Document {
    order_id: mongoose.Types.ObjectId;
    transaction_id: string; // PayPal Capture ID or legacy transaction ID
    amount: number;
    currency: string;
    payment_method: string;
    status: PaymentStatus;
    // timestamps will handle createdAt, updatedAt
}

const PaymentSchema = new Schema(
    {
        order_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
        transaction_id: { type: String, required: true },
        amount: { type: Number, required: true },
        currency: { type: String, required: true, default: 'usd' }, // usually 'usd' or 'inr'
        payment_method: { type: String, default: 'card' },
        status: {
            type: String,
            enum: ['pending', 'successful', 'failed', 'refunded'],
            default: 'pending',
        },
    },
    { timestamps: true }
);

// Indexes
PaymentSchema.index({ order_id: 1 });
PaymentSchema.index({ transaction_id: 1 });
PaymentSchema.index({ status: 1 });

export const Payment = mongoose.model<IPayment>('Payment', PaymentSchema);
