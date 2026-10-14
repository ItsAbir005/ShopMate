import { PayPalAgentToolkit, ALL_TOOLS_ENABLED } from '@paypal/agent-toolkit/openai';
import { logger } from '../../utils/logger';

const isSandbox = (process.env.PAYPAL_ENV || 'sandbox').toLowerCase() === 'sandbox';

// Initialize PayPal Agent Toolkit with official sandbox configuration
let toolkitInstance: PayPalAgentToolkit | null = null;

export function getPayPalToolkit(): PayPalAgentToolkit {
    if (!toolkitInstance) {
        const clientId = process.env.PAYPAL_CLIENT_ID || '';
        const clientSecret = process.env.PAYPAL_CLIENT_SECRET || '';

        toolkitInstance = new PayPalAgentToolkit({
            clientId,
            clientSecret,
            configuration: {
                actions: ALL_TOOLS_ENABLED,
                context: {
                    sandbox: isSandbox,
                    debug: process.env.NODE_ENV !== 'production',
                },
            },
        });

        logger.info({ sandbox: isSandbox }, '[ai] PayPal Agent Toolkit initialized');
    }
    return toolkitInstance;
}

export const WRITE_TOOLS = new Set([
    'create_invoice',
    'send_invoice',
    'send_invoice_reminder',
    'cancel_sent_invoice',
    'delete_invoice',
    'update_invoicing',
    'record_payment_for_invoice',
    'record_refund_for_invoice',
    'create_conditional_rules_for_invoice',
    'create_recurring_series',
    'activate_recurring_series',
    'cancel_recurring_series',
    'delete_recurring_series',
    'create_order',
    'pay_order',
    'create_refund',
    'accept_dispute_claim',
    'create_shipment_tracking',
    'update_shipment_tracking',
    'create_product',
    'create_subscription_plan',
    'create_subscription',
    'cancel_subscription',
    'update_subscription',
    'update_plan',
]);

export function isWriteAction(toolName: string): boolean {
    return WRITE_TOOLS.has(toolName);
}
