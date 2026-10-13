import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { User, IUser } from "../models/User";
import { logger } from "../utils/logger";

export interface AuthRequest extends Request {
    user?: IUser;
    headers: Request['headers'];
    body: any;
    params: any;
    query: any;
    file?: any;
    files?: any;
}

export const authMiddleware = async (req: AuthRequest, res: Response, next: NextFunction): Promise<any> => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ message: "No token provided, authorization denied" });
    }

    const token = authHeader.split(" ")[1];

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as { id: string };
        const user = await User.findById(decoded.id).select("-password");

        if (!user) {
            return res.status(401).json({ message: "User not found" });
        }

        if (user.isBlocked) {
            return res.status(403).json({ message: "Account is blocked" });
        }

        req.user = user;
        next();
    } catch (err: any) {
        logger.warn({ err: err.message }, "[auth] Token verification failed");
        return res.status(401).json({ message: "Token is not valid", error: err.message });
    }
};
