"use client";

import { useEffect, useState, useRef } from "react";
import { fetchApi } from "../../lib/api";
import { useRouter } from "next/navigation";
import { Plus, Edit2, Trash2, Package, Upload, X, AlertCircle } from "lucide-react";

type Category = {
    _id: string;
    name: string;
};

type Variant = {
    size: string;
    color: string;
    stock: number;
};

type Product = {
    _id: string;
    title: string;
    description: string;
    price: number;
    stock: number;
    discount?: number;
    images?: string[];
    category_id?: { _id: string; name: string } | string;
    variants?: Variant[];
};

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

export default function AdminProductsPage() {
    const router = useRouter();

    const [products, setProducts] = useState<Product[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [loading, setLoading] = useState(true);
    const [pageError, setPageError] = useState<string | null>(null);
    const [formError, setFormError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);

    const [isEditing, setIsEditing] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);

    // Form states
    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [price, setPrice] = useState("");
    const [stock, setStock] = useState("");
    const [discount, setDiscount] = useState("0");
    const [categoryId, setCategoryId] = useState("");
    const [variants, setVariants] = useState<Variant[]>([]);
    const [existingImages, setExistingImages] = useState<string[]>([]);
    const [newFiles, setNewFiles] = useState<File[]>([]);
    const [newPreviews, setNewPreviews] = useState<string[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const loadData = async () => {
        try {
            setLoading(true);
            setPageError(null);
            const token = localStorage.getItem("adminToken");

            const [productsRes, categoriesRes] = await Promise.all([
                fetchApi("/products?limit=100&all=true", { token: token || undefined }),
                fetchApi("/categories", { token: token || undefined }),
            ]);

            if (productsRes && productsRes.products) {
                setProducts(productsRes.products);
            }
            if (Array.isArray(categoriesRes)) {
                setCategories(categoriesRes);
            }
        } catch (error: any) {
            console.error("Failed to load products/categories:", error);
            setPageError(error.message || "Failed to load products. Please check server logs or retry.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    const resetForm = () => {
        setIsEditing(false);
        setEditingId(null);
        setTitle("");
        setDescription("");
        setPrice("");
        setStock("");
        setDiscount("0");
        setCategoryId("");
        setVariants([]);
        setExistingImages([]);
        setNewFiles([]);
        setNewPreviews([]);
        setFormError(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
    };

    const handleEdit = (product: Product) => {
        setIsEditing(true);
        setEditingId(product._id);
        setTitle(product.title);
        setDescription(product.description);
        setPrice(String(product.price));
        setStock(String(product.stock));
        setDiscount(String(product.discount || 0));
        setCategoryId(
            typeof product.category_id === "object" && product.category_id?._id
                ? product.category_id._id
                : (product.category_id as string) || ""
        );
        setVariants(product.variants || []);
        setExistingImages(product.images || []);
        setNewFiles([]);
        setNewPreviews([]);
        setFormError(null);
        window.scrollTo({ top: 0, behavior: "smooth" });
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Are you sure you want to delete this product?")) return;
        try {
            const token = localStorage.getItem("adminToken");
            await fetchApi(`/products/${id}`, { method: "DELETE", token: token || undefined });
            loadData();
        } catch (error: any) {
            alert(`Failed to delete product: ${error.message}`);
        }
    };

    const handleFilesChange = (files: FileList | null) => {
        if (!files) return;
        const valid = Array.from(files).filter(f =>
            ["image/jpeg", "image/png", "image/webp"].includes(f.type) && f.size <= 5 * 1024 * 1024
        );
        const combined = [...newFiles, ...valid].slice(0, 5);
        setNewFiles(combined);
        setNewPreviews(combined.map(f => URL.createObjectURL(f)));
    };

    const removeNewFile = (idx: number) => {
        const filteredFiles = newFiles.filter((_, i) => i !== idx);
        const filteredPreviews = newPreviews.filter((_, i) => i !== idx);
        setNewFiles(filteredFiles);
        setNewPreviews(filteredPreviews);
    };

    const removeExistingImage = (idx: number) => {
        setExistingImages(prev => prev.filter((_, i) => i !== idx));
    };

    const addVariant = () => {
        setVariants(v => [...v, { size: "", color: "", stock: 1 }]);
    };

    const updateVariant = (idx: number, field: keyof Variant, value: any) => {
        setVariants(v => v.map((item, i) => i === idx ? { ...item, [field]: value } : item));
    };

    const removeVariant = (idx: number) => {
        setVariants(v => v.filter((_, i) => i !== idx));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setFormError(null);

        if (!title.trim() || !description.trim() || !price || !stock || !categoryId) {
            setFormError("Please fill in all required fields (Title, Description, Price, Stock, Category).");
            return;
        }

        setSubmitting(true);
        try {
            const token = localStorage.getItem("adminToken");
            const formData = new FormData();
            formData.append("title", title);
            formData.append("description", description);
            formData.append("price", price);
            formData.append("stock", stock);
            formData.append("discount", discount);
            formData.append("category_id", categoryId);

            if (variants.length > 0) {
                formData.append("variants", JSON.stringify(variants));
            }

            // Append existing images for update
            existingImages.forEach(img => formData.append("images", img));
            // Append newly uploaded files
            newFiles.forEach(file => formData.append("images", file));

            const url = isEditing ? `${API}/products/${editingId}` : `${API}/products`;
            const method = isEditing ? "PUT" : "POST";

            const res = await fetch(url, {
                method,
                headers: {
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: formData,
            });

            const data = await res.json();
            if (!res.ok) {
                const reqId = res.headers.get("x-request-id") || data.requestId;
                throw new Error(`${data.message || "Failed to save product"}${reqId ? ` (Req ID: ${reqId})` : ""}`);
            }

            resetForm();
            loadData();
        } catch (error: any) {
            console.error("Save product error:", error);
            setFormError(error.message || "An unexpected error occurred while saving product.");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 bg-white min-h-screen">
            <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-2">
                    <Package className="w-7 h-7 text-indigo-600" />
                    <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Manage Products</h1>
                </div>
            </div>

            {pageError && (
                <div className="mb-6 bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                    <div>
                        <p className="text-sm font-semibold text-red-900">Error loading products</p>
                        <p className="text-xs text-red-700 mt-0.5">{pageError}</p>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Form Section */}
                <div className="lg:col-span-1 bg-white border border-gray-200 rounded-xl p-6 h-fit shadow-xs">
                    <h2 className="text-lg font-bold text-gray-900 mb-4">
                        {isEditing ? "Edit Product" : "Add New Product"}
                    </h2>

                    {formError && (
                        <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700 font-medium">
                            {formError}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                                Title <span className="text-red-500">*</span>
                            </label>
                            <input
                                required
                                value={title}
                                onChange={e => setTitle(e.target.value)}
                                placeholder="Product title"
                                className="w-full px-3.5 py-2 rounded-lg border border-gray-200 text-gray-900 text-sm focus:outline-none focus:border-indigo-600"
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                                Category <span className="text-red-500">*</span>
                            </label>
                            <select
                                required
                                value={categoryId}
                                onChange={e => setCategoryId(e.target.value)}
                                className="w-full px-3.5 py-2 rounded-lg border border-gray-200 text-gray-900 text-sm focus:outline-none focus:border-indigo-600"
                            >
                                <option value="">Select category…</option>
                                {categories.map(c => (
                                    <option key={c._id} value={c._id}>{c.name}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                                Description <span className="text-red-500">*</span>
                            </label>
                            <textarea
                                required
                                value={description}
                                onChange={e => setDescription(e.target.value)}
                                rows={3}
                                placeholder="Detailed description"
                                className="w-full px-3.5 py-2 rounded-lg border border-gray-200 text-gray-900 text-sm focus:outline-none focus:border-indigo-600"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                                    Price ($) <span className="text-red-500">*</span>
                                </label>
                                <input
                                    required
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={price}
                                    onChange={e => setPrice(e.target.value)}
                                    placeholder="0.00"
                                    className="w-full px-3.5 py-2 rounded-lg border border-gray-200 text-gray-900 text-sm focus:outline-none focus:border-indigo-600"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                                    Stock <span className="text-red-500">*</span>
                                </label>
                                <input
                                    required
                                    type="number"
                                    min="0"
                                    value={stock}
                                    onChange={e => setStock(e.target.value)}
                                    placeholder="0"
                                    className="w-full px-3.5 py-2 rounded-lg border border-gray-200 text-gray-900 text-sm focus:outline-none focus:border-indigo-600"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                                Discount (%)
                            </label>
                            <input
                                type="number"
                                min="0"
                                max="100"
                                value={discount}
                                onChange={e => setDiscount(e.target.value)}
                                className="w-full px-3.5 py-2 rounded-lg border border-gray-200 text-gray-900 text-sm focus:outline-none focus:border-indigo-600"
                            />
                        </div>

                        {/* Image Upload */}
                        <div>
                            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                                Images <span className="text-xs text-gray-500 font-normal">(up to 5)</span>
                            </label>
                            <input
                                ref={fileInputRef}
                                type="file"
                                multiple
                                accept="image/jpeg,image/png,image/webp"
                                onChange={e => handleFilesChange(e.target.files)}
                                className="hidden"
                                id="product-images"
                            />
                            <label
                                htmlFor="product-images"
                                className="flex items-center justify-center gap-2 p-3 border border-dashed border-gray-300 hover:border-indigo-500 rounded-lg cursor-pointer text-xs font-semibold text-gray-600 hover:text-indigo-600 transition-colors"
                            >
                                <Upload className="w-4 h-4" />
                                <span>Upload Images</span>
                            </label>

                            {/* Image Previews */}
                            <div className="flex flex-wrap gap-2 mt-2">
                                {existingImages.map((src, i) => (
                                    <div key={`existing-${i}`} className="relative w-14 h-14 rounded-lg overflow-hidden border border-gray-200 group">
                                        <img src={src} alt="preview" className="w-full h-full object-cover" />
                                        <button
                                            type="button"
                                            onClick={() => removeExistingImage(i)}
                                            className="absolute top-0.5 right-0.5 w-4 h-4 bg-red-600 text-white rounded-full flex items-center justify-center opacity-80 hover:opacity-100"
                                        >
                                            <X className="w-3 h-3" />
                                        </button>
                                    </div>
                                ))}
                                {newPreviews.map((src, i) => (
                                    <div key={`new-${i}`} className="relative w-14 h-14 rounded-lg overflow-hidden border border-indigo-200 group">
                                        <img src={src} alt="new preview" className="w-full h-full object-cover" />
                                        <button
                                            type="button"
                                            onClick={() => removeNewFile(i)}
                                            className="absolute top-0.5 right-0.5 w-4 h-4 bg-red-600 text-white rounded-full flex items-center justify-center opacity-80 hover:opacity-100"
                                        >
                                            <X className="w-3 h-3" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Variants */}
                        <div className="pt-2 border-t border-gray-100">
                            <div className="flex items-center justify-between mb-2">
                                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider">
                                    Variants <span className="text-xs text-gray-500 font-normal">(optional)</span>
                                </label>
                                <button
                                    type="button"
                                    onClick={addVariant}
                                    className="flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800 cursor-pointer"
                                >
                                    <Plus className="w-3 h-3" /> Add
                                </button>
                            </div>

                            {variants.length > 0 && (
                                <div className="space-y-2">
                                    {variants.map((v, i) => (
                                        <div key={i} className="flex gap-2 items-center">
                                            <input
                                                value={v.size}
                                                onChange={e => updateVariant(i, "size", e.target.value)}
                                                placeholder="Size"
                                                className="w-1/3 px-2 py-1.5 border border-gray-200 rounded text-xs"
                                            />
                                            <input
                                                value={v.color}
                                                onChange={e => updateVariant(i, "color", e.target.value)}
                                                placeholder="Color"
                                                className="w-1/3 px-2 py-1.5 border border-gray-200 rounded text-xs"
                                            />
                                            <input
                                                type="number"
                                                min="0"
                                                value={v.stock}
                                                onChange={e => updateVariant(i, "stock", Number(e.target.value))}
                                                placeholder="Stock"
                                                className="w-1/4 px-2 py-1.5 border border-gray-200 rounded text-xs"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => removeVariant(i)}
                                                className="text-red-500 hover:text-red-700 p-1"
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="flex gap-2 pt-3">
                            <button
                                type="submit"
                                disabled={submitting}
                                className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                            >
                                {submitting ? "Saving…" : isEditing ? "Update Product" : "Create Product"}
                            </button>
                            {isEditing && (
                                <button
                                    type="button"
                                    onClick={resetForm}
                                    className="px-4 py-2.5 border border-gray-200 hover:bg-gray-50 text-gray-700 font-semibold text-sm rounded-lg transition-colors cursor-pointer"
                                >
                                    Cancel
                                </button>
                            )}
                        </div>
                    </form>
                </div>

                {/* List Section */}
                <div className="lg:col-span-2">
                    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-xs">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-gray-200 bg-gray-50/75">
                                    <th className="p-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Product</th>
                                    <th className="p-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Category</th>
                                    <th className="p-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Price</th>
                                    <th className="p-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Stock</th>
                                    <th className="p-4 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr>
                                        <td colSpan={5} className="p-12 text-center text-gray-400 text-sm">
                                            Loading products…
                                        </td>
                                    </tr>
                                ) : products.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} className="p-12 text-center text-gray-500 text-sm">
                                            No products found. Add one to get started!
                                        </td>
                                    </tr>
                                ) : (
                                    products.map(product => {
                                        const catName =
                                            typeof product.category_id === "object" && product.category_id?.name
                                                ? product.category_id.name
                                                : categories.find(c => c._id === product.category_id)?.name || "—";

                                        return (
                                            <tr key={product._id} className="border-b border-gray-100 last:border-none hover:bg-gray-50/50 transition-colors">
                                                <td className="p-4">
                                                    <div className="flex items-center gap-3">
                                                        {product.images && product.images[0] ? (
                                                            <img
                                                                src={product.images[0]}
                                                                alt={product.title}
                                                                className="w-10 h-10 object-cover rounded-md border border-gray-200 shrink-0"
                                                            />
                                                        ) : (
                                                            <div className="w-10 h-10 bg-gray-100 border border-gray-200 rounded-md flex items-center justify-center shrink-0">
                                                                <Package className="w-5 h-5 text-gray-400" />
                                                            </div>
                                                        )}
                                                        <div>
                                                            <div className="font-semibold text-gray-900 text-sm">{product.title}</div>
                                                            <div className="text-xs text-gray-500 truncate max-w-[200px]">{product.description}</div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="p-4 text-xs font-medium text-gray-600">
                                                    {catName}
                                                </td>
                                                <td className="p-4 text-sm font-semibold text-gray-900">
                                                    ${product.price.toFixed(2)}
                                                </td>
                                                <td className="p-4">
                                                    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                                                        product.stock > 0
                                                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                                            : "bg-red-50 text-red-700 border border-red-200"
                                                    }`}>
                                                        {product.stock > 0 ? `${product.stock} in stock` : "Out of stock"}
                                                    </span>
                                                </td>
                                                <td className="p-4 text-right space-x-3">
                                                    <button
                                                        onClick={() => handleEdit(product)}
                                                        className="text-xs font-medium text-indigo-600 hover:text-indigo-800 transition-colors cursor-pointer"
                                                    >
                                                        Edit
                                                    </button>
                                                    <button
                                                        onClick={() => handleDelete(product._id)}
                                                        className="text-xs font-medium text-red-600 hover:text-red-800 transition-colors cursor-pointer"
                                                    >
                                                        Delete
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}
