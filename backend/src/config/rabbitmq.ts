import amqplib from 'amqplib';

const AMQP_URL = process.env.RABBITMQ_URL || 'amqp://localhost:5672';

class RabbitMQConfig {
    connection: any = null;
    channel: any = null;
    private connected = false;
    private connecting = false;
    private retryTimer: NodeJS.Timeout | null = null;

    isConnected(): boolean {
        return Boolean(this.connected && this.channel);
    }

    async connect() {
        if (this.isConnected()) return;
        if (this.connecting) return;

        this.connecting = true;
        try {
            console.log('Connecting to RabbitMQ...');
            this.connection = await amqplib.connect(AMQP_URL, { timeout: 10000 });
            this.channel = await this.connection.createChannel();
            this.connected = true;
            console.log('✅ RabbitMQ Connected Successfully');

            if (this.retryTimer) {
                clearInterval(this.retryTimer);
                this.retryTimer = null;
            }

            // Connection lifecycle listeners
            this.connection.on('error', (err: any) => {
                console.error('[rabbitmq] Connection error:', err.message);
                this.handleDisconnect();
            });

            this.connection.on('close', () => {
                console.warn('[rabbitmq] Connection closed.');
                this.handleDisconnect();
            });

            // Define exchanges, queues and bindings
            await this.setupQueues();

            // ── Start all workers ───────────────────────────────────────────
            const { startOrderWorkers } = await import('../modules/orders/order.subscriber');
            await startOrderWorkers();

            const { startPaymentWorkers } = await import('../modules/payment/payment.subscriber');
            await startPaymentWorkers();

            const { startBackgroundJobWorkers } = await import('../modules/jobs/job.subscriber');
            await startBackgroundJobWorkers();

            const { startShipmentWorkers } = await import('../modules/shipping/shipment.subscriber');
            await startShipmentWorkers();

        } catch (error: any) {
            console.warn(`[rabbitmq] NOT CONNECTED - queue features degraded (${error?.message || error})`);
            this.handleDisconnect();
        } finally {
            this.connecting = false;
        }
    }

    private handleDisconnect() {
        this.connected = false;
        this.channel = null;
        this.connection = null;
        this.scheduleRetry();
    }

    private scheduleRetry() {
        if (!this.retryTimer) {
            console.log('[rabbitmq] Will retry connection in 30 seconds...');
            this.retryTimer = setInterval(() => {
                if (!this.isConnected() && !this.connecting) {
                    this.connect();
                }
            }, 30000);
        }
    }

    private async setupQueues() {
        if (!this.channel) return;

        // ── Topic exchange — routes events by pattern ────────────────────────
        await this.channel.assertExchange('ecommerce_events', 'topic', { durable: true });

        // ── Queues ──────────────────────────────────────────────────────────
        // 1. Order processing: stock reduction + email confirmation
        await this.channel.assertQueue('order_processing_queue', { durable: true });
        await this.channel.bindQueue('order_processing_queue', 'ecommerce_events', 'order.*');

        // 2. Payment events: payment.success → email + shipping trigger
        await this.channel.assertQueue('payment_queue', { durable: true });
        await this.channel.bindQueue('payment_queue', 'ecommerce_events', 'payment.*');

        // 3. Background jobs: reminders, refund emails
        await this.channel.assertQueue('background_jobs_queue', { durable: true });
        await this.channel.bindQueue('background_jobs_queue', 'ecommerce_events', 'job.*');

        // 4. Shipment events: driver assignment
        await this.channel.assertQueue('shipment_queue', { durable: true });
        await this.channel.bindQueue('shipment_queue', 'ecommerce_events', 'shipment.*');

        // 5. Shipment retry queue: messages wait 60s then re-enter shipment_queue via DLX
        //    Used when no driver is available — retry without losing FIFO order.
        await this.channel.assertExchange('shipment_retry_dlx', 'direct', { durable: true });
        await this.channel.assertQueue('shipment_retry_queue', {
            durable: true,
            arguments: {
                'x-dead-letter-exchange': 'ecommerce_events',
                'x-dead-letter-routing-key': 'shipment.created',
                'x-message-ttl': 60000, // 60 seconds before re-entering queue
            },
        });

        console.log('📬 RabbitMQ queues ready: order | payment | background_jobs | shipment | shipment_retry');
    }

    /**
     * Publishes an event to the main ecommerce exchange.
     * Safe: does not throw or block if RabbitMQ is not connected.
     * @param routingKey Event type, e.g., 'order.created', 'payment.success', 'job.send_reminder'
     * @param data Payload
     */
    async publishEvent(routingKey: string, data: any) {
        if (!this.isConnected()) {
            console.warn(`[rabbitmq] Skipped publishing ${routingKey}: NOT CONNECTED`);
            return;
        }

        try {
            this.channel.publish(
                'ecommerce_events',
                routingKey,
                Buffer.from(JSON.stringify(data)),
                { persistent: true }
            );
            console.log(`[x] Published event: ${routingKey}`, JSON.stringify(data).slice(0, 80));
        } catch (error) {
            console.error(`Failed to publish event ${routingKey}:`, error);
        }
    }
}

export const rabbitMQ = new RabbitMQConfig();
