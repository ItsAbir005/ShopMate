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
exports.assistantHandler = exports.merchantActionHandler = exports.merchantHandler = void 0;
const AIService = __importStar(require("./ai.service"));
const logger_1 = require("../../utils/logger");
/**
 * POST /api/ai/merchant
 * Merchant AI Copilot (Admin only).
 * Powered by PayPal Agent Toolkit.
 */
const merchantHandler = async (req, res) => {
    const requestId = `req_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 7)}`;
    try {
        const { message, history, actionConfirmed } = req.body;
        if (!actionConfirmed && (typeof message !== 'string' || !message.trim())) {
            return res.status(400).json({ requestId, message: 'User message cannot be empty' });
        }
        const adminId = req.user._id.toString();
        const response = await AIService.merchantChat(adminId, message || '', history, actionConfirmed, requestId);
        return res.json({ ...response, requestId: response.requestId || requestId });
    }
    catch (err) {
        const errorCode = AIService.extractErrorCode(err);
        const isBadRequest = errorCode === 400 ||
            err?.status === 400 ||
            err?.statusCode === 400 ||
            err instanceof AIService.AiValidationError ||
            (typeof err?.message === 'string' && (err.message.includes('400') || err.message.includes('INVALID_ARGUMENT')));
        if (isBadRequest) {
            return res.status(400).json({
                requestId,
                message: err.message || 'Invalid request',
                error: err.message || 'Invalid request',
            });
        }
        logger_1.logger.error({ requestId, err: err.message }, '[ai] Merchant copilot controller error');
        return res.status(500).json({
            requestId,
            text: 'An error occurred while contacting the AI Copilot. Please try again.',
            toolCalls: [],
        });
    }
};
exports.merchantHandler = merchantHandler;
/**
 * POST /api/ai/merchant/action
 * Confirms and executes a proposed write action (e.g. creating/sending invoice).
 */
const merchantActionHandler = async (req, res) => {
    const requestId = `req_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 7)}`;
    try {
        const { toolName, parameters } = req.body;
        if (!toolName) {
            return res.status(400).json({ requestId, message: 'toolName is required' });
        }
        logger_1.logger.info({ requestId, toolName }, '[ai] Admin confirmed action execution');
        const result = await AIService.executeMerchantAction(toolName, parameters || {}, requestId);
        return res.json({ ...result, requestId: result.requestId || requestId });
    }
    catch (err) {
        logger_1.logger.error({ requestId, err: err.message }, '[ai] Action confirmation execution error');
        return res.status(500).json({
            requestId,
            success: false,
            message: err.message || 'Action execution failed',
        });
    }
};
exports.merchantActionHandler = merchantActionHandler;
/**
 * POST /api/ai/assistant
 * Customer Shopping Assistant (SupportAgent widget).
 * Implements tools: searchProducts, addToCart, getMyOrderStatus.
 */
const assistantHandler = async (req, res) => {
    try {
        const { message, history } = req.body;
        if (typeof message !== 'string' || !message.trim()) {
            return res.status(400).json({ message: 'User message cannot be empty' });
        }
        const userId = req.user ? req.user._id.toString() : undefined;
        const response = await AIService.customerAssistantChat(userId, message, history);
        return res.json(response);
    }
    catch (err) {
        const errorCode = AIService.extractErrorCode(err);
        const isBadRequest = errorCode === 400 ||
            err?.status === 400 ||
            err?.statusCode === 400 ||
            err instanceof AIService.AiValidationError ||
            (typeof err?.message === 'string' && (err.message.includes('400') || err.message.includes('INVALID_ARGUMENT')));
        if (isBadRequest) {
            return res.status(400).json({
                message: err.message || 'Invalid request',
                error: err.message || 'Invalid request',
            });
        }
        logger_1.logger.error({ err: err.message }, '[ai] Customer assistant controller error');
        return res.status(500).json({
            text: 'I am temporarily experiencing connection difficulties. Please browse our products or check your cart directly.',
            toolCalls: [],
        });
    }
};
exports.assistantHandler = assistantHandler;
//# sourceMappingURL=ai.controller.js.map