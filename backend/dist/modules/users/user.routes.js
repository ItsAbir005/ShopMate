"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_middleware_1 = require("../../middleware/auth.middleware");
const admin_middleware_1 = require("../../middleware/admin.middleware");
const user_controller_1 = require("./user.controller");
const cloudinary_1 = require("../../config/cloudinary");
const router = (0, express_1.Router)();
// Ensure all routes require authentication
router.use(auth_middleware_1.authMiddleware);
// === 0. Admin User Management ===
router.get("/", admin_middleware_1.adminMiddleware, user_controller_1.getUsers);
// === 1. Profile Management ===
router.get("/profile", user_controller_1.getProfile);
router.put("/profile", user_controller_1.updateProfile);
router.post("/profile/image", cloudinary_1.upload.single("profileImage"), user_controller_1.uploadProfileImage);
router.put("/profile/password", user_controller_1.changePassword);
router.delete("/profile", user_controller_1.deleteAccount);
// === 2. User Preferences ===
router.post("/addresses", user_controller_1.addAddress);
router.put("/addresses/:id", user_controller_1.updateAddress);
router.delete("/addresses/:id", user_controller_1.deleteAddress);
router.put("/addresses/:id/default", user_controller_1.setDefaultShippingAddress);
router.put("/notifications", user_controller_1.updateNotificationSettings);
exports.default = router;
//# sourceMappingURL=user.routes.js.map