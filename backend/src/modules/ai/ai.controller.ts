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
    try {
        const { message, history, actionConfirmed } = req.body;
        if (!actionConfirmed && (typeof message !== 'string' || !message.trim())) {
            return res.status(400).json({ message: 'User message cannot be empty' });
        }

        const adminId = (req.user as any)._id.toString();
        const response = await AIService.merchantChat(adminId, message || '', history, actionConfirmed);
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

        logger.error({ err: err.message }, '[ai] Merchant copilot controller error');
        return res.status(500).json({
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
    try {
        const { toolName, parameters } = req.body;
        if (!toolName) {
            return res.status(400).json({ message: 'toolName is required' });
        }

        logger.info({ toolName }, '[ai] Admin confirmed action execution');
        const result = await AIService.executeMerchantAction(toolName, parameters || {});
        return res.json(result);
    } catch (err: any) {
        logger.error({ err: err.message }, '[ai] Action confirmation execution error');
        return res.status(500).json({
            success: false,
            message: err.message || 'Action execution failed',
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
