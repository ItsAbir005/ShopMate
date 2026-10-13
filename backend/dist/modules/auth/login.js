"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const bcrypt_1 = __importDefault(require("bcrypt"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const dotenv_1 = __importDefault(require("dotenv"));
const User_1 = require("../../models/User");
const logger_1 = require("../../utils/logger");
dotenv_1.default.config();
const login = async (req, res) => {
    const { email, password } = req.body;
    const user = await User_1.User.findOne({ email });
    if (!user) {
        logger_1.logger.warn({ email }, "[auth] Login failed: user not found");
        return res.status(404).json({ message: "User not found" });
    }
    const isPasswordValid = await bcrypt_1.default.compare(password, user.password);
    if (!isPasswordValid) {
        logger_1.logger.warn({ email }, "[auth] Login failed: invalid password");
        return res.status(401).json({ message: "Invalid password" });
    }
    const token = jsonwebtoken_1.default.sign({ id: user.id }, process.env.JWT_SECRET);
    logger_1.logger.info({ email: user.email, userId: user._id, role: user.role }, "[auth] Login successful");
    return res.status(200).json({ token });
};
exports.default = login;
//# sourceMappingURL=login.js.map