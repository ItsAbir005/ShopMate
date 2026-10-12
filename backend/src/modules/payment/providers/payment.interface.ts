import { IOrder } from '../../../models/Order';

export interface CreatePaymentResult {
    provider: 'stripe' | 'paypal';
    checkoutUrl?: string;
    sessionId?: string;
    paypalOrderId?: string;
}

export interface CapturePaymentResult {
    success: boolean;
    orderId: string;
    status: string;
    captureId?: string;
    transactionId?: string;
}

export interface RefundPaymentResult {
    success: boolean;
    refundId: string;
    status: string;
    amount?: number;
}

export interface WebhookVerificationResult {
    isValid: boolean;
    eventType: string;
    resource?: unknown;
    error?: string;
}

export interface IPaymentProvider {
    readonly name: 'stripe' | 'paypal';
    createPayment(order: IOrder): Promise<CreatePaymentResult>;
    capture(ref: string, order?: IOrder): Promise<CapturePaymentResult>;
    refund(paymentOrCaptureId: string, amount?: number): Promise<RefundPaymentResult>;
    verifyWebhook(headers: Record<string, unknown>, rawBody: string | Buffer): Promise<WebhookVerificationResult>;
}
