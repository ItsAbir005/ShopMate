"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const product_controller_1 = require("./product.controller");
const auth_middleware_1 = require("../../middleware/auth.middleware");
const admin_middleware_1 = require("../../middleware/admin.middleware");
const cloudinary_1 = require("../../config/cloudinary");
const router = (0, express_1.Router)();
// ── Public routes ────────────────────────────────────────────────────────────
router.get("/", product_controller_1.getProducts);
router.get("/:id", product_controller_1.getProductById);
// ── Admin product CRUD routes ─────────────────────────────────────────────────
router.post("/", auth_middleware_1.authMiddleware, admin_middleware_1.adminMiddleware, cloudinary_1.uploadProductImages.array("images", 5), product_controller_1.createProduct);
router.put("/:id", auth_middleware_1.authMiddleware, admin_middleware_1.adminMiddleware, cloudinary_1.uploadProductImages.array("images", 5), product_controller_1.updateProduct);
router.delete("/:id", auth_middleware_1.authMiddleware, admin_middleware_1.adminMiddleware, product_controller_1.deleteProduct);
exports.default = router;
//# sourceMappingURL=product.routes.js.map