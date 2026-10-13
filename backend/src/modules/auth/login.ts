import { Request, Response } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import { User } from "../../models/User";
import { logger } from "../../utils/logger";

dotenv.config();

const login = async (req: Request, res: Response): Promise<any> => {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) {
        logger.warn({ email }, "[auth] Login failed: user not found");
        return res.status(404).json({ message: "User not found" });
    }
    const isPasswordValid = await bcrypt.compare(password, user.password as string);
    if (!isPasswordValid) {
        logger.warn({ email }, "[auth] Login failed: invalid password");
        return res.status(401).json({ message: "Invalid password" });
    }
    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET as string);
    logger.info({ email: user.email, userId: user._id, role: user.role }, "[auth] Login successful");
    return res.status(200).json({ token });
};

export default login;
