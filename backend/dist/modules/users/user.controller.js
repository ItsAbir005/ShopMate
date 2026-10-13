"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUsers = exports.updateNotificationSettings = exports.setDefaultShippingAddress = exports.deleteAddress = exports.updateAddress = exports.addAddress = exports.deleteAccount = exports.changePassword = exports.uploadProfileImage = exports.updateProfile = exports.getProfile = void 0;
const User_1 = require("../../models/User");
const bcrypt_1 = __importDefault(require("bcrypt"));
// === 1. Profile Management ===
const getProfile = async (req, res) => {
    try {
        const user = req.user;
        if (!user)
            return res.status(404).json({ message: "User not found" });
        res.status(200).json(user);
    }
    catch (error) {
        res.status(500).json({ message: "Server Error", error });
    }
};
exports.getProfile = getProfile;
const updateProfile = async (req, res) => {
    try {
        const { name, email } = req.body;
        const userId = req.user?._id;
        const updatedUser = await User_1.User.findByIdAndUpdate(userId, { name, email }, { new: true, runValidators: true }).select("-password");
        if (!updatedUser)
            return res.status(404).json({ message: "User not found" });
        res.status(200).json({ message: "Profile updated successfully", user: updatedUser });
    }
    catch (error) {
        res.status(500).json({ message: "Server Error", error });
    }
};
exports.updateProfile = updateProfile;
const uploadProfileImage = async (req, res) => {
    try {
        const userId = req.user?._id;
        const profileImage = req.file?.path;
        if (!profileImage)
            return res.status(400).json({ message: "No image provided" });
        const updatedUser = await User_1.User.findByIdAndUpdate(userId, { profileImage }, { new: true }).select("-password");
        res.status(200).json({ message: "Profile image uploaded successfully", user: updatedUser });
    }
    catch (error) {
        res.status(500).json({ message: "Server Error", error });
    }
};
exports.uploadProfileImage = uploadProfileImage;
const changePassword = async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const userId = req.user?._id;
        const user = await User_1.User.findById(userId);
        if (!user || !user.password)
            return res.status(404).json({ message: "User not found" });
        const isMatch = await bcrypt_1.default.compare(currentPassword, user.password);
        if (!isMatch)
            return res.status(400).json({ message: "Invalid current password" });
        const salt = await bcrypt_1.default.genSalt(10);
        user.password = await bcrypt_1.default.hash(newPassword, salt);
        await user.save();
        res.status(200).json({ message: "Password changed successfully" });
    }
    catch (error) {
        res.status(500).json({ message: "Server Error", error });
    }
};
exports.changePassword = changePassword;
const deleteAccount = async (req, res) => {
    try {
        const userId = req.user?._id;
        await User_1.User.findByIdAndDelete(userId);
        res.status(200).json({ message: "Account deleted successfully" });
    }
    catch (error) {
        res.status(500).json({ message: "Server Error", error });
    }
};
exports.deleteAccount = deleteAccount;
// === 3. User Preferences ===
const addAddress = async (req, res) => {
    try {
        const userId = req.user?._id;
        const { street, city, state, zipCode, country, isDefault } = req.body;
        const user = await User_1.User.findById(userId);
        if (!user)
            return res.status(404).json({ message: "User not found" });
        if (isDefault) {
            user.addresses.forEach(addr => addr.isDefault = false);
        }
        user.addresses.push({ street, city, state, zipCode, country, isDefault });
        await user.save();
        res.status(201).json({ message: "Address added successfully", addresses: user.addresses });
    }
    catch (error) {
        res.status(500).json({ message: "Server Error", error });
    }
};
exports.addAddress = addAddress;
const updateAddress = async (req, res) => {
    try {
        const userId = req.user?._id;
        const addressId = req.params.id;
        const { street, city, state, zipCode, country, isDefault } = req.body;
        const user = await User_1.User.findById(userId);
        if (!user)
            return res.status(404).json({ message: "User not found" });
        // Using standard JS array find since TS interface didn't declare Types.DocumentArray
        const address = user.addresses.find((a) => String(a._id) === addressId);
        if (!address)
            return res.status(404).json({ message: "Address not found" });
        if (isDefault) {
            user.addresses.forEach(addr => addr.isDefault = false);
        }
        Object.assign(address, { street, city, state, zipCode, country, isDefault });
        await user.save();
        res.status(200).json({ message: "Address updated successfully", addresses: user.addresses });
    }
    catch (error) {
        res.status(500).json({ message: "Server Error", error });
    }
};
exports.updateAddress = updateAddress;
const deleteAddress = async (req, res) => {
    try {
        const userId = req.user?._id;
        const addressId = req.params.id;
        const user = await User_1.User.findById(userId);
        if (!user)
            return res.status(404).json({ message: "User not found" });
        const addressIndex = user.addresses.findIndex((a) => String(a._id) === addressId);
        if (addressIndex === -1)
            return res.status(404).json({ message: "Address not found" });
        user.addresses.splice(addressIndex, 1);
        await user.save();
        res.status(200).json({ message: "Address deleted successfully", addresses: user.addresses });
    }
    catch (error) {
        res.status(500).json({ message: "Server Error", error });
    }
};
exports.deleteAddress = deleteAddress;
const setDefaultShippingAddress = async (req, res) => {
    try {
        const userId = req.user?._id;
        const addressId = req.params.id;
        const user = await User_1.User.findById(userId);
        if (!user)
            return res.status(404).json({ message: "User not found" });
        const address = user.addresses.find((a) => String(a._id) === addressId);
        if (!address)
            return res.status(404).json({ message: "Address not found" });
        user.addresses.forEach(addr => addr.isDefault = false);
        address.isDefault = true;
        await user.save();
        res.status(200).json({ message: "Default address updated", addresses: user.addresses });
    }
    catch (error) {
        res.status(500).json({ message: "Server Error", error });
    }
};
exports.setDefaultShippingAddress = setDefaultShippingAddress;
const updateNotificationSettings = async (req, res) => {
    try {
        const userId = req.user?._id;
        const { email, sms, push } = req.body;
        const user = await User_1.User.findByIdAndUpdate(userId, { notificationSettings: { email, sms, push } }, { new: true, runValidators: true }).select("-password");
        if (!user)
            return res.status(404).json({ message: "User not found" });
        res.status(200).json({ message: "Notification settings updated", notificationSettings: user.notificationSettings });
    }
    catch (error) {
        res.status(500).json({ message: "Server Error", error });
    }
};
exports.updateNotificationSettings = updateNotificationSettings;
// === 3. Admin User Management ===
const getUsers = async (req, res) => {
    try {
        const page = Math.max(1, Number(req.query.page) || 1);
        const limit = Math.max(1, Math.min(1000, Number(req.query.limit) || 50));
        const skip = (page - 1) * limit;
        const total = await User_1.User.countDocuments();
        const users = await User_1.User.find()
            .select("-password")
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);
        return res.status(200).json({
            users,
            total,
            page,
            pages: Math.ceil(total / limit) || 1,
        });
    }
    catch (error) {
        return res.status(500).json({ message: error.message || "Server Error fetching users" });
    }
};
exports.getUsers = getUsers;
//# sourceMappingURL=user.controller.js.map