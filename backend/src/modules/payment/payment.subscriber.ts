import { rabbitMQ } from '../../config/rabbitmq';
import { Order } from '../../models/Order';
import { User } from '../../models/User';
import { Shipment } from '../../models/Shipment';
import { ConsumeMessage } from 'amqplib';
import { sendPaymentSuccessEmail } from '../mail/mail.service';

/**
 * Listens to payment_queue for payment.success events.
 * Responsibilities:
 *   - Send payment confirmation email to user (idempotent, checks confirmationEmailSent)
 *   - Trigger shipping initiation job (idempotent, checks if shipment already exists)
 */
export const startPaymentWorkers = async () => {
    try {
        if (!rabbitMQ.channel) {
            console.warn('RabbitMQ channel not initialized for payment workers.');
            return;
        }

        console.log('💳 Starting Payment Workers...');

        await rabbitMQ.channel.consume('payment_queue', async (msg: ConsumeMessage | null) => {
            if (!msg) return;

            const routingKey = msg.fields.routingKey;
            const data = JSON.parse(msg.content.toString());

            console.log(`[⬇️] Payment Worker received: ${routingKey}`, data.orderId);

            if (routingKey === 'payment.success') {
                try {
                    // Fetch order with user info
                    const order = await Order.findById(data.orderId);
                    if (!order) {
                        console.warn(`Order ${data.orderId} not found for payment.success event.`);
                        rabbitMQ.channel.ack(msg);
                        return;
                    }

                    // Fetch user for email — only if not already sent
                    if (!order.confirmationEmailSent) {
                        const user = await User.findById(order.user_id);
                        if (user?.email && user?.notificationSettings?.email !== false) {
                            try {
                                await sendPaymentSuccessEmail(
                                    user.email,
                                    user.name,
                                    order._id.toString(),
                                    order.total_amount
                                );
                                order.confirmationEmailSent = true;
                                await order.save();
                            } catch (emailErr: any) {
                                console.error(`⚠️  Payment email failed for order ${data.orderId}:`, emailErr.message);
                            }
                        }
                    } else {
                        console.log(`ℹ️  Confirmation email already sent for order ${data.orderId}`);
                    }

                    // Avoid double work: if shipment already exists, skip publishing job.shipping_initiated
                    const existingShipment = await Shipment.findOne({ order_id: order._id });
                    if (!existingShipment) {
                        // Publish downstream job: initiate shipping
                        await rabbitMQ.publishEvent('job.shipping_initiated', {
                            orderId: order._id.toString(),
                            userId: order.user_id.toString(),
                        });
                    } else {
                        console.log(`ℹ️  Shipment already exists for order ${data.orderId}, skipping job.shipping_initiated`);
                    }

                    rabbitMQ.channel.ack(msg);
                    console.log(`✅ Payment success processed for order: ${data.orderId}`);
                } catch (error) {
                    console.error(`❌ Critical failure for payment.success ${data.orderId}:`, error);
                    rabbitMQ.channel.nack(msg, false, false); // do NOT requeue → prevents infinite loop
                }
            } else {
                rabbitMQ.channel.ack(msg);
            }
        });
    } catch (error) {
        console.error('Payment Worker Initialization Error:', error);
    }
};
