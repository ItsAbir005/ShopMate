import axios, { AxiosInstance } from 'axios';
import { IOrder } from '../../../models/Order';
import {
    IPaymentProvider,
    CreatePaymentResult,
    CapturePaymentResult,
    RefundPaymentResult,
    WebhookVerificationResult
} from './payment.interface';
import { logger } from '../../../utils/logger';

// ── Strict PayPal Response Types (No `any`) ───────────────────────────────────

export interface PayPalOAuthTokenResponse {
    scope: string;
    access_token: string;
    token_type: string;
    app_id: string;
    expires_in: number;
    nonce: string;
}

export interface PayPalLinkDescription {
    href: string;
    rel: string;
    method: string;
}

export interface PayPalOrderResponse {
    id: string;
    status: 'CREATED' | 'SAVED' | 'APPROVED' | 'VOIDED' | 'COMPLETED' | 'PAYER_ACTION_REQUIRED';
    links?: PayPalLinkDescription[];
}

export interface PayPalCaptureAmount {
    currency_code: string;
    value: string;
}

export interface PayPalCaptureItem {
    id: string;
    status: 'COMPLETED' | 'DECLINED' | 'PARTIALLY_REFUNDED' | 'PENDING' | 'REFUNDED' | 'FAILED';
    amount: PayPalCaptureAmount;
    final_capture?: boolean;
    seller_protection?: {
        status: string;
    };
    create_time?: string;
    update_time?: string;
}

export interface PayPalPurchaseUnitCapture {
    reference_id?: string;
    payments?: {
        captures?: PayPalCaptureItem[];
    };
}

export interface PayPalCaptureOrderResponse {
    id: string;
    status: 'COMPLETED' | 'DECLINED' | 'PARTIALLY_REFUNDED' | 'PENDING' | 'REFUNDED' | 'FAILED';
    purchase_units?: PayPalPurchaseUnitCapture[];
}

export interface PayPalRefundResponse {
    id: string;
    status: 'COMPLETED' | 'CANCELLED' | 'PENDING' | 'FAILED';
    amount?: PayPalCaptureAmount;
}

export interface PayPalWebhookVerificationResponse {
    verification_status: 'SUCCESS' | 'FAILURE';
}

export interface PayPalWebhookEventResource {
    id: string;
    status?: string;
    custom_id?: string;
    amount?: PayPalCaptureAmount;
    supplementary_data?: {
        related_ids?: {
            order_id?: string;
        };
    };
    [key: string]: unknown;
}

export interface PayPalWebhookEvent {
    id: string;
    event_version: string;
    create_time: string;
    resource_type: string;
    event_type: string;
    summary?: string;
    resource: PayPalWebhookEventResource;
}

export class PayPalProvider implements IPaymentProvider {
    readonly name = 'paypal' as const;

    private readonly clientId: string;
    private readonly clientSecret: string;
    private readonly webhookId: string;
    private readonly baseUrl: string;

    // Token caching
    private cachedToken: string | null = null;
    private tokenExpiryTime = 0;

    constructor() {
        this.clientId = process.env.PAYPAL_CLIENT_ID || '';
        this.clientSecret = process.env.PAYPAL_CLIENT_SECRET || '';
        this.webhookId = process.env.PAYPAL_WEBHOOK_ID || '';
        const env = (process.env.PAYPAL_ENV || 'sandbox').toLowerCase();
        this.baseUrl = env === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
    }

    getBaseUrl(): string {
        return this.baseUrl;
    }

    /**
     * Retrieve OAuth2 client-credentials token and cache it until expiration.
     */
    async getAccessToken(): Promise<string> {
        const now = Date.now();
        if (this.cachedToken && this.tokenExpiryTime > now) {
            return this.cachedToken;
        }

        if (!this.clientId || !this.clientSecret) {
            throw new Error('PayPal credentials missing: PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET are required');
        }

        const auth = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');

        try {
            const response = await axios.post<PayPalOAuthTokenResponse>(
                `${this.baseUrl}/v1/oauth2/token`,
                'grant_type=client_credentials',
                {
                    headers: {
                        Authorization: `Basic ${auth}`,
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                }
            );

            const data = response.data;
            this.cachedToken = data.access_token;
            // Cache token, subtracting a 60 second safety buffer
            this.tokenExpiryTime = now + (data.expires_in - 60) * 1000;
            return this.cachedToken;
        } catch (error: unknown) {
            const errMessage = axios.isAxiosError(error)
                ? error.response?.data?.error_description || error.message
                : (error as Error).message;
            logger.error({ err: errMessage }, 'Failed to obtain PayPal OAuth token');
            throw new Error(`PayPal OAuth Authentication Error: ${errMessage}`);
        }
    }

    private async getClient(): Promise<AxiosInstance> {
        const token = await this.getAccessToken();
        return axios.create({
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
    async createPayment(order: IOrder): Promise<CreatePaymentResult> {
        const orderId = order._id.toString();
        const client = await this.getClient();

        // Calculate amount on server with 2 decimals
        const amountString = order.total_amount.toFixed(2);

        const requestId = `order-${orderId}`;

        try {
            const response = await client.post<PayPalOrderResponse>(
                '/v2/checkout/orders',
                {
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
                },
                {
                    headers: {
                        'PayPal-Request-Id': requestId,
                    },
                }
            );

            logger.info({ orderId, paypalOrderId: response.data.id }, 'PayPal order created');

            return {
                provider: 'paypal',
                paypalOrderId: response.data.id,
            };
        } catch (error: unknown) {
            const errDetail = axios.isAxiosError(error)
                ? JSON.stringify(error.response?.data || error.message)
                : (error as Error).message;
            logger.error({ orderId, err: errDetail }, 'Error creating PayPal order');
            throw new Error(`PayPal Create Order Error: ${errDetail}`);
        }
    }

    /**
     * Capture PayPal Order.
     * Completes payment only if capture status is COMPLETED.
     */
    async capture(paypalOrderId: string, order?: IOrder): Promise<CapturePaymentResult> {
        const client = await this.getClient();
        const requestId = `capture-${paypalOrderId}`;

        try {
            const response = await client.post<PayPalCaptureOrderResponse>(
                `/v2/checkout/orders/${paypalOrderId}/capture`,
                {},
                {
                    headers: {
                        'PayPal-Request-Id': requestId,
                    },
                }
            );

            const captureData = response.data;
            const capture = captureData.purchase_units?.[0]?.payments?.captures?.[0];
            const captureStatus = capture?.status || captureData.status;
            const captureId = capture?.id || captureData.id;
            const orderId = order?._id.toString() || captureData.purchase_units?.[0]?.reference_id || '';

            logger.info({ paypalOrderId, captureStatus, captureId }, 'PayPal capture processed');

            return {
                success: captureStatus === 'COMPLETED',
                orderId,
                status: captureStatus,
                captureId,
                transactionId: captureId,
            };
        } catch (error: unknown) {
            const errDetail = axios.isAxiosError(error)
                ? JSON.stringify(error.response?.data || error.message)
                : (error as Error).message;
            logger.error({ paypalOrderId, err: errDetail }, 'Error capturing PayPal order');
            throw new Error(`PayPal Capture Error: ${errDetail}`);
        }
    }

    /**
     * Refund a completed capture via POST /v2/payments/captures/{captureId}/refund.
     */
    async refund(captureId: string, amount?: number): Promise<RefundPaymentResult> {
        const client = await this.getClient();
        const requestId = `refund-${captureId}-${Date.now()}`;

        const body: Record<string, unknown> = {
            note_to_payer: 'Refund from ShopMate',
        };

        if (amount !== undefined) {
            body.amount = {
                value: amount.toFixed(2),
                currency_code: 'USD',
            };
        }

        try {
            const response = await client.post<PayPalRefundResponse>(
                `/v2/payments/captures/${captureId}/refund`,
                body,
                {
                    headers: {
                        'PayPal-Request-Id': requestId,
                    },
                }
            );

            const refundData = response.data;
            const isSuccess = refundData.status === 'COMPLETED' || refundData.status === 'PENDING';

            logger.info({ captureId, refundId: refundData.id, status: refundData.status }, 'PayPal capture refund processed');

            return {
                success: isSuccess,
                refundId: refundData.id,
                status: refundData.status,
                amount: refundData.amount ? parseFloat(refundData.amount.value) : amount,
            };
        } catch (error: unknown) {
            const errDetail = axios.isAxiosError(error)
                ? JSON.stringify(error.response?.data || error.message)
                : (error as Error).message;
            logger.error({ captureId, err: errDetail }, 'Error refunding PayPal capture');
            throw new Error(`PayPal Refund Error: ${errDetail}`);
        }
    }

    /**
     * Verify incoming webhook signature with PayPal API.
     */
    async verifyWebhook(
        headers: Record<string, unknown>,
        rawBody: string | Buffer
    ): Promise<WebhookVerificationResult> {
        const bodyString = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');
        let parsedEvent: PayPalWebhookEvent;

        try {
            parsedEvent = JSON.parse(bodyString);
        } catch {
            return {
                isValid: false,
                eventType: 'unknown',
                error: 'Invalid JSON payload in webhook body',
            };
        }

        // If no webhook ID configured, fail verification or log warning
        if (!this.webhookId) {
            logger.warn('PAYPAL_WEBHOOK_ID not set. Skipping signature verification (testing mode).');
            return {
                isValid: true,
                eventType: parsedEvent.event_type,
                resource: parsedEvent.resource,
            };
        }

        const authAlgo = (headers['paypal-auth-algo'] as string) || '';
        const certUrl = (headers['paypal-cert-url'] as string) || '';
        const transmissionId = (headers['paypal-transmission-id'] as string) || '';
        const transmissionSig = (headers['paypal-transmission-sig'] as string) || '';
        const transmissionTime = (headers['paypal-transmission-time'] as string) || '';

        if (!authAlgo || !certUrl || !transmissionId || !transmissionSig || !transmissionTime) {
            return {
                isValid: false,
                eventType: parsedEvent.event_type,
                error: 'Missing required PayPal signature headers',
            };
        }

        try {
            const client = await this.getClient();
            const verifyResponse = await client.post<PayPalWebhookVerificationResponse>(
                '/v1/notifications/verify-webhook-signature',
                {
                    auth_algo: authAlgo,
                    cert_url: certUrl,
                    transmission_id: transmissionId,
                    transmission_sig: transmissionSig,
                    transmission_time: transmissionTime,
                    webhook_id: this.webhookId,
                    webhook_event: parsedEvent,
                }
            );

            const isSuccess = verifyResponse.data.verification_status === 'SUCCESS';
            return {
                isValid: isSuccess,
                eventType: parsedEvent.event_type,
                resource: parsedEvent.resource,
                error: isSuccess ? undefined : 'PayPal signature verification returned FAILURE',
            };
        } catch (error: unknown) {
            const errDetail = axios.isAxiosError(error)
                ? JSON.stringify(error.response?.data || error.message)
                : (error as Error).message;
            logger.error({ err: errDetail }, 'Error verifying PayPal webhook signature');
            return {
                isValid: false,
                eventType: parsedEvent.event_type,
                error: `Verification request failed: ${errDetail}`,
            };
        }
    }
}
