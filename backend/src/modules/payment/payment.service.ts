import { Payment } from '../../models/Payment';
import { Order } from '../../models/Order';
import { User } from '../../models/User';
import { Notification } from '../../models/Notification';
import { rabbitMQ } from '../../config/rabbitmq';
import { PayPalProvider, PayPalWebhookEventResource } from './providers/paypal.provider';
import { createShipment } from '../shipping/shipping.service';
import { sendPaymentSuccessEmail } from '../mail/mail.service';
import { logger } from '../../utils/logger';

const payPalProvider = new PayPalProvider();

export class PaymentService {
    /**
     * Run in-process post-payment actions:
     * 1. Create shipment for order if none exists (fails soft).
     * 2. Send payment confirmation email (idempotent via order.confirmationEmailSent).
     * 3. Create notification for payment (idempotent by checking existing notification).
     * 4. Publish payment.success to RabbitMQ ONLY if connected.
     * All steps wrapped in separate try/catch so failure in one never blocks the others or payment.
     */
    static async runPostPaymentProcessing(orderInput: any) {
        const orderId = orderInput?._id ? orderInput._id.toString() : orderInput?.toString();
        if (!orderId) return;

        const order = await Order.findById(orderId);
        if (!order) {
            logger.warn({ orderId }, '[payment] Order not found for post-payment processing');
            return;
        }

        // 1. Create shipment directly in-process if none exists
        try {
            await createShipment(order._id.toString());
        } catch (shipmentErr: any) {
            logger.warn({ err: shipmentErr.message, orderId: order._id }, '[shipping] In-process shipment creation failed soft');
        }

        // 2. Send confirmation email (idempotent via confirmationEmailSent)
        try {
            const freshOrder = await Order.findById(order._id);
            if (freshOrder && !freshOrder.confirmationEmailSent) {
                const user = await User.findById(order.user_id);
                if (user?.email && user?.notificationSettings?.email !== false) {
                    await sendPaymentSuccessEmail(
                        user.email,
                        user.name || 'Customer',
                        order._id.toString(),
                        order.total_amount
                    );
                }
                freshOrder.confirmationEmailSent = true;
                await freshOrder.save();
                logger.info({ orderId: order._id }, '[mail] Confirmation email sent and marked');
            }
        } catch (emailErr: any) {
            logger.warn({ err: emailErr.message, orderId: order._id }, '[mail] Post-payment confirmation email failed soft');
        }

        // 3. Create notification (idempotent by checking existing notification)
        try {
            const existingNotif = await Notification.findOne({
                type: 'GENERAL',
                relatedId: order._id,
            });
            if (!existingNotif) {
                await Notification.create({
                    type: 'GENERAL',
                    message: `Payment confirmed for Order #${order._id.toString().slice(-8).toUpperCase()} ($${order.total_amount.toFixed(2)})`,
                    relatedId: order._id,
                    metadata: {
                        orderId: order._id.toString(),
                        amount: order.total_amount,
                        userId: order.user_id.toString(),
                    },
                });
                logger.info({ orderId: order._id }, '[notification] Post-payment notification created');
            }
        } catch (notifErr: any) {
            logger.warn({ err: notifErr.message, orderId: order._id }, '[notification] Post-payment notification failed soft');
        }

        // 4. Publish payment.success to RabbitMQ if connected
        if (rabbitMQ.isConnected()) {
            try {
                await rabbitMQ.publishEvent('payment.success', {
                    orderId: order._id.toString(),
                    userId: order.user_id.toString(),
                    amount: order.total_amount,
                });
            } catch (rmqErr: any) {
                logger.warn({ err: rmqErr.message, orderId: order._id }, '[rabbitmq] Failed to publish payment.success soft');
            }
        }
    }
    // ─── Provider Accessors ───────────────────────────────────────────────────
    static getPayPalProvider(): PayPalProvider {
        return payPalProvider;
    }

    // ─── PayPal Methods ───────────────────────────────────────────────────────

    /**
     * Create PayPal Order (Auth required).
     * Server calculates amount from database order to prevent tampering.
     */
    static async createPayPalOrder(orderId: string, userId: string, isAdmin = false) {
        const order = await Order.findById(orderId);
        if (!order) throw new Error('Order not found');

        if (!isAdmin && order.user_id.toString() !== userId) {
            throw new Error('Unauthorized to pay for this order');
        }

        if (order.payment_status === 'paid') {
            throw new Error('Order is already paid');
        }

        const paymentResult = await payPalProvider.createPayment(order);

        order.paymentProvider = 'paypal';
        order.paypalOrderId = paymentResult.paypalOrderId;
        await order.save();

        logger.info({ orderId, paypalOrderId: paymentResult.paypalOrderId }, '[payment] PayPal order created');

        return {
            paypalOrderId: paymentResult.paypalOrderId,
        };
    }

    /**
     * Capture PayPal Order (Auth required).
     * Verifies order belongs to user and updates payment state. Idempotent.
     */
    static async capturePayPalOrder(paypalOrderId: string, userId: string, isAdmin = false) {
        let order = await Order.findOne({ paypalOrderId });
        if (!order) {
            // Fallback search by reference if needed
            order = await Order.findOne({ _id: paypalOrderId });
        }
        if (!order) throw new Error(`Order with PayPal order ID ${paypalOrderId} not found`);

        if (!isAdmin && order.user_id.toString() !== userId) {
            throw new Error('Unauthorized to capture payment for this order');
        }

        // Idempotency: if already paid, ensure post-processing tasks ran and return success immediately
        if (order.payment_status === 'paid') {
            await PaymentService.runPostPaymentProcessing(order);
            return {
                success: true,
                orderId: order._id.toString(),
                status: 'paid',
                alreadyPaid: true,
                captureId: order.paypalCaptureId,
            };
        }

        const captureResult = await payPalProvider.capture(paypalOrderId, order);

        if (captureResult.success) {
            order.payment_status = 'paid';
            if (order.status === 'pending') {
                order.status = 'paid';
            }
            order.paymentProvider = 'paypal';
            order.paypalCaptureId = captureResult.captureId;
            await order.save();

            logger.info({ orderId: order._id, captureId: captureResult.captureId }, '[payment] PayPal order captured');
            logger.info({ orderId: order._id, payment_status: order.payment_status, status: order.status }, '[payment] Order status updated');

            // Create or update Payment record
            await Payment.findOneAndUpdate(
                { order_id: order._id },
                {
                    order_id: order._id,
                    transaction_id: captureResult.captureId || paypalOrderId,
                    amount: order.total_amount,
                    currency: 'usd',
                    status: 'successful',
                },
                { upsert: true, new: true }
            );

            // Execute in-process post-payment tasks (shipment, email, notification, RabbitMQ if connected)
            await PaymentService.runPostPaymentProcessing(order);

            // Notify Socket.IO
            try {
                const { getIO } = await import('../../config/socket');
                getIO().to(`order:${order._id.toString()}`).emit('status:changed', {
                    status: 'paid',
                    payment_status: 'paid',
                });
            } catch {
                // Socket.io room notification
            }

            return {
                success: true,
                orderId: order._id.toString(),
                status: 'paid',
                captureId: captureResult.captureId,
            };
        }

        throw new Error(`PayPal capture failed with status: ${captureResult.status}`);
    }

    /**
     * Handle PayPal Webhook (Public, raw body signature verification).
     */
    static async handlePayPalWebhook(headers: Record<string, unknown>, rawBody: string | Buffer) {
        const verification = await payPalProvider.verifyWebhook(headers, rawBody);
        if (!verification.isValid) {
            throw new Error(`PayPal Webhook verification failed: ${verification.error || 'Invalid signature'}`);
        }

        const eventType = verification.eventType;
        const resource = (verification.resource || {}) as PayPalWebhookEventResource;

        logger.info({ eventType, resourceId: resource.id }, '[payment] PayPal webhook received');

        if (eventType === 'PAYMENT.CAPTURE.COMPLETED') {
            const captureId = resource.id;
            const customOrderId = resource.custom_id;
            const relatedOrderId = resource.supplementary_data?.related_ids?.order_id;

            let order: any = null;
            if (customOrderId) {
                order = await Order.findById(customOrderId);
            }
            if (!order && relatedOrderId) {
                order = await Order.findOne({ paypalOrderId: relatedOrderId });
            }
            if (!order && captureId) {
                order = await Order.findOne({ paypalCaptureId: captureId });
            }

            if (order) {
                if (order.payment_status === 'paid') {
                    await PaymentService.runPostPaymentProcessing(order);
                    return { received: true, message: 'Order already marked as paid' };
                }

                order.payment_status = 'paid';
                if (order.status === 'pending') {
                    order.status = 'paid';
                }
                order.paymentProvider = 'paypal';
                order.paypalCaptureId = captureId;
                await order.save();

                await Payment.findOneAndUpdate(
                    { order_id: order._id },
                    {
                        order_id: order._id,
                        transaction_id: captureId,
                        amount: order.total_amount,
                        currency: 'usd',
                        status: 'successful',
                    },
                    { upsert: true, new: true }
                );

                // Execute in-process post-payment tasks (shipment, email, notification, RabbitMQ if connected)
                await PaymentService.runPostPaymentProcessing(order);

                try {
                    const { getIO } = await import('../../config/socket');
                    getIO().to(`order:${order._id.toString()}`).emit('status:changed', {
                        status: 'paid',
                        payment_status: 'paid',
                    });
                } catch {
                    // Socket.io room notification
                }
            }
        } else if (eventType === 'PAYMENT.CAPTURE.DENIED') {
            const captureId = resource.id;
            const customOrderId = resource.custom_id;

            const order = customOrderId
                ? await Order.findById(customOrderId)
                : await Order.findOne({ paypalCaptureId: captureId });

            if (order && order.payment_status !== 'paid') {
                await Payment.findOneAndUpdate(
                    { order_id: order._id },
                    {
                        order_id: order._id,
                        transaction_id: captureId,
                        amount: order.total_amount,
                        currency: 'usd',
                        status: 'failed',
                    },
                    { upsert: true }
                );
            }
        } else if (eventType === 'PAYMENT.CAPTURE.REFUNDED') {
            const captureId = resource.id;
            const customOrderId = resource.custom_id;

            const order = customOrderId
                ? await Order.findById(customOrderId)
                : await Order.findOne({ paypalCaptureId: captureId });

            if (order) {
                if (order.payment_status !== 'refunded') {
                    order.payment_status = 'refunded';
                    order.status = 'cancelled';
                    await order.save();

                    await Payment.findOneAndUpdate(
                        { order_id: order._id },
                        { status: 'refunded' }
                    );

                    try {
                        const { getIO } = await import('../../config/socket');
                        getIO().to(`order:${order._id.toString()}`).emit('status:changed', {
                            status: 'cancelled',
                            payment_status: 'refunded',
                        });
                    } catch {
                        // Socket.io room notification
                    }
                }
            }
        }

        return { received: true, eventType };
    }

    /**
     * Admin refund for PayPal order (Admin only).
     */
    static async processPayPalRefund(orderId: string, amount?: number) {
        const order = await Order.findById(orderId);
        if (!order) throw new Error('Order not found');

        if (order.payment_status !== 'paid') {
            throw new Error('Only paid orders can be refunded');
        }

        let captureId = order.paypalCaptureId;
        if (!captureId) {
            const payment = await Payment.findOne({ order_id: order._id, status: 'successful' });
            if (payment?.transaction_id && !payment.transaction_id.startsWith('pending_')) {
                captureId = payment.transaction_id;
            }
        }

        if (!captureId) {
            throw new Error('PayPal capture ID not found on this order');
        }

        const refundResult = await payPalProvider.refund(captureId, amount || order.total_amount);

        if (refundResult.success) {
            order.payment_status = 'refunded';
            order.status = 'cancelled';
            await order.save();

            await Payment.findOneAndUpdate(
                { order_id: order._id },
                { status: 'refunded' }
            );

            await rabbitMQ.publishEvent('job.process_refund', {
                orderId: order._id.toString(),
                userId: order.user_id.toString(),
                amount: amount || order.total_amount,
            });

            try {
                const { getIO } = await import('../../config/socket');
                getIO().to(`order:${order._id.toString()}`).emit('status:changed', {
                    status: 'cancelled',
                    payment_status: 'refunded',
                });
            } catch {
                // Socket.io room notification
            }
        }

        return refundResult;
    }
}
