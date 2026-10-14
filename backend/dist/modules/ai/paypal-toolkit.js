"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WRITE_TOOLS = void 0;
exports.getPayPalToolkit = getPayPalToolkit;
exports.isWriteAction = isWriteAction;
const openai_1 = require("@paypal/agent-toolkit/openai");
const logger_1 = require("../../utils/logger");
const isSandbox = (process.env.PAYPAL_ENV || 'sandbox').toLowerCase() === 'sandbox';
// Initialize PayPal Agent Toolkit with official sandbox configuration
let toolkitInstance = null;
function getPayPalToolkit() {
    if (!toolkitInstance) {
        const clientId = process.env.PAYPAL_CLIENT_ID || '';
        const clientSecret = process.env.PAYPAL_CLIENT_SECRET || '';
        toolkitInstance = new openai_1.PayPalAgentToolkit({
            clientId,
            clientSecret,
            configuration: {
                actions: openai_1.ALL_TOOLS_ENABLED,
                context: {
                    sandbox: isSandbox,
                    debug: process.env.NODE_ENV !== 'production',
                },
            },
        });
        logger_1.logger.info({ sandbox: isSandbox }, '[ai] PayPal Agent Toolkit initialized');
    }
    return toolkitInstance;
}
exports.WRITE_TOOLS = new Set([
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
function isWriteAction(toolName) {
    return exports.WRITE_TOOLS.has(toolName);
}
//# sourceMappingURL=paypal-toolkit.js.map