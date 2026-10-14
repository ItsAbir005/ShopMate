import { GoogleGenAI } from '@google/genai';
import { getPayPalToolkit, isWriteAction } from './paypal-toolkit';
import { Product } from '../../models/Product';
import { Order, IOrder } from '../../models/Order';
import { User } from '../../models/User';
import { Shipment } from '../../models/Shipment';
import * as CartService from '../cart/cart.service';
import { logger } from '../../utils/logger';

// ─── Timeout Wrapper (Strict 8-second limit) ─────────────────────────────────

export async function withTimeout<T>(promise: Promise<T>, timeoutMs = 8000, fallbackVal?: T): Promise<T> {
    let timer: NodeJS.Timeout;
    const timeoutPromise = new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
            reject(new Error(`AI operation timed out after ${timeoutMs}ms`));
        }, timeoutMs);
    });

    try {
        const result = await Promise.race([promise, timeoutPromise]);
        clearTimeout(timer!);
        return result;
    } catch (err) {
        clearTimeout(timer!);
        if (fallbackVal !== undefined) return fallbackVal;
        throw err;
    }
}

// ─── Gemini Client Accessor ──────────────────────────────────────────────────

function getGeminiClient(): { ai: GoogleGenAI; model: string } | null {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return null;
    const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    return { ai: new GoogleGenAI({ apiKey }), model };
}

// ─── Gemini Contents & Error Helpers ─────────────────────────────────────────

export class AiValidationError extends Error {
    readonly statusCode = 400;
    constructor(message: string) {
        super(message);
        this.name = 'AiValidationError';
    }
}

export type AiStage = 'building contents' | 'model call' | 'tool execution' | 'tool result';

export interface GeminiContent {
    role: 'user' | 'model';
    parts: Array<{ text: string }>;
}

export function redactErrorMessage(msg?: string): string {
    if (!msg || typeof msg !== 'string') return 'Unknown error';
    return msg
        .replace(/AIza[0-9A-Za-z-_]{35}/g, '[REDACTED_API_KEY]')
        .replace(/(access_token|client_secret|authorization|bearer)\s*[:=]\s*[^\s,;]+/gi, '$1:[REDACTED]')
        .slice(0, 200);
}

export function extractErrorCode(err: any): string | number {
    if (err?.statusCode) return err.statusCode;
    if (err?.status) return err.status;
    if (err?.code) return err.code;
    if (err?.error?.code) return err.error.code;
    if (err?.error?.status) return err.error.status;
    if (err?.name === 'TimeoutError' || (typeof err?.message === 'string' && err.message.toLowerCase().includes('timed out'))) {
        return 'TIMEOUT';
    }
    const match = typeof err?.message === 'string' ? err.message.match(/\b(4\d\d|5\d\d)\b/) : null;
    if (match) return parseInt(match[1], 10);
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
export function buildGeminiContents(
    newMessage: string,
    rawHistory: any[] = []
): GeminiContent[] {
    if (typeof newMessage !== 'string' || !newMessage.trim()) {
        throw new AiValidationError('User message cannot be empty');
    }
    const cleanNewMessage = newMessage.trim();

    const cleaned: GeminiContent[] = [];

    if (Array.isArray(rawHistory)) {
        for (const item of rawHistory) {
            if (!item || typeof item !== 'object') continue;

            const rawText = typeof item.text === 'string'
                ? item.text
                : (typeof item.content === 'string' ? item.content : '');
            const trimmed = rawText.trim();

            if (!trimmed) continue;

            const rawRole = (typeof item.role === 'string' ? item.role.toLowerCase() : '').trim();
            let role: 'user' | 'model';
            if (rawRole === 'user') {
                role = 'user';
            } else if (rawRole === 'assistant' || rawRole === 'bot' || rawRole === 'model') {
                role = 'model';
            } else {
                role = 'user';
            }

            cleaned.push({
                role,
                parts: [{ text: trimmed }],
            });
        }
    }

    const limited = cleaned.slice(-10);

    const alternating: GeminiContent[] = [];
    for (const item of limited) {
        if (alternating.length > 0 && alternating[alternating.length - 1].role === item.role) {
            alternating[alternating.length - 1].parts[0].text += `\n${item.parts[0].text}`;
        } else {
            alternating.push({ role: item.role, parts: [{ text: item.parts[0].text }] });
        }
    }

    while (alternating.length > 0 && alternating[0].role === 'model') {
        alternating.shift();
    }

    if (alternating.length > 0 && alternating[alternating.length - 1].role === 'user') {
        if (alternating[alternating.length - 1].parts[0].text === cleanNewMessage) {
            // Already includes this message
        } else {
            alternating[alternating.length - 1].parts[0].text += `\n${cleanNewMessage}`;
        }
    } else {
        alternating.push({
            role: 'user',
            parts: [{ text: cleanNewMessage }],
        });
    }

    return alternating;
}

// ─── Part 4: Risk Check Before PayPal Create-Order ───────────────────────────

export interface RiskCheckResult {
    decision: 'approve' | 'review' | 'flag';
    reason: string;
    signals: {
        orderTotal: number;
        accountAgeDays: number;
        ordersInLastHour: number;
        addressChanges: number;
    };
}

export async function evaluateOrderRisk(order: IOrder): Promise<RiskCheckResult> {
    const userId = order.user_id;
    let accountAgeDays = 0;
    let addressChanges = 1;

    try {
        const user = await User.findById(userId);
        if (user?.createdAt) {
            const ageMs = Date.now() - new Date(user.createdAt).getTime();
            accountAgeDays = Math.max(0, Math.floor(ageMs / (1000 * 60 * 60 * 24)));
        }
        if (user?.addresses && user.addresses.length > 0) {
            addressChanges = user.addresses.length;
        }
    } catch {
        // Soft-fail on user signal query
    }

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    let ordersInLastHour = 0;
    try {
        ordersInLastHour = await Order.countDocuments({
            user_id: userId,
            createdAt: { $gte: oneHourAgo },
            _id: { $ne: order._id },
        });
    } catch {
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
        logger.info({ signals }, '[ai] Risk assessment fallback: GEMINI_API_KEY not configured');
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

        const generateRisk = async (): Promise<RiskCheckResult> => {
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
        logger.info({ decision: result.decision, orderId: order._id }, '[ai] Order risk evaluated successfully');
        return result;
    } catch (err: any) {
        logger.warn({ err: err.message, orderId: order._id }, '[ai] Risk assessment error or timeout, defaulting to approve');
        return {
            decision: 'approve',
            reason: 'AI unavailable',
            signals,
        };
    }
}

// ─── Part 3: Delivery to PayPal Sync ─────────────────────────────────────────

export async function syncDeliveryTrackingToPayPal(shipmentId: string): Promise<boolean> {
    try {
        const shipment = await Shipment.findById(shipmentId);
        if (!shipment) return false;

        // Idempotency: don't sync twice
        if (shipment.paypalTrackingSynced) {
            logger.info({ shipmentId, trackingCode: shipment.trackingCode }, '[paypal] Shipment tracking already synced to PayPal');
            return true;
        }

        const order = await Order.findById(shipment.order_id);
        if (!order) return false;

        const transactionId = order.paypalCaptureId || order.paypalOrderId;
        if (!transactionId) {
            logger.info({ orderId: order._id }, '[paypal] No PayPal transaction ID on order to sync tracking');
            return false;
        }

        const toolkit = getPayPalToolkit();
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
            logger.info({ shipmentId, trackingCode: shipment.trackingCode, transactionId }, '[paypal] Shipment delivery synced to PayPal successfully');
            return true;
        } catch (callErr: any) {
            logger.warn({ err: callErr.message, shipmentId }, '[paypal] Failed to sync delivery tracking to PayPal');
            return false;
        }
    } catch (err: any) {
        logger.warn({ err: err.message, shipmentId }, '[paypal] Unexpected error in delivery tracking sync');
        return false;
    }
}

// ─── Part 2: Customer Shopping Agent (POST /api/ai/assistant) ────────────────

interface AssistantToolCall {
    toolName: string;
    summary: string;
    result?: any;
}

export async function customerAssistantChat(
    userId: string | undefined,
    message: string,
    history: any[] = []
): Promise<{ text: string; toolCalls: AssistantToolCall[]; products?: any[]; orderStatus?: any; cartUpdated?: boolean }> {
    const clientInfo = getGeminiClient();

    // Local tool execution functions
    async function execSearchProducts(query: string, maxPrice?: number) {
        const filter: any = { status: { $ne: 'archived' } };
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

        const products = await Product.find(filter).populate('category_id', 'name').limit(5).lean();
        return products.map(p => ({
            id: p._id.toString(),
            title: p.title,
            price: p.price,
            stock: p.stock,
            category: (p.category_id as any)?.name || 'General',
            image: p.images?.[0] || '',
        }));
    }

    async function execAddToCart(productId: string, qty = 1) {
        if (!userId) {
            return {
                success: false,
                loginRequired: true,
                message: 'You must be signed in to add items to your cart.',
            };
        }
        const product = await Product.findById(productId);
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
        const orders = await Order.find({ user_id: userId })
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
        const shipments = await Shipment.find({ order_id: { $in: orderIds } }).lean();
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

    async function execGetMyOrderStatus(orderId?: string) {
        if (!userId) {
            return {
                success: false,
                loginRequired: true,
                message: 'Please sign in to view your orders.',
            };
        }

        if (orderId) {
            const order = await Order.findById(orderId).lean();
            if (!order || order.user_id.toString() !== userId) {
                return { success: false, message: 'Order not found or unauthorized.' };
            }
            const shipment = await Shipment.findOne({ order_id: order._id }).lean();
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
        logger.info('[ai] Assistant running in fallback mode (GEMINI_API_KEY missing)');
        const lower = message.toLowerCase();
        const toolCalls: AssistantToolCall[] = [];

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
    const functionDeclarations: any[] = [
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

    const toolCalls: AssistantToolCall[] = [];
    let productsResult: any[] | undefined;
    let orderStatusResult: any | undefined;
    let cartUpdatedResult = false;
    let stage: AiStage = 'building contents';

    try {
        stage = 'building contents';
        const contents = buildGeminiContents(message, history);

        const runTurn = async () => {
            stage = 'model call';
            const response1 = await clientInfo.ai.models.generateContent({
                model: clientInfo.model,
                contents: contents as any,
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
            const functionResponses: any[] = [];
            for (const fc of funcCalls) {
                const name = fc.name || '';
                if (!name) continue;
                const args: any = fc.args || {};
                let result: any = {};

                if (name === 'searchProducts') {
                    result = await execSearchProducts(args.query, args.maxPrice);
                    productsResult = result;
                    toolCalls.push({ toolName: name, summary: `Found ${result.length} products matching query`, result });
                } else if (name === 'addToCart') {
                    result = await execAddToCart(args.productId, args.qty);
                    if (result.success) cartUpdatedResult = true;
                    toolCalls.push({ toolName: name, summary: result.message, result });
                } else if (name === 'getMyOrders') {
                    result = await execGetMyOrders(args.limit);
                    orderStatusResult = { recentOrders: result.orders };
                    toolCalls.push({
                        toolName: name,
                        summary: result.success ? `Retrieved ${result.orders?.length || 0} recent orders` : result.message,
                        result,
                    });
                } else if (name === 'getMyOrderStatus') {
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
                parts: candidateParts as any,
            });
            contents.push({
                role: 'user',
                parts: functionResponses.map(fr => ({ functionResponse: fr })),
            } as any);

            const response2 = await clientInfo.ai.models.generateContent({
                model: clientInfo.model,
                contents: contents as any,
                config: {
                    systemInstruction,
                    temperature: 0.2,
                },
            });

            return response2.text || 'I have updated your request.';
        };

        const replyText = await withTimeout(runTurn(), 8000);
        logger.info({ toolCallsCount: toolCalls.length }, '[ai] Customer assistant handled message');
        return {
            text: replyText,
            toolCalls,
            products: productsResult,
            orderStatus: orderStatusResult,
            cartUpdated: cartUpdatedResult,
        };
    } catch (err: any) {
        const errorCode = extractErrorCode(err);
        const redactedMsg = redactErrorMessage(err?.message);

        const isBadRequest = errorCode === 400 ||
            err?.status === 400 ||
            err?.statusCode === 400 ||
            err instanceof AiValidationError ||
            (typeof err?.message === 'string' && (err.message.includes('400') || err.message.includes('INVALID_ARGUMENT')));

        if (isBadRequest) {
            logger.error({
                stage,
                errorCode: 400,
                errorMessage: redactedMsg,
            }, '[ai] Customer assistant 400 Bad Request error');
            throw err;
        }

        logger.warn({
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

// ─── Part 1: Merchant Agent (POST /api/ai/merchant) ──────────────────────────

export interface ProposedAction {
    id: string;
    toolName: string;
    parameters: any;
    summary: string;
}

export interface ToolCallResultInfo {
    toolName: string;
    summary: string;
    resultCount?: number;
    subtitle?: string;
}

export interface MerchantChatResponse {
    text: string;
    toolCalls: ToolCallResultInfo[];
    proposedAction?: ProposedAction;
    requestId?: string;
}

export function extractPayPalErrorReason(toolName: string, err: any, args?: any): string {
    const rawMsg = typeof err === 'string' ? err : (err?.message || JSON.stringify(err || ''));
    const lower = rawMsg.toLowerCase();

    if (
        lower.includes('not_authorized') ||
        lower.includes('permission_denied') ||
        lower.includes('not enabled') ||
        lower.includes('no permission') ||
        lower.includes('unauthorized') ||
        lower.includes('authorization_error')
    ) {
        if (toolName === 'list_transactions') {
            return 'PayPal denied this request: Transaction Search is not enabled for this app in PayPal Developer Dashboard';
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

export function getRedactedArgs(args: any): Record<string, any> {
    if (!args || typeof args !== 'object') return {};
    const safe: Record<string, any> = {};
    const SAFE_KEYS = new Set([
        'start_date', 'end_date', 'startDate', 'endDate',
        'date_from', 'date_to', 'from_date', 'to_date',
        'page', 'page_size', 'pageSize', 'limit', 'total_count_required',
        'transaction_status', 'status', 'dispute_state'
    ]);
    for (const [key, value] of Object.entries(args)) {
        if (SAFE_KEYS.has(key)) {
            safe[key] = value;
        } else if (/token|secret|key|pass|auth|email|payer|card/i.test(key)) {
            safe[key] = '[REDACTED]';
        }
    }
    return safe;
}

export function clampTransactionDates(args: any, now: Date): { args: any; clamped: boolean } {
    const safeArgs = { ...(args || {}) };
    const MAX_DAYS_MS = 31 * 24 * 60 * 60 * 1000;
    const DEFAULT_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

    let endDate: Date;
    if (safeArgs.end_date) {
        endDate = new Date(safeArgs.end_date);
        if (isNaN(endDate.getTime())) endDate = now;
    } else {
        endDate = now;
    }

    let startDate: Date;
    if (safeArgs.start_date) {
        startDate = new Date(safeArgs.start_date);
        if (isNaN(startDate.getTime())) {
            startDate = new Date(endDate.getTime() - DEFAULT_DAYS_MS);
        }
    } else {
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

export function formatToolResultDetails(toolName: string, data: any, args?: any): {
    summary: string;
    subtitle: string;
    resultCount: number;
    errorReason?: string;
    httpStatus: number;
} {
    if (!data) {
        return {
            summary: `Called ${toolName}`,
            subtitle: `PayPal returned no data`,
            resultCount: 0,
            httpStatus: 200,
        };
    }

    if (data.error || data.name === 'NOT_AUTHORIZED' || data.name === 'PERMISSION_DENIED') {
        const errReason = extractPayPalErrorReason(toolName, data.error || data, args);
        return {
            summary: errReason,
            subtitle: `PayPal error: ${errReason}`,
            resultCount: 0,
            errorReason: errReason,
            httpStatus: data.status || 403,
        };
    }

    if (toolName === 'list_transactions') {
        const count = Array.isArray(data.transaction_details) ? data.transaction_details.length : 0;
        const startStr = args?.start_date ? args.start_date.split('T')[0] : '';
        const endStr = args?.end_date ? args.end_date.split('T')[0] : '';
        const dateRangeStr = startStr && endStr ? ` between ${startStr} and ${endStr}` : '';

        if (count === 0) {
            return {
                summary: `No transactions found${dateRangeStr}`,
                subtitle: `PayPal returned 0 transactions`,
                resultCount: 0,
                httpStatus: 200,
            };
        }
        return {
            summary: `Retrieved ${count} transactions from PayPal${dateRangeStr}`,
            subtitle: `PayPal returned ${count} transaction${count === 1 ? '' : 's'}`,
            resultCount: count,
            httpStatus: 200,
        };
    }

    if (toolName === 'list_invoices' || toolName === 'search_invoicing') {
        const count = Array.isArray(data.items) ? data.items.length : (data.total_items || 0);
        return {
            summary: `Found ${count} invoices in PayPal account`,
            subtitle: `PayPal returned ${count} invoice${count === 1 ? '' : 's'}`,
            resultCount: count,
            httpStatus: 200,
        };
    }

    if (toolName === 'list_disputes') {
        const count = Array.isArray(data.items) ? data.items.length : 0;
        return {
            summary: `Retrieved ${count} dispute records`,
            subtitle: `PayPal returned ${count} dispute${count === 1 ? '' : 's'}`,
            resultCount: count,
            httpStatus: 200,
        };
    }

    if (toolName === 'get_merchant_insights') {
        return {
            summary: 'Retrieved PayPal business analytics and metrics',
            subtitle: 'PayPal returned business analytics',
            resultCount: 1,
            httpStatus: 200,
        };
    }

    return {
        summary: `Successfully executed ${toolName}`,
        subtitle: `PayPal executed ${toolName}`,
        resultCount: 1,
        httpStatus: 200,
    };
}

function buildFallbackToolSummary(
    toolCalls: ToolCallResultInfo[],
    functionResponses: any[]
): string {
    const lines: string[] = [];
    for (const tc of toolCalls) {
        lines.push(`### ${tc.toolName}`);
        lines.push(`- **Status:** ${tc.summary}`);
        if (tc.subtitle) {
            lines.push(`- **Result:** ${tc.subtitle}`);
        }
    }
    return lines.join('\n\n');
}

export async function merchantChat(
    adminId: string,
    message: string,
    history: any[] = [],
    actionConfirmed?: { toolName: string; parameters: any },
    customRequestId?: string
): Promise<MerchantChatResponse> {
    const requestId = customRequestId || `req_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 7)}`;
    const toolkit = getPayPalToolkit();
    const clientInfo = getGeminiClient();

    // If a write action was confirmed by the admin, execute it directly
    if (actionConfirmed) {
        logger.info({ requestId, toolName: actionConfirmed.toolName }, '[ai] Executing confirmed admin action');
        const execResult = await executeMerchantAction(actionConfirmed.toolName, actionConfirmed.parameters, requestId);
        return {
            text: `Action **${actionConfirmed.toolName}** executed successfully.\n\nResult:\n\`\`\`json\n${JSON.stringify(execResult.result, null, 2)}\n\`\`\``,
            toolCalls: [{ toolName: actionConfirmed.toolName, summary: execResult.summary, subtitle: execResult.summary }],
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
    const functionDeclarations: any[] = rawTools.map(t => ({
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
   - NEVER send a date range greater than 31 days to list_transactions. If the user asks for a wider range (e.g. "last 60 days"), clamp to the most recent 31-day interval and note this PayPal restriction in your answer.
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
4. Format numbers, currencies, and dates cleanly. Always cite the PayPal data retrieved.
5. If transactions or items are returned, summarize them with key metrics (total count, gross volume, fees, net amounts, and statuses).`;

    const toolCalls: ToolCallResultInfo[] = [];
    let proposedAction: ProposedAction | undefined;
    let stage: AiStage = 'building contents';

    try {
        stage = 'building contents';
        const contents = buildGeminiContents(message, history);

        const runTurn = async (): Promise<MerchantChatResponse> => {
            stage = 'model call';
            const response1 = await clientInfo.ai.models.generateContent({
                model: clientInfo.model,
                contents: contents as any,
                config: {
                    systemInstruction,
                    tools: [{ functionDeclarations }],
                    temperature: 0.1,
                },
            });

            const funcCalls = response1.functionCalls;
            if (!funcCalls || funcCalls.length === 0) {
                let directText = response1.text?.trim() || '';

                // If directText is empty, do NOT fall back to generic phrase for queries!
                if (!directText) {
                    const isGreeting = /^(hi|hello|hey|greetings|good\s*(morning|afternoon|evening))/i.test(message.trim()) && history.length <= 1;
                    if (isGreeting) {
                        directText = 'How can I assist you with your PayPal store operations?';
                    } else {
                        logger.info({ requestId }, '[ai] No function call and empty text, prompting direct answer');
                        const directAnswer = await clientInfo.ai.models.generateContent({
                            model: clientInfo.model,
                            contents: [
                                { role: 'user', parts: [{ text: `${systemInstruction}\n\nMerchant question: ${message}\n\nPlease answer the merchant clearly and directly.` }] }
                            ],
                            config: { temperature: 0.2 },
                        });
                        directText = directAnswer.text?.trim() || `I received your request regarding "${message}". However, no data was returned from PayPal. You can ask for "recent transactions", "merchant insights", or "open disputes".`;
                    }
                }

                return {
                    text: directText,
                    toolCalls: [],
                    requestId,
                };
            }

            const functionResponses: any[] = [];

            stage = 'tool execution';
            for (const fc of funcCalls) {
                const name = fc.name || '';
                if (!name) continue;
                let args = fc.args || {};

                // Intercept write actions: do NOT run automatically, propose to admin
                if (isWriteAction(name)) {
                    proposedAction = {
                        id: `act_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
                        toolName: name,
                        parameters: args,
                        summary: `Proposed write action: ${name}`,
                    };
                    toolCalls.push({
                        toolName: name,
                        summary: `Action Proposed: ${name} (Awaiting Admin Confirmation)`,
                        subtitle: `Awaiting admin confirmation`,
                    });
                    // Skip execution, return proposed action
                    return {
                        text: `I have prepared the action **${name}**. Please review the parameters below and click **Confirm Action** to execute it in PayPal.`,
                        toolCalls,
                        proposedAction,
                        requestId,
                    };
                }

                // If list_transactions, enforce 31-day clamping and default date range in code
                if (name === 'list_transactions') {
                    const clampedResult = clampTransactionDates(args, now);
                    args = clampedResult.args;
                }

                const redactedArgs = getRedactedArgs(args);

                // Read-only tool execution
                try {
                    const toolResp = await toolkit.handleToolCall({
                        id: `call_${Date.now()}`,
                        type: 'function',
                        function: {
                            name,
                            arguments: JSON.stringify(args),
                        },
                    });

                    let parsedContent: any = toolResp.content;
                    try {
                        parsedContent = typeof toolResp.content === 'string' ? JSON.parse(toolResp.content) : toolResp.content;
                    } catch {
                        // Keep as string
                    }

                    const details = formatToolResultDetails(name, parsedContent, args);
                    toolCalls.push({
                        toolName: name,
                        summary: details.summary,
                        resultCount: details.resultCount,
                        subtitle: details.subtitle,
                    });

                    logger.info({
                        requestId,
                        toolName: name,
                        redactedArgs,
                        paypalHttpStatus: details.httpStatus,
                        resultCount: details.resultCount,
                    }, '[paypal] Tool execution succeeded');

                    functionResponses.push({
                        name,
                        response: { output: parsedContent },
                    });
                } catch (toolErr: any) {
                    const plainReason = extractPayPalErrorReason(name, toolErr, args);
                    const statusMatch = (toolErr.message || '').match(/\b(4\d\d|5\d\d)\b/);
                    const httpStatus = toolErr.status || toolErr.statusCode || (statusMatch ? parseInt(statusMatch[1], 10) : 500);

                    logger.warn({
                        requestId,
                        stage: 'tool execution',
                        toolName: name,
                        redactedArgs,
                        paypalHttpStatus: httpStatus,
                        errorName: toolErr.name || 'PayPalToolError',
                        errorMessage: redactErrorMessage(toolErr.message),
                        resultCount: 0,
                    }, '[paypal] Tool execution failed');

                    toolCalls.push({
                        toolName: name,
                        summary: plainReason,
                        resultCount: 0,
                        subtitle: plainReason,
                    });

                    functionResponses.push({
                        name,
                        response: { error: plainReason },
                    });
                }
            }

            // Second turn with tool results
            stage = 'tool result';
            const candidateParts = response1.candidates?.[0]?.content?.parts || [];
            contents.push({
                role: 'model',
                parts: candidateParts as any,
            });
            contents.push({
                role: 'user',
                parts: functionResponses.map(fr => ({ functionResponse: fr })),
            } as any);

            const response2 = await clientInfo.ai.models.generateContent({
                model: clientInfo.model,
                contents: contents as any,
                config: {
                    systemInstruction,
                    temperature: 0.1,
                },
            });

            let responseText = response2.text?.trim() || '';

            // If the model returns no text after a tool call, run a second turn to summarize the tool result
            if (!responseText) {
                logger.info({ requestId }, '[ai] Second turn returned empty text, requesting tool summary');
                contents.push({
                    role: 'user',
                    parts: [{ text: 'Please summarize the PayPal tool results above clearly for the merchant in markdown, including counts, amounts, statuses, and any key details.' }],
                });
                const responseSummary = await clientInfo.ai.models.generateContent({
                    model: clientInfo.model,
                    contents: contents as any,
                    config: {
                        systemInstruction,
                        temperature: 0.2,
                    },
                });
                responseText = responseSummary.text?.trim() || '';
            }

            // If still empty, build fallback summary directly from tool results
            if (!responseText) {
                responseText = buildFallbackToolSummary(toolCalls, functionResponses);
            }

            return {
                text: responseText,
                toolCalls,
                requestId,
            };
        };

        const result = await withTimeout(runTurn(), 8000);
        logger.info({ requestId, toolCallsCount: result.toolCalls.length, hasProposedAction: Boolean(result.proposedAction) }, '[ai] Merchant chat processed');
        return result;
    } catch (err: any) {
        const errorCode = extractErrorCode(err);
        const redactedMsg = redactErrorMessage(err?.message);

        const isBadRequest = errorCode === 400 ||
            err?.status === 400 ||
            err?.statusCode === 400 ||
            err instanceof AiValidationError ||
            (typeof err?.message === 'string' && (err.message.includes('400') || err.message.includes('INVALID_ARGUMENT')));

        if (isBadRequest) {
            logger.error({
                requestId,
                stage,
                errorCode: 400,
                errorMessage: redactedMsg,
            }, '[ai] Merchant copilot 400 Bad Request error');
            throw err;
        }

        logger.warn({
            requestId,
            stage,
            errorCode,
            errorMessage: redactedMsg,
        }, '[ai] Merchant chat error or timeout, falling back');

        return {
            text: "I'm having a slight connection delay right now. You can retry with a specific inquiry such as 'List invoices' or check your PayPal dashboard directly.",
            toolCalls: [],
            requestId,
        };
    }
}

export async function executeMerchantAction(
    toolName: string,
    parameters: any,
    customRequestId?: string
): Promise<{ success: boolean; result: any; summary: string; requestId?: string }> {
    const requestId = customRequestId || `act_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 7)}`;
    const toolkit = getPayPalToolkit();
    try {
        const resp = await toolkit.handleToolCall({
            id: `exec_${Date.now()}`,
            type: 'function',
            function: {
                name: toolName,
                arguments: typeof parameters === 'string' ? parameters : JSON.stringify(parameters || {}),
            },
        });

        let parsed: any = resp.content;
        try {
            parsed = typeof resp.content === 'string' ? JSON.parse(resp.content) : resp.content;
        } catch {
            // Keep string
        }

        const summary = `Executed ${toolName} successfully`;
        logger.info({ requestId, toolName }, '[paypal] Confirmed action executed successfully');
        return { success: true, result: parsed, summary, requestId };
    } catch (err: any) {
        logger.warn({ requestId, err: err.message, toolName }, '[paypal] Action execution failed');
        return { success: false, result: { error: err.message }, summary: `Execution failed: ${err.message}`, requestId };
    }
}
