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
exports.withTimeout = withTimeout;
exports.evaluateOrderRisk = evaluateOrderRisk;
exports.syncDeliveryTrackingToPayPal = syncDeliveryTrackingToPayPal;
exports.customerAssistantChat = customerAssistantChat;
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
        // Return recent orders for user
        const orders = await Order_1.Order.find({ user_id: userId }).sort({ createdAt: -1 }).limit(3).lean();
        return {
            success: true,
            recentOrders: orders.map(o => ({
                id: o._id.toString(),
                status: o.status,
                paymentStatus: o.payment_status,
                total: o.total_amount,
                itemsCount: o.order_items.length,
            })),
        };
    }
    // Fallback if AI not configured
    if (!clientInfo) {
        logger_1.logger.info('[ai] Assistant running in fallback mode (GEMINI_API_KEY missing)');
        const lower = message.toLowerCase();
        const toolCalls = [];
        if (lower.includes('order') || lower.includes('track') || lower.includes('status')) {
            const res = await execGetMyOrderStatus();
            toolCalls.push({ toolName: 'getMyOrderStatus', summary: 'Looked up recent orders' });
            if (!userId) {
                return { text: 'Please sign in to view your orders and live tracking.', toolCalls };
            }
            if (!res.recentOrders || res.recentOrders.length === 0) {
                return { text: "You don't have any recent orders yet. Ready to start shopping?", toolCalls };
            }
            const orderList = res.recentOrders.map(o => `• Order #${o.id.slice(-8).toUpperCase()}: Status: ${o.status}, Total: $${o.total.toFixed(2)}`).join('\n');
            return { text: `Here are your recent orders:\n${orderList}\n\nTrack full details on your Orders page.`, toolCalls, orderStatus: res };
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
            name: 'getMyOrderStatus',
            description: 'Retrieve status and shipment tracking code for the customer orders. Returns own orders only.',
            parametersJsonSchema: {
                type: 'object',
                properties: {
                    orderId: { type: 'string', description: 'Optional specific Order ID to inspect' },
                },
            },
        },
    ];
    const systemInstruction = `You are the official ShopMate customer shopping agent.
RULES:
1. Answers must come from tool results ONLY. Never fabricate products, prices, or orders.
2. If asked about items, call "searchProducts".
3. If asked to add to cart, call "addToCart". If the result says login is required, tell the customer to sign in.
4. If asked about order status, delivery, or tracking, call "getMyOrderStatus".
5. PAYMENT NOTICE: Payment always happens in the normal PayPal checkout. You cannot collect payments in chat. Always direct customers to "/orders/checkout" or their order page to complete PayPal payment.
6. Keep answers friendly, concise, and helpful.`;
    const toolCalls = [];
    let productsResult;
    let orderStatusResult;
    let cartUpdatedResult = false;
    try {
        const runTurn = async () => {
            const contents = [];
            // Add previous history
            for (const h of history.slice(-6)) {
                contents.push({
                    role: h.role === 'assistant' ? 'model' : 'user',
                    parts: [{ text: h.text }],
                });
            }
            contents.push({
                role: 'user',
                parts: [{ text: message }],
            });
            // Initial model call
            const response1 = await clientInfo.ai.models.generateContent({
                model: clientInfo.model,
                contents,
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
                    toolCalls.push({ toolName: name, summary: `Found ${result.length} products matching "${args.query}"`, result });
                }
                else if (name === 'addToCart') {
                    result = await execAddToCart(args.productId, args.qty);
                    if (result.success)
                        cartUpdatedResult = true;
                    toolCalls.push({ toolName: name, summary: result.message, result });
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
                contents,
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
        logger_1.logger.warn({ err: err.message }, '[ai] Customer assistant error or timeout, falling back');
        return {
            text: "I'm having a slight connection delay right now. You can browse our catalog, check your cart, or visit the Orders page directly!",
            toolCalls: [],
        };
    }
}
async function merchantChat(adminId, message, history = [], actionConfirmed) {
    const toolkit = (0, paypal_toolkit_1.getPayPalToolkit)();
    const clientInfo = getGeminiClient();
    // If a write action was confirmed by the admin, execute it directly
    if (actionConfirmed) {
        logger_1.logger.info({ toolName: actionConfirmed.toolName }, '[ai] Executing confirmed admin action');
        const execResult = await executeMerchantAction(actionConfirmed.toolName, actionConfirmed.parameters);
        return {
            text: `Action **${actionConfirmed.toolName}** executed successfully.\n\nResult:\n\`\`\`json\n${JSON.stringify(execResult.result, null, 2)}\n\`\`\``,
            toolCalls: [{ toolName: actionConfirmed.toolName, summary: execResult.summary }],
        };
    }
    if (!clientInfo) {
        return {
            text: "AI service is currently offline or GEMINI_API_KEY is missing. You can view your PayPal Dashboard directly or configure your API key.",
            toolCalls: [],
        };
    }
    // Convert PayPalAgentToolkit tools into Gemini function declarations
    const rawTools = toolkit.getTools();
    const functionDeclarations = rawTools.map(t => ({
        name: t.function.name,
        description: t.function.description || 'PayPal API tool',
        parametersJsonSchema: t.function.parameters,
    }));
    const systemInstruction = `You are ShopMate AI Copilot, a dedicated merchant business assistant.
You have direct integration with PayPal official APIs via PayPal Agent Toolkit.
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
4. Format numbers, currencies, and dates cleanly. Always cite the PayPal data retrieved.`;
    const toolCalls = [];
    let proposedAction;
    try {
        const runTurn = async () => {
            const contents = [];
            for (const h of history.slice(-6)) {
                contents.push({
                    role: h.role === 'assistant' ? 'model' : 'user',
                    parts: [{ text: h.text }],
                });
            }
            contents.push({
                role: 'user',
                parts: [{ text: message }],
            });
            const response1 = await clientInfo.ai.models.generateContent({
                model: clientInfo.model,
                contents,
                config: {
                    systemInstruction,
                    tools: [{ functionDeclarations }],
                    temperature: 0.1,
                },
            });
            const funcCalls = response1.functionCalls;
            if (!funcCalls || funcCalls.length === 0) {
                return {
                    text: response1.text || 'How can I assist you with your PayPal store operations?',
                    toolCalls: [],
                };
            }
            const functionResponses = [];
            for (const fc of funcCalls) {
                const name = fc.name || '';
                if (!name)
                    continue;
                const args = fc.args || {};
                // Intercept write actions: do NOT run automatically, propose to admin
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
                    });
                    // Skip execution, return proposed action
                    return {
                        text: `I have prepared the action **${name}**. Please review the parameters below and click **Confirm Action** to execute it in PayPal.`,
                        toolCalls,
                        proposedAction,
                    };
                }
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
                    let parsedContent = toolResp.content;
                    try {
                        parsedContent = typeof toolResp.content === 'string' ? JSON.parse(toolResp.content) : toolResp.content;
                    }
                    catch {
                        // Keep as string
                    }
                    const summary = formatToolResultSummary(name, parsedContent);
                    toolCalls.push({ toolName: name, summary });
                    functionResponses.push({
                        name,
                        response: { output: parsedContent },
                    });
                }
                catch (toolErr) {
                    logger_1.logger.warn({ err: toolErr.message, toolName: name }, '[ai] PayPal tool execution soft error');
                    toolCalls.push({ toolName: name, summary: `Error: ${toolErr.message}` });
                    functionResponses.push({
                        name,
                        response: { error: toolErr.message },
                    });
                }
            }
            // Second turn with tool results
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
                contents,
                config: {
                    systemInstruction,
                    temperature: 0.1,
                },
            });
            return {
                text: response2.text || 'Here is the requested information.',
                toolCalls,
            };
        };
        const result = await withTimeout(runTurn(), 8000);
        logger_1.logger.info({ toolCallsCount: result.toolCalls.length, hasProposedAction: Boolean(result.proposedAction) }, '[ai] Merchant chat processed');
        return result;
    }
    catch (err) {
        logger_1.logger.warn({ err: err.message }, '[ai] Merchant chat error or timeout');
        return {
            text: "Request timed out or encountered an issue. You can retry with a specific inquiry such as 'List invoices' or 'Check disputes'.",
            toolCalls: [],
        };
    }
}
async function executeMerchantAction(toolName, parameters) {
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
        return { success: true, result: parsed, summary };
    }
    catch (err) {
        logger_1.logger.warn({ err: err.message, toolName }, '[ai] Action execution failed');
        return { success: false, result: { error: err.message }, summary: `Execution failed: ${err.message}` };
    }
}
function formatToolResultSummary(toolName, data) {
    if (!data)
        return `Called ${toolName}`;
    if (data.error)
        return `${toolName}: ${data.error.message || 'Error occurred'}`;
    if (toolName === 'list_transactions') {
        const count = data.transaction_details?.length || 0;
        return `Retrieved ${count} transactions from PayPal`;
    }
    if (toolName === 'list_invoices') {
        const count = data.items?.length || data.total_items || 0;
        return `Found ${count} invoices in PayPal account`;
    }
    if (toolName === 'list_disputes') {
        const count = data.items?.length || 0;
        return `Retrieved ${count} dispute records`;
    }
    if (toolName === 'get_merchant_insights') {
        return 'Retrieved PayPal business analytics and metrics';
    }
    return `Successfully executed ${toolName}`;
}
//# sourceMappingURL=ai.service.js.map