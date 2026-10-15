import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth.middleware';
import * as AIService from './ai.service';
import { logger } from '../../utils/logger';

/**
 * POST /api/ai/merchant
 * Merchant AI Copilot (Admin only).
 * Powered by PayPal Agent Toolkit.
 */
export const merchantHandler = async (req: AuthRequest, res: Response): Promise<any> => {
    const requestId = `req_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 7)}`;
    try {
        const { message, history, actionConfirmed } = req.body;
        if (!actionConfirmed && (typeof message !== 'string' || !message.trim())) {
            return res.status(400).json({ requestId, message: 'User message cannot be empty' });
        }

        const adminId = (req.user as any)._id.toString();
        const response = await AIService.merchantChat(adminId, message || '', history, actionConfirmed, requestId);
        return res.json({ ...response, requestId: response.requestId || requestId });
    } catch (err: any) {
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

        const isTimeout = err?.message?.toLowerCase().includes('timed out') || err?.name === 'TimeoutError';
        if (isTimeout) {
            return res.status(504).json({
                requestId,
                text: 'The AI took too long, please try again.',
                toolCalls: [],
            });
        }

        logger.error({ requestId, err: err.message }, '[ai] Merchant copilot controller error');
        return res.status(500).json({
            requestId,
            text: 'An error occurred while contacting the AI Copilot. Please try again.',
            toolCalls: [],
        });
    }
};

/**
 * POST /api/ai/merchant/action
 * Confirms and executes a proposed write action (e.g. creating/sending invoice).
 */
export const merchantActionHandler = async (req: AuthRequest, res: Response): Promise<any> => {
    const requestId = `req_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 7)}`;
    try {
        const { toolName, parameters } = req.body;
        if (!toolName) {
            return res.status(400).json({ requestId, message: 'toolName is required' });
        }

        logger.info({ requestId, toolName }, '[ai] Admin confirmed action execution');
        const result = await AIService.executeMerchantAction(toolName, parameters || {}, requestId);
        return res.json({ ...result, requestId: result.requestId || requestId });
    } catch (err: any) {
        logger.error({ requestId, err: err.message }, '[ai] Action confirmation execution error');
        return res.status(500).json({
            requestId,
            success: false,
            message: err.message || 'Action execution failed',
        });
    }
};

/**
 * POST /api/ai/merchant/quick-chip
 * Direct read-only execution for quick action chips (Recent Transactions, Merchant Insights, Open Disputes, Invoices)
 * No model call for insights; direct read-only PayPal calls with default 7-day parameters.
 */
export const merchantQuickChipHandler = async (req: AuthRequest, res: Response): Promise<any> => {
    const requestId = `chip_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 7)}`;
    try {
        const { chipType } = req.body;
        if (!chipType || !['transactions', 'insights', 'disputes', 'invoices'].includes(chipType)) {
            return res.status(400).json({
                requestId,
                message: 'Valid chipType is required: transactions, insights, disputes, invoices',
            });
        }

        const result = await AIService.executeQuickChipAction(chipType, requestId);
        return res.json(result);
    } catch (err: any) {
        logger.error({ requestId, err: err.message }, '[ai] Quick chip controller error');
        return res.status(500).json({
            requestId,
            ok: false,
            text: `Failed to load ${req.body?.chipType || 'data'}: ${err.message}`,
            toolCalls: [],
            canSummarize: false,
        });
    }
};

/**
 * POST /api/ai/assistant
 * Customer Shopping Assistant (SupportAgent widget).
 * Implements tools: searchProducts, addToCart, getMyOrderStatus.
 */
export const assistantHandler = async (req: AuthRequest, res: Response): Promise<any> => {
    try {
        const { message, history } = req.body;
        if (typeof message !== 'string' || !message.trim()) {
            return res.status(400).json({ message: 'User message cannot be empty' });
        }

        const userId = req.user ? (req.user as any)._id.toString() : undefined;
        const response = await AIService.customerAssistantChat(userId, message, history);
        return res.json(response);
    } catch (err: any) {
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

        logger.error({ err: err.message }, '[ai] Customer assistant controller error');
        return res.status(500).json({
            text: 'I am temporarily experiencing connection difficulties. Please browse our products or check your cart directly.',
            toolCalls: [],
        });
    }
};
