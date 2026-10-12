"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PayPalProvider = void 0;
const axios_1 = __importDefault(require("axios"));
const logger_1 = require("../../../utils/logger");
class PayPalProvider {
    constructor() {
        this.name = 'paypal';
        // Token caching
        this.cachedToken = null;
        this.tokenExpiryTime = 0;
        this.clientId = process.env.PAYPAL_CLIENT_ID || '';
        this.clientSecret = process.env.PAYPAL_CLIENT_SECRET || '';
        this.webhookId = process.env.PAYPAL_WEBHOOK_ID || '';
        const env = (process.env.PAYPAL_ENV || 'sandbox').toLowerCase();
        this.baseUrl = env === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
    }
    getBaseUrl() {
        return this.baseUrl;
    }
    /**
     * Retrieve OAuth2 client-credentials token and cache it until expiration.
     */
    async getAccessToken() {
        const now = Date.now();
        if (this.cachedToken && this.tokenExpiryTime > now) {
            return this.cachedToken;
        }
        if (!this.clientId || !this.clientSecret) {
            throw new Error('PayPal credentials missing: PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET are required');
        }
        const auth = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
        try {
            const response = await axios_1.default.post(`${this.baseUrl}/v1/oauth2/token`, 'grant_type=client_credentials', {
                headers: {
                    Authorization: `Basic ${auth}`,
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
            });
            const data = response.data;
            this.cachedToken = data.access_token;
            // Cache token, subtracting a 60 second safety buffer
            this.tokenExpiryTime = now + (data.expires_in - 60) * 1000;
            return this.cachedToken;
        }
        catch (error) {
            const errMessage = axios_1.default.isAxiosError(error)
                ? error.response?.data?.error_description || error.message
                : error.message;
            logger_1.logger.error({ err: errMessage }, 'Failed to obtain PayPal OAuth token');
            throw new Error(`PayPal OAuth Authentication Error: ${errMessage}`);
        }
    }
    async getClient() {
        const token = await this.getAccessToken();
        return axios_1.default.create({
            baseURL: this.baseUrl,
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
        });
    }
    /**
     * Create PayPal Order (intent CAPTURE).
     * Server calculates total from database order to prevent client tampering.
     */
    async createPayment(order) {
        const orderId = order._id.toString();
        const client = await this.getClient();
        // Calculate amount on server with 2 decimals
        const amountString = order.total_amount.toFixed(2);
        const requestId = `order-${orderId}`;
        try {
            const response = await client.post('/v2/checkout/orders', {
                intent: 'CAPTURE',
                purchase_units: [
                    {
                        reference_id: orderId,
                        custom_id: orderId,
                        description: `ShopMate Order #${orderId}`,
                        amount: {
                            currency_code: 'USD',
                            value: amountString,
                        },
                    },
                ],
            }, {
                headers: {
                    'PayPal-Request-Id': requestId,
                },
            });
            logger_1.logger.info({ orderId, paypalOrderId: response.data.id }, 'PayPal order created');
            return {
                provider: 'paypal',
                paypalOrderId: response.data.id,
            };
        }
        catch (error) {
            const errDetail = axios_1.default.isAxiosError(error)
                ? JSON.stringify(error.response?.data || error.message)
                : error.message;
            logger_1.logger.error({ orderId, err: errDetail }, 'Error creating PayPal order');
            throw new Error(`PayPal Create Order Error: ${errDetail}`);
        }
    }
    /**
     * Capture PayPal Order.
     * Completes payment only if capture status is COMPLETED.
     */
    async capture(paypalOrderId, order) {
        const client = await this.getClient();
        const requestId = `capture-${paypalOrderId}`;
        try {
            const response = await client.post(`/v2/checkout/orders/${paypalOrderId}/capture`, {}, {
                headers: {
                    'PayPal-Request-Id': requestId,
                },
            });
            const captureData = response.data;
            const capture = captureData.purchase_units?.[0]?.payments?.captures?.[0];
            const captureStatus = capture?.status || captureData.status;
            const captureId = capture?.id || captureData.id;
            const orderId = order?._id.toString() || captureData.purchase_units?.[0]?.reference_id || '';
            logger_1.logger.info({ paypalOrderId, captureStatus, captureId }, 'PayPal capture processed');
            return {
                success: captureStatus === 'COMPLETED',
                orderId,
                status: captureStatus,
                captureId,
                transactionId: captureId,
            };
        }
        catch (error) {
            const errDetail = axios_1.default.isAxiosError(error)
                ? JSON.stringify(error.response?.data || error.message)
                : error.message;
            logger_1.logger.error({ paypalOrderId, err: errDetail }, 'Error capturing PayPal order');
            throw new Error(`PayPal Capture Error: ${errDetail}`);
        }
    }
    /**
     * Refund a completed capture via POST /v2/payments/captures/{captureId}/refund.
     */
    async refund(captureId, amount) {
        const client = await this.getClient();
        const requestId = `refund-${captureId}-${Date.now()}`;
        const body = {
            note_to_payer: 'Refund from ShopMate',
        };
        if (amount !== undefined) {
            body.amount = {
                value: amount.toFixed(2),
                currency_code: 'USD',
            };
        }
        try {
            const response = await client.post(`/v2/payments/captures/${captureId}/refund`, body, {
                headers: {
                    'PayPal-Request-Id': requestId,
                },
            });
            const refundData = response.data;
            const isSuccess = refundData.status === 'COMPLETED' || refundData.status === 'PENDING';
            logger_1.logger.info({ captureId, refundId: refundData.id, status: refundData.status }, 'PayPal capture refund processed');
            return {
                success: isSuccess,
                refundId: refundData.id,
                status: refundData.status,
                amount: refundData.amount ? parseFloat(refundData.amount.value) : amount,
            };
        }
        catch (error) {
            const errDetail = axios_1.default.isAxiosError(error)
                ? JSON.stringify(error.response?.data || error.message)
                : error.message;
            logger_1.logger.error({ captureId, err: errDetail }, 'Error refunding PayPal capture');
            throw new Error(`PayPal Refund Error: ${errDetail}`);
        }
    }
    /**
     * Verify incoming webhook signature with PayPal API.
     */
    async verifyWebhook(headers, rawBody) {
        const bodyString = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');
        let parsedEvent;
        try {
            parsedEvent = JSON.parse(bodyString);
        }
        catch {
            return {
                isValid: false,
                eventType: 'unknown',
                error: 'Invalid JSON payload in webhook body',
            };
        }
        // If no webhook ID configured, fail verification or log warning
        if (!this.webhookId) {
            logger_1.logger.warn('PAYPAL_WEBHOOK_ID not set. Skipping signature verification (testing mode).');
            return {
                isValid: true,
                eventType: parsedEvent.event_type,
                resource: parsedEvent.resource,
            };
        }
        const authAlgo = headers['paypal-auth-algo'] || '';
        const certUrl = headers['paypal-cert-url'] || '';
        const transmissionId = headers['paypal-transmission-id'] || '';
        const transmissionSig = headers['paypal-transmission-sig'] || '';
        const transmissionTime = headers['paypal-transmission-time'] || '';
        if (!authAlgo || !certUrl || !transmissionId || !transmissionSig || !transmissionTime) {
            return {
                isValid: false,
                eventType: parsedEvent.event_type,
                error: 'Missing required PayPal signature headers',
            };
        }
        try {
            const client = await this.getClient();
            const verifyResponse = await client.post('/v1/notifications/verify-webhook-signature', {
                auth_algo: authAlgo,
                cert_url: certUrl,
                transmission_id: transmissionId,
                transmission_sig: transmissionSig,
                transmission_time: transmissionTime,
                webhook_id: this.webhookId,
                webhook_event: parsedEvent,
            });
            const isSuccess = verifyResponse.data.verification_status === 'SUCCESS';
            return {
                isValid: isSuccess,
                eventType: parsedEvent.event_type,
                resource: parsedEvent.resource,
                error: isSuccess ? undefined : 'PayPal signature verification returned FAILURE',
            };
        }
        catch (error) {
            const errDetail = axios_1.default.isAxiosError(error)
                ? JSON.stringify(error.response?.data || error.message)
                : error.message;
            logger_1.logger.error({ err: errDetail }, 'Error verifying PayPal webhook signature');
            return {
                isValid: false,
                eventType: parsedEvent.event_type,
                error: `Verification request failed: ${errDetail}`,
            };
        }
    }
}
exports.PayPalProvider = PayPalProvider;
//# sourceMappingURL=paypal.provider.js.map