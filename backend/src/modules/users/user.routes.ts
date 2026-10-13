import { Router } from "express";
import { authMiddleware } from "../../middleware/auth.middleware";
import { adminMiddleware } from "../../middleware/admin.middleware";
import {
    getProfile, updateProfile, uploadProfileImage, changePassword, deleteAccount,
    addAddress, updateAddress, deleteAddress, setDefaultShippingAddress,
    updateNotificationSettings, getUsers
} from "./user.controller";
import { upload } from "../../config/cloudinary";

const router = Router();

// Ensure all routes require authentication
router.use(authMiddleware);

// === 0. Admin User Management ===
router.get("/", adminMiddleware as any, getUsers);

// === 1. Profile Management ===
router.get("/profile", getProfile);
router.put("/profile", updateProfile);
router.post("/profile/image", upload.single("profileImage"), uploadProfileImage);
router.put("/profile/password", changePassword);
router.delete("/profile", deleteAccount);

// === 2. User Preferences ===
router.post("/addresses", addAddress);
router.put("/addresses/:id", updateAddress);
router.delete("/addresses/:id", deleteAddress);
router.put("/addresses/:id/default", setDefaultShippingAddress);
router.put("/notifications", updateNotificationSettings);

export default router;
