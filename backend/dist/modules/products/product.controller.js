"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getProductById = exports.getProducts = exports.deleteProduct = exports.updateProduct = exports.createProduct = void 0;
const Product_1 = require("../../models/Product");
const redis_1 = require("../../config/redis");
const logger_1 = require("../../utils/logger");
// === Safe Redis Helpers (resilient fallback to DB on Redis failure) ===
const safeRedisGet = async (key) => {
    try {
        if (redis_1.redisClient.isOpen) {
            return await redis_1.redisClient.get(key);
        }
    }
    catch (err) {
        logger_1.logger.warn({ err, key }, "[products] Redis GET error, falling back to database");
    }
    return null;
};
const safeRedisSetEx = async (key, seconds, value) => {
    try {
        if (redis_1.redisClient.isOpen) {
            await redis_1.redisClient.setEx(key, seconds, value);
        }
    }
    catch (err) {
        logger_1.logger.warn({ err, key }, "[products] Redis SETEX error");
    }
};
const safeRedisSAdd = async (setKey, member) => {
    try {
        if (redis_1.redisClient.isOpen) {
            await redis_1.redisClient.sAdd(setKey, member);
        }
    }
    catch (err) {
        logger_1.logger.warn({ err, setKey }, "[products] Redis SADD error");
    }
};
const safeRedisDel = async (key) => {
    try {
        if (redis_1.redisClient.isOpen) {
            await redis_1.redisClient.del(key);
        }
    }
    catch (err) {
        logger_1.logger.warn({ err, key }, "[products] Redis DEL error");
    }
};
// === Helper: Invalidate Product List Caches ===
const invalidateProductCaches = async () => {
    try {
        if (redis_1.redisClient.isOpen) {
            const keys = await redis_1.redisClient.sMembers("products:cache");
            if (keys && keys.length > 0) {
                await redis_1.redisClient.del(keys);
            }
            await redis_1.redisClient.del("products:cache");
        }
    }
    catch (err) {
        logger_1.logger.warn({ err }, "[products] Redis cache invalidation error");
    }
};
// === Admin Controllers ===
// @desc    Create a product (admin)
// @route   POST /api/products
// @access  Private/Admin
const createProduct = async (req, res) => {
    try {
        const { title, description, price, stock, category_id, discount } = req.body;
        if (!title || !description || price === undefined || stock === undefined || !category_id) {
            return res.status(400).json({
                message: "Title, description, price, stock, and category are required"
            });
        }
        // Handle uploaded images from multer/cloudinary or raw image URLs in body
        const imageFiles = req.files;
        let images = [];
        if (imageFiles && Array.isArray(imageFiles) && imageFiles.length > 0) {
            images = imageFiles.map((f) => f.path || f.secure_url || f.location);
        }
        else if (req.body.images) {
            images = Array.isArray(req.body.images) ? req.body.images : [req.body.images];
        }
        let parsedVariants = [];
        if (req.body.variants) {
            try {
                parsedVariants = typeof req.body.variants === "string"
                    ? JSON.parse(req.body.variants)
                    : req.body.variants;
            }
            catch {
                parsedVariants = [];
            }
        }
        const product = new Product_1.Product({
            title,
            description,
            price: Number(price),
            stock: Number(stock),
            category_id,
            images,
            variants: parsedVariants,
            discount: discount !== undefined ? Number(discount) : 0,
            status: "approved",
        });
        const createdProduct = await product.save();
        await invalidateProductCaches();
        logger_1.logger.info({ productId: createdProduct._id, title: createdProduct.title }, "[products] Product created successfully");
        return res.status(201).json(createdProduct);
    }
    catch (error) {
        logger_1.logger.error({ error: error.message, stack: error.stack }, "[products] Error creating product");
        return res.status(500).json({ message: error.message || "Server error creating product" });
    }
};
exports.createProduct = createProduct;
// @desc    Update a product (admin)
// @route   PUT /api/products/:id
// @access  Private/Admin
const updateProduct = async (req, res) => {
    try {
        const { title, description, price, stock, category_id, discount } = req.body;
        const product = await Product_1.Product.findById(req.params.id);
        if (!product) {
            return res.status(404).json({ message: "Product not found" });
        }
        if (title !== undefined)
            product.title = title;
        if (description !== undefined)
            product.description = description;
        if (price !== undefined)
            product.price = Number(price);
        if (stock !== undefined)
            product.stock = Number(stock);
        if (category_id !== undefined)
            product.category_id = category_id;
        if (discount !== undefined)
            product.discount = Number(discount);
        // Handle uploaded images from multer/cloudinary or images array in body
        const imageFiles = req.files;
        if (imageFiles && Array.isArray(imageFiles) && imageFiles.length > 0) {
            const newImages = imageFiles.map((f) => f.path || f.secure_url || f.location);
            // Append or replace if existing
            product.images = [...(product.images || []), ...newImages];
        }
        else if (req.body.images !== undefined) {
            product.images = Array.isArray(req.body.images) ? req.body.images : [req.body.images];
        }
        if (req.body.variants !== undefined) {
            try {
                product.variants = typeof req.body.variants === "string"
                    ? JSON.parse(req.body.variants)
                    : req.body.variants;
            }
            catch {
                product.variants = [];
            }
        }
        const updatedProduct = await product.save();
        await invalidateProductCaches();
        await safeRedisDel(`product:${req.params.id}`);
        logger_1.logger.info({ productId: updatedProduct._id }, "[products] Product updated successfully");
        return res.json(updatedProduct);
    }
    catch (error) {
        logger_1.logger.error({ error: error.message, stack: error.stack, id: req.params.id }, "[products] Error updating product");
        return res.status(500).json({ message: error.message || "Server error updating product" });
    }
};
exports.updateProduct = updateProduct;
// @desc    Delete a product (admin)
// @route   DELETE /api/products/:id
// @access  Private/Admin
const deleteProduct = async (req, res) => {
    try {
        const product = await Product_1.Product.findById(req.params.id);
        if (!product) {
            return res.status(404).json({ message: "Product not found" });
        }
        await product.deleteOne();
        await invalidateProductCaches();
        await safeRedisDel(`product:${req.params.id}`);
        logger_1.logger.info({ productId: req.params.id }, "[products] Product deleted successfully");
        return res.json({ message: "Product removed" });
    }
    catch (error) {
        logger_1.logger.error({ error: error.message, stack: error.stack, id: req.params.id }, "[products] Error deleting product");
        return res.status(500).json({ message: error.message || "Server error deleting product" });
    }
};
exports.deleteProduct = deleteProduct;
// === Public Controllers ===
// @desc    Fetch products (with pagination, filtering, search, sorting, resilient cache)
// @route   GET /api/products
// @access  Public
const getProducts = async (req, res) => {
    try {
        const pageSize = Math.max(1, Math.min(100, Number(req.query.limit) || 10));
        const page = Math.max(1, Number(req.query.page) || 1);
        const cacheKey = `products:cache:${Buffer.from(JSON.stringify(req.query)).toString("base64")}`;
        const cachedData = await safeRedisGet(cacheKey);
        if (cachedData) {
            logger_1.logger.info({ cacheKey }, "[products] Cache hit");
            return res.json(JSON.parse(cachedData));
        }
        const keyword = req.query.search
            ? { title: { $regex: req.query.search, $options: "i" } }
            : {};
        // Products visibility:
        // If all=true (for admin management), show all products.
        // Otherwise, show approved products as well as legacy products where status was not set or null.
        const filter = { ...keyword };
        if (req.query.all !== "true") {
            filter.$or = [
                { status: "approved" },
                { status: { $exists: false } },
                { status: null },
            ];
        }
        if (req.query.category) {
            filter.category_id = req.query.category;
        }
        let sortObj = {};
        if (req.query.sort) {
            const sortStr = req.query.sort;
            if (sortStr.startsWith("-")) {
                sortObj[sortStr.substring(1)] = -1;
            }
            else {
                sortObj[sortStr] = 1;
            }
        }
        else {
            sortObj = { createdAt: -1 };
        }
        const count = await Product_1.Product.countDocuments(filter);
        const products = await Product_1.Product.find(filter)
            .populate("category_id", "name slug")
            .sort(sortObj)
            .limit(pageSize)
            .skip(pageSize * (page - 1));
        const responseData = {
            products,
            page,
            pages: Math.ceil(count / pageSize) || 1,
            total: count,
        };
        await safeRedisSetEx(cacheKey, 3600, JSON.stringify(responseData));
        await safeRedisSAdd("products:cache", cacheKey);
        logger_1.logger.info({ count, page, pageSize, total: count }, "[products] Products fetched from database");
        return res.json(responseData);
    }
    catch (error) {
        logger_1.logger.error({ error: error.message, stack: error.stack, query: req.query }, "[products] Error fetching products");
        return res.status(500).json({ message: error.message || "Server error fetching products" });
    }
};
exports.getProducts = getProducts;
// @desc    Fetch single product
// @route   GET /api/products/:id
// @access  Public
const getProductById = async (req, res) => {
    try {
        const cacheKey = `product:${req.params.id}`;
        const cachedProduct = await safeRedisGet(cacheKey);
        if (cachedProduct) {
            logger_1.logger.info({ productId: req.params.id }, "[products] Single product cache hit");
            return res.json(JSON.parse(cachedProduct));
        }
        const product = await Product_1.Product.findById(req.params.id).populate("category_id", "name slug");
        if (product) {
            await safeRedisSetEx(cacheKey, 3600, JSON.stringify(product));
            logger_1.logger.info({ productId: req.params.id }, "[products] Single product fetched from database");
            return res.json(product);
        }
        else {
            return res.status(404).json({ message: "Product not found" });
        }
    }
    catch (error) {
        logger_1.logger.error({ error: error.message, stack: error.stack, id: req.params.id }, "[products] Error fetching product by ID");
        return res.status(500).json({ message: error.message || "Server error fetching product" });
    }
};
exports.getProductById = getProductById;
//# sourceMappingURL=product.controller.js.map