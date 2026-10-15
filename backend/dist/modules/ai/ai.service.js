"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.AiValidationError = void 0;
exports.withTimeout = withTimeout;
exports.redactErrorMessage = redactErrorMessage;
exports.extractErrorCode = extractErrorCode;
exports.buildGeminiContents = buildGeminiContents;
exports.evaluateOrderRisk = evaluateOrderRisk;
exports.syncDeliveryTrackingToPayPal = syncDeliveryTrackingToPayPal;
exports.customerAssistantChat = customerAssistantChat;
exports.extractPayPalErrorReason = extractPayPalErrorReason;
exports.getRedactedArgs = getRedactedArgs;
exports.clampTransactionDates = clampTransactionDates;
exports.inspectPayPalToolResult = inspectPayPalToolResult;
exports.formatToolResultDetails = formatToolResultDetails;
exports.getLocalDatabaseInsights = getLocalDatabaseInsights;
exports.formatTransactionsTable = formatTransactionsTable;
exports.formatDisputesTable = formatDisputesTable;
exports.formatInvoicesTable = formatInvoicesTable;
exports.executeQuickChipAction = executeQuickChipAction;
exports.merchantChat = merchantChat;
exports.executeMerchantAction = executeMerchantAction;
const genai_1 = require("@google/genai");
const paypal_toolkit_1 = require("./paypal-toolkit");
const Product_1 = require("../../models/Product");
const Order_1 = require("../../models/Order");
const User_1 = require("../../models/User");
const Shipment_1 = require("../../models/Shipment");
const CartService = __importStar(require("../cart/cart.service"));
const logger_1 = require("../../utils/logger");
// ─── Timeout Wrapper (Strict 8-second limit) ─────────────────────────────────
async function withTimeout(promise, timeoutMs = 8000, fallbackVal) {
    let timer;
    const timeoutPromise = new Promise((_, reject) => {
        timer = setTimeout(() => {
            reject(new Error(`AI operation timed out after ${timeoutMs}ms`));
        }, timeoutMs);
    });
    try {
        const result = await Promise.race([promise, timeoutPromise]);
        clearTimeout(timer);
        return result;
    }
    catch (err) {
        clearTimeout(timer);
        if (fallbackVal !== undefined)
            return fallbackVal;
        throw err;
    }
}
// ─── Gemini Client Accessor ──────────────────────────────────────────────────
function getGeminiClient() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey)
        return null;
    const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    return { ai: new genai_1.GoogleGenAI({ apiKey }), model };
}
// ─── Gemini Contents & Error Helpers ─────────────────────────────────────────
class AiValidationError extends Error {
    constructor(message) {
        super(message);
        this.statusCode = 400;
        this.name = 'AiValidationError';
    }
}
exports.AiValidationError = AiValidationError;
function redactErrorMessage(msg) {
    if (!msg || typeof msg !== 'string')
        return 'Unknown error';
    return msg
        .replace(/AIza[0-9A-Za-z-_]{35}/g, '[REDACTED_API_KEY]')
        .replace(/(access_token|client_secret|authorization|bearer)\s*[:=]\s*[^\s,;]+/gi, '$1:[REDACTED]')
        .slice(0, 200);
}
function extractErrorCode(err) {
    if (err?.statusCode)
        return err.statusCode;
    if (err?.status)
        return err.status;
    if (err?.code)
        return err.code;
    if (err?.error?.code)
        return err.error.code;
    if (err?.error?.status)
        return err.error.status;
    if (err?.name === 'TimeoutError' || (typeof err?.message === 'string' && err.message.toLowerCase().includes('timed out'))) {
        return 'TIMEOUT';
    }
    const match = typeof err?.message === 'string' ? err.message.match(/\b(4\d\d|5\d\d)\b/) : null;
    if (match)
        return parseInt(match[1], 10);
    return 'UNKNOWN';
}
/**
 * Builds Gemini contents array from user message and conversational history:
 * - accepts {role, text} (and {role, content}) items, converting role names to "user" and "model"
 * - drops items with missing, non-string or whitespace-only text
 * - drops any leading "model" messages so the first item is always a "user" message
 * - merges consecutive same-role items so turns alternate cleanly
 * - makes sure the final item is the new user message, rejecting with HTTP 400 if empty
 * - limits history to the last ~10 messages
 */
function buildGeminiContents(newMessage, rawHistory = [], maxHistory = 10) {
    if (typeof newMessage !== 'string' || !newMessage.trim()) {
        throw new AiValidationError('User message cannot be empty');
    }
    const cleanNewMessage = newMessage.trim();
    const cleaned = [];
    if (Array.isArray(rawHistory)) {
        for (const item of rawHistory) {
            if (!item || typeof item !== 'object')
                continue;
            const rawText = typeof item.text === 'string'
                ? item.text
                : (typeof item.content === 'string' ? item.content : '');
            const trimmed = rawText.trim();
            if (!trimmed)
                continue;
            const rawRole = (typeof item.role === 'string' ? item.role.toLowerCase() : '').trim();
            let role;
            if (rawRole === 'user') {
                role = 'user';
            }
            else if (rawRole === 'assistant' || rawRole === 'bot' || rawRole === 'model') {
                role = 'model';
            }
            else {
                role = 'user';
            }
            cleaned.push({
                role,
                parts: [{ text: trimmed }],
            });
        }
    }
    const limited = cleaned.slice(-maxHistory);
    const alternating = [];
    for (const item of limited) {
        if (alternating.length > 0 && alternating[alternating.length - 1].role === item.role) {
            alternating[alternating.length - 1].parts[0].text += `\n${item.parts[0].text}`;
        }
        else {
            alternating.push({ role: item.role, parts: [{ text: item.parts[0].text }] });
        }
    }
    while (alternating.length > 0 && alternating[0].role === 'model') {
        alternating.shift();
    }
    if (alternating.length > 0 && alternating[alternating.length - 1].role === 'user') {
        if (alternating[alternating.length - 1].parts[0].text === cleanNewMessage) {
            // Already includes this message
        }
        else {
            alternating[alternating.length - 1].parts[0].text += `\n${cleanNewMessage}`;
        }
    }
    else {
        alternating.push({
            role: 'user',
            parts: [{ text: cleanNewMessage }],
        });
    }
    return alternating;
}
async function evaluateOrderRisk(order) {
    const userId = order.user_id;
    let accountAgeDays = 0;
    let addressChanges = 1;
    try {
        const user = await User_1.User.findById(userId);
        if (user?.createdAt) {
            const ageMs = Date.now() - new Date(user.createdAt).getTime();
            accountAgeDays = Math.max(0, Math.floor(ageMs / (1000 * 60 * 60 * 24)));
        }
        if (user?.addresses && user.addresses.length > 0) {
            addressChanges = user.addresses.length;
        }
    }
    catch {
        // Soft-fail on user signal query
    }
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    let ordersInLastHour = 0;
    try {
        ordersInLastHour = await Order_1.Order.countDocuments({
            user_id: userId,
            createdAt: { $gte: oneHourAgo },
            _id: { $ne: order._id },
        });
    }
    catch {
        // Soft-fail
    }
    const signals = {
        orderTotal: order.total_amount,
        accountAgeDays,
        ordersInLastHour,
        addressChanges,
    };
    const clientInfo = getGeminiClient();
    if (!clientInfo) {
        logger_1.logger.info({ signals }, '[ai] Risk assessment fallback: GEMINI_API_KEY not configured');
        return {
            decision: 'approve',
            reason: 'AI unavailable',
            signals,
        };
    }
    try {
        const prompt = `You are a strict transaction fraud risk evaluation model for ShopMate e-commerce store.
Analyze the following transaction signals:
- Order Total: $${signals.orderTotal.toFixed(2)}
- Customer Account Age: ${signals.accountAgeDays} days
- Orders Placed in Past Hour: ${signals.ordersInLastHour}
- Number of Saved Addresses: ${signals.addressChanges}

Instructions:
1. Return ONLY a valid JSON object with exact keys "decision" and "reason".
2. "decision" must be one of: "approve", "review", "flag".
3. "reason" must be a concise sentence (under 20 words).
- If normal amount and standard activity -> "approve"
- If new account with large cart ($500+) or multiple orders in one hour -> "review"
- If high order velocity (>= 5 orders/hr) or suspicious extremes -> "flag"
`;
        const generateRisk = async () => {
            const response = await clientInfo.ai.models.generateContent({
                model: clientInfo.model,
                contents: prompt,
                config: {
                    temperature: 0.1,
                    responseMimeType: 'application/json',
                },
            });
            const text = response.text?.trim() || '{}';
            const parsed = JSON.parse(text);
            const valid = ['approve', 'review', 'flag'];
            const decision = valid.includes(parsed.decision) ? parsed.decision : 'approve';
            const reason = parsed.reason || 'Signals verified';
            return {
                decision,
                reason,
                signals,
            };
        };
        const result = await withTimeout(generateRisk(), 8000);
        logger_1.logger.info({ decision: result.decision, orderId: order._id }, '[ai] Order risk evaluated successfully');
        return result;
    }
    catch (err) {
        logger_1.logger.warn({ err: err.message, orderId: order._id }, '[ai] Risk assessment error or timeout, defaulting to approve');
        return {
            decision: 'approve',
            reason: 'AI unavailable',
            signals,
        };
    }
}
// ─── Part 3: Delivery to PayPal Sync ─────────────────────────────────────────
async function syncDeliveryTrackingToPayPal(shipmentId) {
    try {
        const shipment = await Shipment_1.Shipment.findById(shipmentId);
        if (!shipment)
            return false;
        // Idempotency: don't sync twice
        if (shipment.paypalTrackingSynced) {
            logger_1.logger.info({ shipmentId, trackingCode: shipment.trackingCode }, '[paypal] Shipment tracking already synced to PayPal');
            return true;
        }
        const order = await Order_1.Order.findById(shipment.order_id);
        if (!order)
            return false;
        const transactionId = order.paypalCaptureId || order.paypalOrderId;
        if (!transactionId) {
            logger_1.logger.info({ orderId: order._id }, '[paypal] No PayPal transaction ID on order to sync tracking');
            return false;
        }
        const toolkit = (0, paypal_toolkit_1.getPayPalToolkit)();
        const trackingArgs = {
            tracking_number: shipment.trackingCode,
            transaction_id: transactionId,
            status: 'DELIVERED',
            carrier: 'OTHER',
        };
        try {
            await toolkit.handleToolCall({
                id: `track_${shipment._id}`,
                type: 'function',
                function: {
                    name: 'create_shipment_tracking',
                    arguments: JSON.stringify(trackingArgs),
                },
            });
            shipment.paypalTrackingSynced = true;
            await shipment.save();
            logger_1.logger.info({ shipmentId, trackingCode: shipment.trackingCode, transactionId }, '[paypal] Shipment delivery synced to PayPal successfully');
            return true;
        }
        catch (callErr) {
            logger_1.logger.warn({ err: callErr.message, shipmentId }, '[paypal] Failed to sync delivery tracking to PayPal');
            return false;
        }
    }
    catch (err) {
        logger_1.logger.warn({ err: err.message, shipmentId }, '[paypal] Unexpected error in delivery tracking sync');
        return false;
    }
}
async function customerAssistantChat(userId, message, history = []) {
    const clientInfo = getGeminiClient();
    // Local tool execution functions
    async function execSearchProducts(query, maxPrice) {
        const filter = { status: { $ne: 'archived' } };
        if (query) {
            filter.$or = [
                { title: { $regex: query, $options: 'i' } },
                { description: { $regex: query, $options: 'i' } },
                { category: { $regex: query, $options: 'i' } },
            ];
        }
        if (typeof maxPrice === 'number' && maxPrice > 0) {
            filter.price = { $lte: maxPrice };
        }
        const products = await Product_1.Product.find(filter).populate('category_id', 'name').limit(5).lean();
        return products.map(p => ({
            id: p._id.toString(),
            title: p.title,
            price: p.price,
            stock: p.stock,
            category: p.category_id?.name || 'General',
            image: p.images?.[0] || '',
        }));
    }
    async function execAddToCart(productId, qty = 1) {
        if (!userId) {
            return {
                success: false,
                loginRequired: true,
                message: 'You must be signed in to add items to your cart.',
            };
        }
        const product = await Product_1.Product.findById(productId);
        if (!product) {
            return { success: false, message: 'Product not found.' };
        }
        if (product.stock < qty) {
            return { success: false, message: `Only ${product.stock} items in stock.` };
        }
        await CartService.addItem(userId, productId, qty);
        return {
            success: true,
            message: `Added ${qty} × ${product.title} to your cart.`,
            productId,
            title: product.title,
        };
    }
    async function execGetMyOrders(limit = 5) {
        if (!userId) {
            return {
                success: false,
                loginRequired: true,
                message: 'Please sign in to view your orders.',
            };
        }
        const safeLimit = Math.min(Math.max(1, Number(limit) || 5), 5);
        const orders = await Order_1.Order.find({ user_id: userId })
            .sort({ createdAt: -1 })
            .limit(safeLimit)
            .lean();
        if (orders.length === 0) {
            return {
                success: true,
                message: "You haven't placed any orders yet.",
                orders: [],
            };
        }
        const orderIds = orders.map(o => o._id);
        const shipments = await Shipment_1.Shipment.find({ order_id: { $in: orderIds } }).lean();
        const shipmentMap = new Map(shipments.map(s => [s.order_id.toString(), s]));
        const formattedOrders = orders.map(o => {
            const shipment = shipmentMap.get(o._id.toString());
            return {
                id: o._id.toString(),
                status: o.status,
                total: o.total_amount,
                createdAt: o.createdAt ? new Date(o.createdAt).toISOString() : undefined,
                trackingStatus: shipment?.status || (o.status === 'delivered' ? 'delivered' : (o.status === 'shipped' ? 'in_transit' : 'processing')),
                trackingCode: shipment?.trackingCode,
                estimatedDelivery: shipment?.estimatedDelivery,
            };
        });
        return {
            success: true,
            orders: formattedOrders,
        };
    }
    async function execGetMyOrderStatus(orderId) {
        if (!userId) {
            return {
                success: false,
                loginRequired: true,
                message: 'Please sign in to view your orders.',
            };
        }
        if (orderId) {
            const order = await Order_1.Order.findById(orderId).lean();
            if (!order || order.user_id.toString() !== userId) {
                return { success: false, message: 'Order not found or unauthorized.' };
            }
            const shipment = await Shipment_1.Shipment.findOne({ order_id: order._id }).lean();
            return {
                success: true,
                order: {
                    id: order._id.toString(),
                    status: order.status,
                    paymentStatus: order.payment_status,
                    total: order.total_amount,
                    items: order.order_items.map(i => ({ title: i.title, quantity: i.quantity, price: i.price })),
                    trackingCode: shipment?.trackingCode,
                    estimatedDelivery: shipment?.estimatedDelivery,
                },
            };
        }
        // Delegate to execGetMyOrders if no orderId provided
        const recentRes = await execGetMyOrders(5);
        return {
            success: recentRes.success,
            recentOrders: recentRes.orders,
        };
    }
    // Fallback if AI not configured
    if (!clientInfo) {
        logger_1.logger.info('[ai] Assistant running in fallback mode (GEMINI_API_KEY missing)');
        const lower = message.toLowerCase();
        const toolCalls = [];
        if (lower.includes('invoice') || lower.includes('dispute') || lower.includes('transaction')) {
            return {
                text: "PayPal transaction logs, invoices, and disputes are merchant features available exclusively to store administrators via the Admin AI Copilot.",
                toolCalls: [],
            };
        }
        if (lower.includes('order') || lower.includes('track') || lower.includes('status') || lower.includes('latest') || lower.includes('recent')) {
            const res = await execGetMyOrders(5);
            toolCalls.push({ toolName: 'getMyOrders', summary: 'Looked up recent orders' });
            if (!userId) {
                return { text: 'Please sign in to view your orders and live tracking.', toolCalls };
            }
            if (!res.orders || res.orders.length === 0) {
                return { text: "You don't have any recent orders yet. Ready to start shopping?", toolCalls };
            }
            const orderList = res.orders.map(o => `• Order #${o.id.slice(-8).toUpperCase()}: Status: ${o.status}, Total: $${o.total.toFixed(2)}${o.trackingStatus ? ` (${o.trackingStatus})` : ''}`).join('\n');
            return { text: `Here are your recent orders:\n${orderList}\n\nTrack full details on your Orders page.`, toolCalls, orderStatus: { recentOrders: res.orders } };
        }
        const found = await execSearchProducts(message);
        toolCalls.push({ toolName: 'searchProducts', summary: `Found ${found.length} products` });
        if (found.length > 0) {
            const list = found.map(p => `• **${p.title}** - $${p.price.toFixed(2)} (${p.stock > 0 ? 'In Stock' : 'Out of stock'})`).join('\n');
            return { text: `Here are matching items from our catalog:\n${list}\n\nTo purchase, add items to your cart and proceed to secure PayPal checkout!`, toolCalls, products: found };
        }
        return {
            text: "Hello! I am your ShopMate AI Assistant. You can search products, ask me to add items to your cart, or check your order tracking.",
            toolCalls: [],
        };
    }
    // Google Gemini Function Declarations
    const functionDeclarations = [
        {
            name: 'searchProducts',
            description: 'Search available products in the shop by keyword or maximum price.',
            parametersJsonSchema: {
                type: 'object',
                properties: {
                    query: { type: 'string', description: 'Product title, category or keyword to search for' },
                    maxPrice: { type: 'number', description: 'Optional maximum price limit in USD' },
                },
                required: ['query'],
            },
        },
        {
            name: 'addToCart',
            description: 'Add a product to the user shopping cart. Requires customer to be signed in.',
            parametersJsonSchema: {
                type: 'object',
                properties: {
                    productId: { type: 'string', description: 'MongoDB ObjectId of the product to add' },
                    qty: { type: 'number', description: 'Quantity of items to add (defaults to 1)' },
                },
                required: ['productId'],
            },
        },
        {
            name: 'getMyOrders',
            description: "Retrieve the authenticated user's most recent orders (id, status, total, createdAt, tracking status). Use this when the customer asks 'where is my latest order', 'my recent orders', 'what did I order', 'order history', or any order status inquiry without a specific Order ID.",
            parametersJsonSchema: {
                type: 'object',
                properties: {
                    limit: {
                        type: 'number',
                        description: 'Number of recent orders to retrieve (maximum 5, defaults to 5)',
                    },
                },
            },
        },
        {
            name: 'getMyOrderStatus',
            description: 'Retrieve detailed status, items, and tracking for a specific Order ID. Use only when the customer provides a specific Order ID.',
            parametersJsonSchema: {
                type: 'object',
                properties: {
                    orderId: { type: 'string', description: 'The specific Order ID to inspect' },
                },
                required: ['orderId'],
            },
        },
    ];
    const systemInstruction = `You are the official ShopMate customer shopping agent.
RULES:
1. Answers must come from tool results ONLY. Never fabricate products, prices, or orders.
2. If asked to find, search, or browse items, call "searchProducts".
3. If asked to add items to cart, call "addToCart". If login is required, tell the customer to sign in.
4. ORDER LOOKUPS:
   - When the customer asks "where is my latest order", "where is my order", "my recent orders", "check my orders", or asks about order status without providing an Order ID, ALWAYS call "getMyOrders(limit: 5)". Do NOT ask the customer for an Order ID first; call "getMyOrders" to check their account.
   - Only call "getMyOrderStatus(orderId)" when the customer provides a specific Order ID.
5. MERCHANT FEATURES:
   - Questions about PayPal-level business transactions, store transaction reports, PayPal account balances, creating or sending PayPal invoices, or PayPal disputes are store management features. Politely inform the customer that PayPal transactions, invoices, and disputes are merchant features available exclusively to store administrators via the Admin AI Copilot.
6. PAYMENT NOTICE: Payment always happens in the standard PayPal checkout. You cannot collect card details or payment credentials in chat. Direct customers to "/orders/checkout" or their order page to complete PayPal payment.
7. Keep answers friendly, concise, and helpful.`;
    const toolCalls = [];
    let productsResult;
    let orderStatusResult;
    let cartUpdatedResult = false;
    let stage = 'building contents';
    try {
        stage = 'building contents';
        const contents = buildGeminiContents(message, history);
        const runTurn = async () => {
            stage = 'model call';
            const response1 = await clientInfo.ai.models.generateContent({
                model: clientInfo.model,
                contents: contents,
                config: {
                    systemInstruction,
                    tools: [{ functionDeclarations }],
                    temperature: 0.2,
                },
            });
            const funcCalls = response1.functionCalls;
            if (!funcCalls || funcCalls.length === 0) {
                return response1.text || 'How can I assist you with your shopping today?';
            }
            // Execute function calls
            stage = 'tool execution';
            const functionResponses = [];
            for (const fc of funcCalls) {
                const name = fc.name || '';
                if (!name)
                    continue;
                const args = fc.args || {};
                let result = {};
                if (name === 'searchProducts') {
                    result = await execSearchProducts(args.query, args.maxPrice);
                    productsResult = result;
                    toolCalls.push({ toolName: name, summary: `Found ${result.length} products matching query`, result });
                }
                else if (name === 'addToCart') {
                    result = await execAddToCart(args.productId, args.qty);
                    if (result.success)
                        cartUpdatedResult = true;
                    toolCalls.push({ toolName: name, summary: result.message, result });
                }
                else if (name === 'getMyOrders') {
                    result = await execGetMyOrders(args.limit);
                    orderStatusResult = { recentOrders: result.orders };
                    toolCalls.push({
                        toolName: name,
                        summary: result.success ? `Retrieved ${result.orders?.length || 0} recent orders` : result.message,
                        result,
                    });
                }
                else if (name === 'getMyOrderStatus') {
                    result = await execGetMyOrderStatus(args.orderId);
                    orderStatusResult = result;
                    toolCalls.push({ toolName: name, summary: result.success ? 'Retrieved order status' : result.message, result });
                }
                functionResponses.push({
                    name,
                    response: { output: result },
                });
            }
            // Second turn with tool outputs
            stage = 'tool result';
            const candidateParts = response1.candidates?.[0]?.content?.parts || [];
            contents.push({
                role: 'model',
                parts: candidateParts,
            });
            contents.push({
                role: 'user',
                parts: functionResponses.map(fr => ({ functionResponse: fr })),
            });
            const response2 = await clientInfo.ai.models.generateContent({
                model: clientInfo.model,
                contents: contents,
                config: {
                    systemInstruction,
                    temperature: 0.2,
                },
            });
            return response2.text || 'I have updated your request.';
        };
        const replyText = await withTimeout(runTurn(), 8000);
        logger_1.logger.info({ toolCallsCount: toolCalls.length }, '[ai] Customer assistant handled message');
        return {
            text: replyText,
            toolCalls,
            products: productsResult,
            orderStatus: orderStatusResult,
            cartUpdated: cartUpdatedResult,
        };
    }
    catch (err) {
        const errorCode = extractErrorCode(err);
        const redactedMsg = redactErrorMessage(err?.message);
        const isBadRequest = errorCode === 400 ||
            err?.status === 400 ||
            err?.statusCode === 400 ||
            err instanceof AiValidationError ||
            (typeof err?.message === 'string' && (err.message.includes('400') || err.message.includes('INVALID_ARGUMENT')));
        if (isBadRequest) {
            logger_1.logger.error({
                stage,
                errorCode: 400,
                errorMessage: redactedMsg,
            }, '[ai] Customer assistant 400 Bad Request error');
            throw err;
        }
        logger_1.logger.warn({
            stage,
            errorCode,
            errorMessage: redactedMsg,
        }, '[ai] Customer assistant error or timeout, falling back');
        return {
            text: "I'm having a slight connection delay right now. You can browse our catalog, check your cart, or visit the Orders page directly!",
            toolCalls: [],
        };
    }
}
function extractPayPalErrorReason(toolName, err, args) {
    const rawMsg = typeof err === 'string' ? err : (err?.message || JSON.stringify(err || ''));
    const lower = rawMsg.toLowerCase();
    if (lower.includes('not_authorized') ||
        lower.includes('permission_denied') ||
        lower.includes('insufficient permissions') ||
        lower.includes('not enabled') ||
        lower.includes('no permission') ||
        lower.includes('unauthorized') ||
        lower.includes('authorization_error')) {
        if (toolName === 'get_merchant_insights') {
            return 'PayPal denied this request: Merchant Insights is not enabled for this app';
        }
        if (toolName === 'list_transactions') {
            return 'PayPal denied this request: Transaction Search is not enabled for this app in PayPal Developer Dashboard';
        }
        if (toolName === 'list_disputes') {
            return 'PayPal denied this request: Disputes access is not enabled for this app';
        }
        if (toolName === 'list_invoices') {
            return 'PayPal denied this request: Invoicing access is not enabled for this app';
        }
        return `PayPal denied this request: ${toolName} permission is not enabled for this app`;
    }
    if (lower.includes('401') || lower.includes('invalid_client') || lower.includes('client authentication failed')) {
        return 'PayPal authentication failed: Invalid Client ID or Client Secret';
    }
    if (lower.includes('31') || lower.includes('date range') || lower.includes('date_range')) {
        return 'PayPal requires transaction search date ranges to be within 31 days';
    }
    if (lower.includes('404') || lower.includes('not found') || lower.includes('resource_not_found')) {
        return `Requested PayPal resource was not found for ${toolName}`;
    }
    if (lower.includes('429') || lower.includes('rate limit')) {
        return 'PayPal rate limit reached. Please wait a moment and try again.';
    }
    if (lower.includes('timeout') || lower.includes('timed out')) {
        return 'PayPal API timed out while processing this request.';
    }
    return `PayPal returned an error: ${redactErrorMessage(rawMsg)}`;
}
function getRedactedArgs(args) {
    if (!args || typeof args !== 'object')
        return {};
    const safe = {};
    const SAFE_KEYS = new Set([
        'start_date', 'end_date', 'startDate', 'endDate',
        'date_from', 'date_to', 'from_date', 'to_date',
        'page', 'page_size', 'pageSize', 'limit', 'total_count_required',
        'transaction_status', 'status', 'dispute_state'
    ]);
    for (const [key, value] of Object.entries(args)) {
        if (SAFE_KEYS.has(key)) {
            safe[key] = value;
        }
        else if (/token|secret|key|pass|auth|email|payer|card/i.test(key)) {
            safe[key] = '[REDACTED]';
        }
    }
    return safe;
}
function clampTransactionDates(args, now) {
    const safeArgs = { ...(args || {}) };
    const MAX_DAYS_MS = 31 * 24 * 60 * 60 * 1000;
    const DEFAULT_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
    let endDate;
    if (safeArgs.end_date) {
        endDate = new Date(safeArgs.end_date);
        if (isNaN(endDate.getTime()))
            endDate = now;
    }
    else {
        endDate = now;
    }
    let startDate;
    if (safeArgs.start_date) {
        startDate = new Date(safeArgs.start_date);
        if (isNaN(startDate.getTime())) {
            startDate = new Date(endDate.getTime() - DEFAULT_DAYS_MS);
        }
    }
    else {
        startDate = new Date(endDate.getTime() - DEFAULT_DAYS_MS);
    }
    let clamped = false;
    if (endDate.getTime() - startDate.getTime() > MAX_DAYS_MS) {
        startDate = new Date(endDate.getTime() - MAX_DAYS_MS);
        clamped = true;
    }
    if (startDate.getTime() > endDate.getTime()) {
        startDate = new Date(endDate.getTime() - DEFAULT_DAYS_MS);
        clamped = true;
    }
    safeArgs.start_date = startDate.toISOString();
    safeArgs.end_date = endDate.toISOString();
    return { args: safeArgs, clamped };
}
function inspectPayPalToolResult(toolName, data, args, thrownErr) {
    let rawObj = data;
    if (typeof data === 'string') {
        try {
            rawObj = JSON.parse(data);
        }
        catch {
            rawObj = { message: data };
        }
    }
    const rawString = typeof data === 'string' ? data : JSON.stringify(data || {});
    const thrownMsg = thrownErr ? (thrownErr.message || String(thrownErr)) : '';
    const combinedLower = `${rawString} ${thrownMsg}`.toLowerCase();
    // Check status
    let status = 200;
    if (thrownErr?.status || thrownErr?.statusCode) {
        status = Number(thrownErr.status || thrownErr.statusCode);
    }
    else if (rawObj?.status || rawObj?.statusCode || rawObj?.httpStatusCode) {
        status = Number(rawObj.status || rawObj.statusCode || rawObj.httpStatusCode);
    }
    else {
        const match = combinedLower.match(/\b(4\d\d|5\d\d)\b/);
        if (match)
            status = parseInt(match[1], 10);
    }
    // Check failure indicators: HTTP >= 400, error body (errors, name, message, NOT_AUTHORIZED, "insufficient permissions")
    const hasErrorStatus = status >= 400;
    const hasErrorName = Boolean(rawObj?.name &&
        (rawObj.name === 'NOT_AUTHORIZED' ||
            rawObj.name === 'PERMISSION_DENIED' ||
            rawObj.name === 'AUTHENTICATION_FAILURE' ||
            rawObj.name === 'INVALID_REQUEST' ||
            rawObj.name.includes('ERROR') ||
            rawObj.name.includes('DENIED') ||
            rawObj.name.includes('FAIL')));
    const hasErrorProperty = Boolean(rawObj?.error || (Array.isArray(rawObj?.errors) && rawObj.errors.length > 0));
    const hasErrorPhrases = combinedLower.includes('not_authorized') ||
        combinedLower.includes('insufficient permissions') ||
        combinedLower.includes('permission denied') ||
        combinedLower.includes('no permission') ||
        combinedLower.includes('not enabled') ||
        combinedLower.includes('access denied') ||
        combinedLower.includes('unauthorized') ||
        combinedLower.includes('authorization error');
    const isError = Boolean(thrownErr) || hasErrorStatus || hasErrorName || hasErrorProperty || hasErrorPhrases;
    if (isError) {
        const errorStatus = status >= 400 ? status : 403;
        const errorName = rawObj?.name || rawObj?.error || thrownErr?.name || (errorStatus === 403 ? 'NOT_AUTHORIZED' : 'PayPalError');
        const errorMsg = rawObj?.message ||
            (Array.isArray(rawObj?.errors) ? rawObj.errors.map((e) => e.message || e).join('; ') : '') ||
            thrownErr?.message ||
            'Request failed';
        const plainReason = extractPayPalErrorReason(toolName, { name: errorName, message: errorMsg }, args);
        return {
            isError: true,
            status: errorStatus,
            errorName,
            errorMessage: errorMsg,
            plainReason,
            resultCount: 0,
            subtitle: plainReason,
            summary: plainReason,
        };
    }
    // Success case: compute count and subtitle
    let count = 0;
    let subtitle = `PayPal executed ${toolName}`;
    let summary = `Successfully executed ${toolName}`;
    if (toolName === 'list_transactions') {
        count = Array.isArray(rawObj?.transaction_details) ? rawObj.transaction_details.length : 0;
        const startStr = args?.start_date ? args.start_date.split('T')[0] : '';
        const endStr = args?.end_date ? args.end_date.split('T')[0] : '';
        const dateRangeStr = startStr && endStr ? ` between ${startStr} and ${endStr}` : '';
        subtitle = `PayPal returned ${count} transaction${count === 1 ? '' : 's'}`;
        summary = count === 0 ? `No transactions found${dateRangeStr}` : `Retrieved ${count} transactions from PayPal${dateRangeStr}`;
    }
    else if (toolName === 'list_invoices' || toolName === 'search_invoicing') {
        count = Array.isArray(rawObj?.items) ? rawObj.items.length : (rawObj?.total_items || 0);
        subtitle = `PayPal returned ${count} invoice${count === 1 ? '' : 's'}`;
        summary = `Found ${count} invoices in PayPal account`;
    }
    else if (toolName === 'list_disputes') {
        count = Array.isArray(rawObj?.items) ? rawObj.items.length : 0;
        subtitle = `PayPal returned ${count} dispute${count === 1 ? '' : 's'}`;
        summary = `Retrieved ${count} dispute records`;
    }
    else if (toolName === 'get_merchant_insights') {
        count = 1;
        subtitle = 'PayPal returned business analytics';
        summary = 'Retrieved PayPal business analytics and metrics';
    }
    return {
        isError: false,
        status: 200,
        errorName: '',
        errorMessage: '',
        plainReason: '',
        resultCount: count,
        subtitle,
        summary,
    };
}
function formatToolResultDetails(toolName, data, args) {
    const inspection = inspectPayPalToolResult(toolName, data, args);
    return {
        summary: inspection.summary,
        subtitle: inspection.subtitle,
        resultCount: inspection.resultCount,
        errorReason: inspection.isError ? inspection.plainReason : undefined,
        httpStatus: inspection.status,
        ok: !inspection.isError,
    };
}
// ─── ShopMate Local Database Insights (Fallback & Direct Chip) ────────────────
async function getLocalDatabaseInsights() {
    const orders = await Order_1.Order.find({}).lean();
    let totalRevenue = 0;
    let paidOrdersCount = 0;
    const ordersByStatus = {};
    const ordersByAiRisk = {};
    const productSalesMap = new Map();
    // Last 7 days map (UTC)
    const now = new Date();
    const dailyMap = new Map();
    for (let i = 6; i >= 0; i--) {
        const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
        const dateKey = d.toISOString().split('T')[0];
        dailyMap.set(dateKey, { count: 0, revenue: 0 });
    }
    const sevenDaysAgoMs = now.getTime() - 7 * 24 * 60 * 60 * 1000;
    for (const order of orders) {
        // Status count
        const status = (order.status || 'pending').toLowerCase();
        ordersByStatus[status] = (ordersByStatus[status] || 0) + 1;
        // Paid revenue check: status is paid, shipped, or delivered, or payment_status is paid
        const isPaid = order.payment_status === 'paid' || status === 'paid' || status === 'shipped' || status === 'delivered';
        const orderAmount = typeof order.total_amount === 'number' ? order.total_amount : 0;
        if (isPaid) {
            totalRevenue += orderAmount;
            paidOrdersCount += 1;
        }
        // AI risk decision
        const riskDecision = order.aiRisk?.decision ? String(order.aiRisk.decision).toUpperCase() : 'UNASSESSED';
        ordersByAiRisk[riskDecision] = (ordersByAiRisk[riskDecision] || 0) + 1;
        // Orders per day in the last 7 days
        const createdAt = order.createdAt ? new Date(order.createdAt) : null;
        if (createdAt && !isNaN(createdAt.getTime()) && createdAt.getTime() >= sevenDaysAgoMs) {
            const dateKey = createdAt.toISOString().split('T')[0];
            const dayEntry = dailyMap.get(dateKey);
            if (dayEntry) {
                dayEntry.count += 1;
                if (isPaid) {
                    dayEntry.revenue += orderAmount;
                }
            }
        }
        // Top products by quantity
        if (Array.isArray(order.order_items)) {
            for (const item of order.order_items) {
                const title = item.title || 'Product';
                const qty = item.quantity || 1;
                const price = item.price || 0;
                const current = productSalesMap.get(title) || { title, quantity: 0, revenue: 0 };
                current.quantity += qty;
                current.revenue += qty * price;
                productSalesMap.set(title, current);
            }
        }
    }
    const averageOrderValue = paidOrdersCount > 0 ? totalRevenue / paidOrdersCount : 0;
    const ordersPerDayLast7Days = Array.from(dailyMap.entries()).map(([date, val]) => ({
        date,
        count: val.count,
        revenue: Math.round(val.revenue * 100) / 100,
    }));
    const topProducts = Array.from(productSalesMap.values())
        .sort((a, b) => b.quantity - a.quantity)
        .slice(0, 3);
    const label = 'Based on ShopMate order data (PayPal Insights is not available for this app)';
    // Build clear markdown tables
    const tableMarkdown = buildLocalInsightsMarkdown({
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        paidOrdersCount,
        averageOrderValue: Math.round(averageOrderValue * 100) / 100,
        ordersByStatus,
        ordersPerDayLast7Days,
        topProducts,
        ordersByAiRisk,
        label,
    });
    return {
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        paidOrdersCount,
        averageOrderValue: Math.round(averageOrderValue * 100) / 100,
        ordersByStatus,
        ordersPerDayLast7Days,
        topProducts,
        ordersByAiRisk,
        tableMarkdown,
        label,
    };
}
function buildLocalInsightsMarkdown(data) {
    const statusRows = Object.entries(data.ordersByStatus)
        .map(([st, cnt]) => `| ${st.charAt(0).toUpperCase() + st.slice(1)} | ${cnt} |`)
        .join('\n') || '| None | 0 |';
    const dailyRows = data.ordersPerDayLast7Days
        .map((d) => `| ${d.date} | ${d.count} | $${d.revenue.toFixed(2)} |`)
        .join('\n') || '| - | 0 | $0.00 |';
    const productRows = data.topProducts
        .map((p, idx) => `| #${idx + 1} ${p.title} | ${p.quantity} | $${p.revenue.toFixed(2)} |`)
        .join('\n') || '| No product sales yet | 0 | $0.00 |';
    const riskRows = Object.entries(data.ordersByAiRisk)
        .map(([risk, cnt]) => `| ${risk} | ${cnt} |`)
        .join('\n') || '| None | 0 |';
    return `**${data.label}**

### Performance Overview
| Metric | Value |
|---|---|
| Total Revenue (Paid) | $${data.totalRevenue.toFixed(2)} |
| Paid Orders | ${data.paidOrdersCount} |
| Average Order Value (AOV) | $${data.averageOrderValue.toFixed(2)} |

### Orders by Status
| Status | Count |
|---|---|
${statusRows}

### Orders per Day (Last 7 Days)
| Date | Orders | Revenue |
|---|---|---|
${dailyRows}

### Top 3 Products by Quantity
| Product | Units Sold | Revenue |
|---|---|---|
${productRows}

### Orders by AI Risk Decision
| AI Risk Decision | Count |
|---|---|
${riskRows}`;
}
// ─── Table Formatters for Quick Chips ─────────────────────────────────────────
function formatTransactionsTable(transactions) {
    if (!transactions || transactions.length === 0) {
        return 'No transactions found for the specified period (last 7 days).';
    }
    const rows = transactions.map((t) => {
        const info = t.transaction_info || {};
        const id = info.transaction_id || '-';
        const date = info.transaction_initiation_date ? info.transaction_initiation_date.split('T')[0] : '-';
        const status = info.transaction_status || '-';
        const gross = info.transaction_amount ? `${info.transaction_amount.currency_code || 'USD'} ${info.transaction_amount.value}` : '-';
        const fee = info.fee_amount ? `${info.fee_amount.currency_code || 'USD'} ${info.fee_amount.value}` : '$0.00';
        const net = info.net_amount ? `${info.net_amount.currency_code || 'USD'} ${info.net_amount.value}` : gross;
        return `| ${date} | \`${id}\` | ${status} | ${gross} | ${fee} | ${net} |`;
    });
    return `### Recent PayPal Transactions (Last 7 Days)

| Date | Transaction ID | Status | Gross | Fee | Net |
|---|---|---|---|---|---|
${rows.join('\n')}`;
}
function formatDisputesTable(disputes) {
    if (!disputes || disputes.length === 0) {
        return 'No active customer disputes found in your PayPal account.';
    }
    const rows = disputes.map((d) => {
        const id = d.dispute_id || '-';
        const status = d.status || d.dispute_state || '-';
        const reason = d.reason ? d.reason.replace(/_/g, ' ') : 'General dispute';
        const amount = d.dispute_amount ? `${d.dispute_amount.currency_code || 'USD'} ${d.dispute_amount.value}` : '-';
        const date = d.create_time ? d.create_time.split('T')[0] : '-';
        return `| \`${id}\` | ${status} | ${reason} | ${amount} | ${date} |`;
    });
    return `### Open PayPal Disputes

| Dispute ID | Status | Reason | Disputed Amount | Created Date |
|---|---|---|---|---|
${rows.join('\n')}`;
}
function formatInvoicesTable(invoices) {
    if (!invoices || invoices.length === 0) {
        return 'No invoices found in your PayPal account.';
    }
    const rows = invoices.map((inv) => {
        const id = inv.id || inv.invoice_number || '-';
        const recipient = inv.primary_recipients?.[0]?.billing_info?.name?.full_name || inv.primary_recipients?.[0]?.billing_info?.email_address || 'Customer';
        const amount = inv.amount ? `${inv.amount.currency_code || 'USD'} ${inv.amount.value}` : '-';
        const status = inv.status ? inv.status.replace(/_/g, ' ') : '-';
        const date = inv.detail?.invoice_date || '-';
        const dueDate = inv.detail?.payment_term?.due_date || '-';
        return `| \`${id}\` | ${recipient} | ${amount} | ${status} | ${date} | ${dueDate} |`;
    });
    return `### PayPal Invoices

| Invoice # | Recipient | Amount | Status | Invoice Date | Due Date |
|---|---|---|---|---|---|
${rows.join('\n')}`;
}
// ─── Quick Chip Direct Handler (No Model Call for Insights, Direct for Read-only) ─
async function executeQuickChipAction(chipType, customRequestId) {
    const requestId = customRequestId || `chip_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 7)}`;
    if (chipType === 'insights') {
        const localInsights = await getLocalDatabaseInsights();
        return {
            ok: true,
            toolName: 'merchant_insights',
            text: localInsights.tableMarkdown,
            toolCalls: [{
                    toolName: 'merchant_insights',
                    summary: 'ShopMate Database Insights',
                    ok: true,
                    status: 200,
                    subtitle: 'Based on ShopMate order data',
                }],
            canSummarize: true,
            requestId,
        };
    }
    const toolkit = (0, paypal_toolkit_1.getPayPalToolkit)();
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const nowIso = now.toISOString();
    let toolName = 'list_transactions';
    let args = {};
    if (chipType === 'transactions') {
        toolName = 'list_transactions';
        args = { start_date: sevenDaysAgo, end_date: nowIso };
    }
    else if (chipType === 'disputes') {
        toolName = 'list_disputes';
        args = {};
    }
    else if (chipType === 'invoices') {
        toolName = 'list_invoices';
        args = { page_size: 10 };
    }
    let parsedContent = null;
    let inspection;
    try {
        const toolResp = await toolkit.handleToolCall({
            id: `chip_call_${Date.now()}`,
            type: 'function',
            function: {
                name: toolName,
                arguments: JSON.stringify(args),
            },
        });
        try {
            parsedContent = typeof toolResp.content === 'string' ? JSON.parse(toolResp.content) : toolResp.content;
        }
        catch {
            parsedContent = toolResp.content;
        }
        inspection = inspectPayPalToolResult(toolName, parsedContent, args);
    }
    catch (toolErr) {
        inspection = inspectPayPalToolResult(toolName, null, args, toolErr);
    }
    if (inspection.isError) {
        logger_1.logger.warn({
            requestId,
            toolName,
            paypalHttpStatus: inspection.status,
            errorName: inspection.errorName,
            errorMessage: redactErrorMessage(inspection.errorMessage),
        }, '[paypal] Tool execution failed');
        return {
            ok: false,
            toolName,
            text: `**PayPal Request Failed**\n\n${inspection.plainReason}`,
            toolCalls: [{
                    toolName,
                    summary: inspection.plainReason,
                    ok: false,
                    status: inspection.status,
                    errorName: inspection.errorName,
                    message: inspection.plainReason,
                    subtitle: inspection.plainReason,
                }],
            canSummarize: false,
            requestId,
        };
    }
    logger_1.logger.info({
        requestId,
        toolName,
        redactedArgs: getRedactedArgs(args),
        paypalHttpStatus: 200,
        resultCount: inspection.resultCount,
    }, '[paypal] Tool execution succeeded');
    let text = '';
    if (chipType === 'transactions') {
        text = formatTransactionsTable(parsedContent?.transaction_details || []);
    }
    else if (chipType === 'disputes') {
        text = formatDisputesTable(parsedContent?.items || []);
    }
    else if (chipType === 'invoices') {
        text = formatInvoicesTable(parsedContent?.items || []);
    }
    return {
        ok: true,
        toolName,
        text,
        toolCalls: [{
                toolName,
                summary: inspection.summary,
                ok: true,
                status: 200,
                resultCount: inspection.resultCount,
                subtitle: inspection.subtitle,
            }],
        canSummarize: true,
        requestId,
    };
}
function buildFallbackToolSummary(toolCalls, functionResponses) {
    const lines = [];
    for (const tc of toolCalls) {
        lines.push(`### ${tc.toolName}`);
        lines.push(`- **Status:** ${tc.summary}`);
        if (tc.subtitle) {
            lines.push(`- **Result:** ${tc.subtitle}`);
        }
    }
    return lines.join('\n\n');
}
// ─── Merchant Copilot Chat Execution ─────────────────────────────────────────
async function merchantChat(adminId, message, history = [], actionConfirmed, customRequestId) {
    const requestId = customRequestId || `req_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 7)}`;
    const toolkit = (0, paypal_toolkit_1.getPayPalToolkit)();
    const clientInfo = getGeminiClient();
    // If a write action was confirmed by the admin, execute it directly
    if (actionConfirmed) {
        logger_1.logger.info({ requestId, toolName: actionConfirmed.toolName }, '[ai] Executing confirmed admin action');
        const execResult = await executeMerchantAction(actionConfirmed.toolName, actionConfirmed.parameters, requestId);
        return {
            text: `Action **${actionConfirmed.toolName}** executed successfully.\n\nResult:\n\`\`\`json\n${JSON.stringify(execResult.result, null, 2)}\n\`\`\``,
            toolCalls: [{
                    toolName: actionConfirmed.toolName,
                    summary: execResult.summary,
                    ok: execResult.success,
                    subtitle: execResult.summary,
                }],
            requestId,
        };
    }
    if (!clientInfo) {
        return {
            text: "AI service is currently offline or GEMINI_API_KEY is missing. You can view your PayPal Dashboard directly or configure your API key.",
            toolCalls: [],
            requestId,
        };
    }
    // Dynamic UTC Date Calculations
    const now = new Date();
    const nowIso = now.toISOString();
    const startOfTodayIso = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0)).toISOString();
    const endOfTodayIso = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999)).toISOString();
    const sevenDaysAgoIso = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const thirtyDaysAgoIso = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    // Convert PayPalAgentToolkit tools into Gemini function declarations
    const rawTools = toolkit.getTools();
    const functionDeclarations = rawTools.map(t => ({
        name: t.function.name,
        description: t.function.description || 'PayPal API tool',
        parametersJsonSchema: t.function.parameters,
    }));
    const systemInstruction = `You are ShopMate AI Copilot, a dedicated merchant business assistant.
You have direct integration with PayPal official APIs via PayPal Agent Toolkit.

CURRENT DATE & TIME (UTC):
- Current timestamp: ${nowIso}
- Today's date: ${nowIso.split('T')[0]}
- Start of today: ${startOfTodayIso}
- End of today: ${endOfTodayIso}
- 7 days ago: ${sevenDaysAgoIso}
- 30 days ago: ${thirtyDaysAgoIso}

STRICT DATE HANDLING RULES:
1. NEVER ask the merchant for date ranges or start/end dates.
2. Automatically resolve relative phrases into concrete ISO 8601 timestamps with timezone (e.g., 'YYYY-MM-DDTHH:mm:ssZ'):
   - "recent", "latest", or unspecified: default to the last 7 days (${sevenDaysAgoIso} to ${nowIso}).
   - "today": from ${startOfTodayIso} to ${endOfTodayIso} (or ${nowIso}).
   - "this week": from 7 days ago to ${nowIso}.
   - "last 30 days": from ${thirtyDaysAgoIso} to ${nowIso}.
   - A single date: treat it as that entire 24-hour day (00:00:00Z to 23:59:59Z on that date).
3. PAYPAL 31-DAY TRANSACTION SEARCH LIMIT:
   - PayPal transaction search (list_transactions) strictly allows a maximum interval of 31 days between start_date and end_date.
   - NEVER send a date range greater than 31 days to list_transactions.
   - All dates passed to PayPal tools MUST be full ISO 8601 strings with timezone (e.g. '${nowIso}').

CAPABILITIES:
- Transaction listing & history: list_transactions
- Reporting & Insights: get_merchant_insights
- Dispute management: list_disputes, get_dispute
- Invoicing: list_invoices, get_invoice, search_invoicing, create_invoice, send_invoice
- Orders & Shipment tracking: get_order, get_shipment_tracking, create_shipment_tracking

IMPORTANT RULES:
1. Always utilize the PayPal tools when asked for transactions, invoices, disputes, or metrics.
2. Read-only tools execute automatically.
3. If the merchant asks to create or send an invoice or make any changes, call the corresponding tool. The system will safely present a proposed action for admin confirmation before writing to PayPal.
4. If transactions or items are returned, summarize them with key metrics (total count, gross volume, fees, net amounts, and statuses).`;
    // Latency optimization: configure model with low reasoning/thinking level if supported
    const thinkingConfig = (clientInfo.model.includes('2.5') || clientInfo.model.includes('thinking'))
        ? { thinkingLevel: genai_1.ThinkingLevel.LOW }
        : undefined;
    const toolCalls = [];
    const executedToolSignatures = new Set();
    const failedToolNames = new Set();
    let proposedAction;
    // Run merchant flow with 45-second total request limit
    const runMerchantFlow = async () => {
        // Keep history short (last 4 items) for low latency
        const contents = buildGeminiContents(message, history, 4);
        let finalResponseText = '';
        const MAX_TOOL_ITERATIONS = 2;
        for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
            // 20-second timeout per model call
            const response = await withTimeout(clientInfo.ai.models.generateContent({
                model: clientInfo.model,
                contents: contents,
                config: {
                    systemInstruction,
                    tools: [{ functionDeclarations }],
                    temperature: 0.1,
                    thinkingConfig,
                },
            }), 20000);
            const funcCalls = response.functionCalls;
            if (!funcCalls || funcCalls.length === 0) {
                let directText = response.text?.trim() || '';
                if (!directText) {
                    const isGreeting = /^(hi|hello|hey|greetings|good\s*(morning|afternoon|evening))/i.test(message.trim()) && history.length <= 1;
                    if (isGreeting) {
                        directText = 'How can I assist you with your PayPal store operations?';
                    }
                    else {
                        logger_1.logger.info({ requestId }, '[ai] No function call and empty text, prompting direct answer');
                        const directAnswer = await withTimeout(clientInfo.ai.models.generateContent({
                            model: clientInfo.model,
                            contents: [
                                { role: 'user', parts: [{ text: `${systemInstruction}\n\nMerchant question: ${message}\n\nPlease answer the merchant clearly and directly.` }] }
                            ],
                            config: { temperature: 0.2, thinkingConfig },
                        }), 20000);
                        directText = directAnswer.text?.trim() || `I received your request regarding "${message}". However, no data was returned from PayPal. You can ask for "recent transactions", "merchant insights", or "open disputes".`;
                    }
                }
                finalResponseText = directText;
                break;
            }
            // Function calls present
            const functionResponses = [];
            for (const fc of funcCalls) {
                const name = fc.name || '';
                if (!name)
                    continue;
                let args = fc.args || {};
                // Intercept write actions: propose to admin
                if ((0, paypal_toolkit_1.isWriteAction)(name)) {
                    proposedAction = {
                        id: `act_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
                        toolName: name,
                        parameters: args,
                        summary: `Proposed write action: ${name}`,
                    };
                    toolCalls.push({
                        toolName: name,
                        summary: `Action Proposed: ${name} (Awaiting Admin Confirmation)`,
                        ok: true,
                        subtitle: 'Awaiting admin confirmation',
                    });
                    return {
                        text: `I have prepared the action **${name}**. Please review the parameters below and click **Confirm Action** to execute it in PayPal.`,
                        toolCalls,
                        proposedAction,
                        requestId,
                    };
                }
                // Never repeat an identical or failed tool call in the same request
                const signature = `${name}:${JSON.stringify(args)}`;
                if (failedToolNames.has(name)) {
                    functionResponses.push({
                        name,
                        response: { error: `Tool ${name} previously failed and cannot be repeated in this request.` },
                    });
                    continue;
                }
                if (executedToolSignatures.has(signature)) {
                    functionResponses.push({
                        name,
                        response: { error: `Tool ${name} was already executed with these arguments.` },
                    });
                    continue;
                }
                executedToolSignatures.add(signature);
                // Date clamping for transaction search
                if (name === 'list_transactions') {
                    const clampedResult = clampTransactionDates(args, now);
                    args = clampedResult.args;
                }
                const redactedArgs = getRedactedArgs(args);
                let parsedContent = null;
                let inspection;
                try {
                    const toolResp = await toolkit.handleToolCall({
                        id: `call_${Date.now()}`,
                        type: 'function',
                        function: {
                            name,
                            arguments: JSON.stringify(args),
                        },
                    });
                    try {
                        parsedContent = typeof toolResp.content === 'string' ? JSON.parse(toolResp.content) : toolResp.content;
                    }
                    catch {
                        parsedContent = toolResp.content;
                    }
                    inspection = inspectPayPalToolResult(name, parsedContent, args);
                }
                catch (toolErr) {
                    inspection = inspectPayPalToolResult(name, null, args, toolErr);
                }
                if (inspection.isError) {
                    // Log at warn level once
                    logger_1.logger.warn({
                        requestId,
                        toolName: name,
                        paypalHttpStatus: inspection.status,
                        errorName: inspection.errorName,
                        errorMessage: redactErrorMessage(inspection.errorMessage),
                    }, '[paypal] Tool execution failed');
                    // Mark failed so it will never be called again
                    failedToolNames.add(name);
                    toolCalls.push({
                        toolName: name,
                        summary: inspection.plainReason,
                        ok: false,
                        status: inspection.status,
                        errorName: inspection.errorName,
                        message: inspection.plainReason,
                        resultCount: 0,
                        subtitle: inspection.plainReason,
                    });
                    // If get_merchant_insights fails, build insights from our own database!
                    if (name === 'get_merchant_insights') {
                        const localInsights = await getLocalDatabaseInsights();
                        functionResponses.push({
                            name,
                            response: {
                                error: inspection.plainReason,
                                fallbackSource: 'ShopMate Database Insights',
                                localInsights,
                            },
                        });
                    }
                    else {
                        functionResponses.push({
                            name,
                            response: { error: inspection.plainReason },
                        });
                    }
                }
                else {
                    // Log at info level once
                    logger_1.logger.info({
                        requestId,
                        toolName: name,
                        redactedArgs,
                        paypalHttpStatus: 200,
                        resultCount: inspection.resultCount,
                    }, '[paypal] Tool execution succeeded');
                    toolCalls.push({
                        toolName: name,
                        summary: inspection.summary,
                        ok: true,
                        status: 200,
                        resultCount: inspection.resultCount,
                        subtitle: inspection.subtitle,
                    });
                    functionResponses.push({
                        name,
                        response: { output: parsedContent },
                    });
                }
            }
            // Append turn parts to contents
            const candidateParts = response.candidates?.[0]?.content?.parts || [];
            contents.push({
                role: 'model',
                parts: candidateParts,
            });
            contents.push({
                role: 'user',
                parts: functionResponses.map(fr => ({ functionResponse: fr })),
            });
        }
        // Generate final response turn if tools were called
        if (!finalResponseText && toolCalls.length > 0) {
            try {
                const finalRes = await withTimeout(clientInfo.ai.models.generateContent({
                    model: clientInfo.model,
                    contents: contents,
                    config: {
                        systemInstruction,
                        temperature: 0.1,
                        thinkingConfig,
                    },
                }), 20000);
                finalResponseText = finalRes.text?.trim() || '';
            }
            catch {
                // If model call fails, keep empty to trigger fallback
            }
            // Fallback for merchant insights failure: ensure local database tables are presented
            if (failedToolNames.has('get_merchant_insights')) {
                const localInsights = await getLocalDatabaseInsights();
                if (finalResponseText) {
                    finalResponseText = `${localInsights.tableMarkdown}\n\n### Summary\n${finalResponseText}`;
                }
                else {
                    finalResponseText = localInsights.tableMarkdown;
                }
            }
            // If still empty, build fallback summary directly from tool results
            if (!finalResponseText) {
                finalResponseText = buildFallbackToolSummary(toolCalls, []);
            }
        }
        return {
            text: finalResponseText || 'Here is the requested information.',
            toolCalls,
            requestId,
        };
    };
    try {
        // Strict 45-second limit for the whole merchant request
        const result = await withTimeout(runMerchantFlow(), 45000);
        logger_1.logger.info({ requestId, toolCallsCount: result.toolCalls.length, hasProposedAction: Boolean(result.proposedAction) }, '[ai] Merchant chat processed');
        return result;
    }
    catch (err) {
        const isTimeout = err?.name === 'TimeoutError' ||
            (typeof err?.message === 'string' && (err.message.toLowerCase().includes('timed out') || err.message.includes('timeout')));
        if (isTimeout) {
            logger_1.logger.warn({ requestId, err: err.message }, '[ai] Merchant copilot operation timed out');
            return {
                text: "The AI took too long, please try again.",
                toolCalls,
                requestId,
            };
        }
        const errorCode = extractErrorCode(err);
        const redactedMsg = redactErrorMessage(err?.message);
        const isBadRequest = errorCode === 400 ||
            err?.status === 400 ||
            err?.statusCode === 400 ||
            err instanceof AiValidationError ||
            (typeof err?.message === 'string' && (err.message.includes('400') || err.message.includes('INVALID_ARGUMENT')));
        if (isBadRequest) {
            logger_1.logger.error({
                requestId,
                stage: 'model call',
                errorCode: 400,
                errorMessage: redactedMsg,
            }, '[ai] Merchant copilot 400 Bad Request error');
            throw err;
        }
        logger_1.logger.warn({
            requestId,
            errorCode,
            errorMessage: redactedMsg,
        }, '[ai] Merchant chat error, falling back');
        return {
            text: "I'm having a slight connection delay right now. You can retry with a specific inquiry such as 'List invoices' or check your PayPal dashboard directly.",
            toolCalls,
            requestId,
        };
    }
}
async function executeMerchantAction(toolName, parameters, customRequestId) {
    const requestId = customRequestId || `act_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 7)}`;
    const toolkit = (0, paypal_toolkit_1.getPayPalToolkit)();
    try {
        const resp = await toolkit.handleToolCall({
            id: `exec_${Date.now()}`,
            type: 'function',
            function: {
                name: toolName,
                arguments: typeof parameters === 'string' ? parameters : JSON.stringify(parameters || {}),
            },
        });
        let parsed = resp.content;
        try {
            parsed = typeof resp.content === 'string' ? JSON.parse(resp.content) : resp.content;
        }
        catch {
            // Keep string
        }
        const summary = `Executed ${toolName} successfully`;
        logger_1.logger.info({ requestId, toolName }, '[paypal] Confirmed action executed successfully');
        return { success: true, result: parsed, summary, requestId };
    }
    catch (err) {
        logger_1.logger.warn({ requestId, err: err.message, toolName }, '[paypal] Action execution failed');
        return { success: false, result: { error: err.message }, summary: `Execution failed: ${err.message}`, requestId };
    }
}
//# sourceMappingURL=ai.service.js.map