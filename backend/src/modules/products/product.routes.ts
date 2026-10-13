import { Router } from "express";
import {
    createProduct,
    updateProduct,
    deleteProduct,
    getProducts,
    getProductById,
} from "./product.controller";
import { authMiddleware } from "../../middleware/auth.middleware";
import { adminMiddleware } from "../../middleware/admin.middleware";
import { uploadProductImages } from "../../config/cloudinary";

const router = Router();

// ── Public routes ────────────────────────────────────────────────────────────
router.get("/", getProducts);
router.get("/:id", getProductById);

// ── Admin product CRUD routes ─────────────────────────────────────────────────
router.post(
    "/",
    authMiddleware as any,
    adminMiddleware as any,
    uploadProductImages.array("images", 5),
    createProduct
);
router.put(
    "/:id",
    authMiddleware as any,
    adminMiddleware as any,
    uploadProductImages.array("images", 5),
    updateProduct
);
router.delete(
    "/:id",
    authMiddleware as any,
    adminMiddleware as any,
    deleteProduct
);

export default router;
