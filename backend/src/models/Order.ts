import mongoose, { Document, Schema } from 'mongoose';

export interface IOrderItem {
    _id?: mongoose.Types.ObjectId;
    product_id: mongoose.Types.ObjectId;
    variant_id?: mongoose.Types.ObjectId;
    title: string;
    image?: string;
    price: number;          // price at time of purchase (snapshot)
    discount: number;       // discount % at time of purchase
    quantity: number;
}

export interface IShippingAddress {
    street: string;
    city: string;
    state: string;
    zip: string;
    country: string;
}

export type OrderStatus = 'pending' | 'paid' | 'shipped' | 'delivered' | 'cancelled' | 'returned';
export type PaymentStatus = 'unpaid' | 'paid' | 'refunded';

export interface IOrder extends Document {
    user_id: mongoose.Types.ObjectId;
    order_items: IOrderItem[];
    shipping_address: IShippingAddress;
    subtotal: number;
    discount_amount: number;
    tax_amount: number;
    shipping_cost: number;
    total_amount: number;
    status: OrderStatus;
    payment_status: PaymentStatus;
    paymentProvider?: 'stripe' | 'paypal';
    paypalOrderId?: string;
    paypalCaptureId?: string;
    cancellation_reason?: string;
    cancelled_at?: Date;
    confirmationEmailSent?: boolean;
}

const OrderItemSchema = new Schema({
    product_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    variant_id: { type: mongoose.Schema.Types.ObjectId, default: null },
    title: { type: String, required: true },
    image: { type: String, default: '' },
    price: { type: Number, required: true },
    discount: { type: Number, default: 0 },
    quantity: { type: Number, required: true, min: 1 },
});

const ShippingAddressSchema = new Schema({
    street: { type: String, required: true },
    city: { type: String, required: true },
    state: { type: String, required: true },
    zip: { type: String, required: true },
    country: { type: String, required: true },
}, { _id: false });

const OrderSchema = new Schema(
    {
        user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        order_items: [OrderItemSchema],
        shipping_address: { type: ShippingAddressSchema, required: true },
        subtotal: { type: Number, required: true },
        discount_amount: { type: Number, default: 0 },
        tax_amount: { type: Number, default: 0 },
        shipping_cost: { type: Number, default: 0 },
        total_amount: { type: Number, required: true },
        status: {
            type: String,
            enum: ['pending', 'paid', 'shipped', 'delivered', 'cancelled', 'returned'],
            default: 'pending',
        },
        payment_status: {
            type: String,
            enum: ['unpaid', 'paid', 'refunded'],
            default: 'unpaid',
        },
        paymentProvider: {
            type: String,
            enum: ['stripe', 'paypal'],
            default: 'paypal',
        },
        paypalOrderId: { type: String },
        paypalCaptureId: { type: String },
        cancellation_reason: { type: String },
        cancelled_at: { type: Date },
        confirmationEmailSent: { type: Boolean, default: false },
    },
    { timestamps: true }
);

// Index for fast user order lookups
OrderSchema.index({ user_id: 1, createdAt: -1 });
OrderSchema.index({ status: 1 });

export const Order = mongoose.model<IOrder>('Order', OrderSchema);
