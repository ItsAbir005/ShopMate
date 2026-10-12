"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../context/AuthContext";
import { Tag, UploadCloud, X, CheckCircle, Plus, Trash2, Image as ImageIcon } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

type Category = { _id: string; name: string };
type Variant = { size: string; color: string; stock: string };

export default function SellPage() {
    const { user } = useAuth();
    const router = useRouter();
    const [mounted, setMounted] = useState(false);

    // Form state
    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [price, setPrice] = useState("");
    const [stock, setStock] = useState("");
    const [categoryId, setCategoryId] = useState("");
    const [discount, setDiscount] = useState("0");
    const [categories, setCategories] = useState<Category[]>([]);
    const [variants, setVariants] = useState<Variant[]>([]);
    const [images, setImages] = useState<File[]>([]);
    const [previews, setPreviews] = useState<string[]>([]);
    const [dragging, setDragging] = useState(false);

    // Submit state
    const [submitting, setSubmitting] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => { setMounted(true); }, []);

    useEffect(() => {
        fetch(`${API_URL}/categories`)
            .then(r => r.json())
            .then(data => setCategories(Array.isArray(data) ? data : []))
            .catch(() => { });
    }, []);

    useEffect(() => {
        if (mounted && !user) {
            router.push("/login?redirect=/sell");
        }
    }, [mounted, user, router]);

    const handleFiles = (files: FileList | null) => {
        if (!files) return;
        const valid = Array.from(files).filter(f =>
            ["image/jpeg", "image/png", "image/webp"].includes(f.type) && f.size <= 5 * 1024 * 1024
        );
        const newImages = [...images, ...valid].slice(0, 5);
        setImages(newImages);
        setPreviews(newImages.map(f => URL.createObjectURL(f)));
    };

    const removeImage = (idx: number) => {
        const newImages = images.filter((_, i) => i !== idx);
        const newPreviews = previews.filter((_, i) => i !== idx);
        setImages(newImages);
        setPreviews(newPreviews);
    };

    const addVariant = () => {
        setVariants(v => [...v, { size: "", color: "", stock: "1" }]);
    };

    const updateVariant = (idx: number, field: keyof Variant, value: string) => {
        setVariants(v => v.map((vi, i) => i === idx ? { ...vi, [field]: value } : vi));
    };

    const removeVariant = (idx: number) => {
        setVariants(v => v.filter((_, i) => i !== idx));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (!title || !description || !price || !stock || !categoryId) {
            setError("Please fill in all required fields.");
            return;
        }

        setSubmitting(true);
        try {
            const token = localStorage.getItem("token");
            const formData = new FormData();
            formData.append("title", title);
            formData.append("description", description);
            formData.append("price", price);
            formData.append("stock", stock);
            formData.append("category_id", categoryId);
            formData.append("discount", discount);
            if (variants.length > 0) {
                formData.append("variants", JSON.stringify(variants.map(v => ({
                    ...v, stock: Number(v.stock)
                }))));
            }
            images.forEach(img => formData.append("images", img));

            const res = await fetch(`${API_URL}/products/sell`, {
                method: "POST",
                headers: { Authorization: `Bearer ${token}` },
                body: formData,
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.message || "Failed to submit listing");

            setSuccess(true);
        } catch (err: any) {
            setError(err.message || "Something went wrong");
        } finally {
            setSubmitting(false);
        }
    };

    if (!mounted) return null;

    if (success) {
        return (
            <div className="min-h-[80vh] flex items-center justify-center p-6 bg-white">
                <div className="bg-white border border-gray-200 rounded-2xl p-10 text-center max-w-md w-full shadow-sm">
                    <CheckCircle className="w-14 h-14 text-emerald-600 mx-auto mb-4" />
                    <h2 className="text-2xl font-bold text-gray-900 mb-2">
                        Listing Submitted!
                    </h2>
                    <p className="text-sm text-gray-600 mb-2 leading-relaxed">
                        Your item is now <strong className="text-amber-600">under review</strong>.
                        Our team will approve it within 24 hours.
                    </p>
                    <p className="text-xs text-gray-500 mb-8">
                        You'll see it under your listings once approved.
                    </p>
                    <div className="flex gap-3 justify-center">
                        <button
                            onClick={() => { setSuccess(false); setTitle(""); setDescription(""); setPrice(""); setStock(""); setCategoryId(""); setImages([]); setPreviews([]); setVariants([]); setDiscount("0"); }}
                            className="px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm transition-colors"
                        >
                            List Another Item
                        </button>
                        <button
                            onClick={() => router.push("/sell/my-listings")}
                            className="px-5 py-2.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-700 font-semibold text-sm transition-colors"
                        >
                            My Listings →
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-[80vh] py-12 px-4 sm:px-6 lg:px-8 max-w-4xl mx-auto bg-white">
            {/* Header */}
            <div className="mb-8">
                <div className="flex items-center gap-2">
                    <Tag className="w-7 h-7 text-indigo-600" />
                    <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
                        Sell Your Item
                    </h1>
                </div>
                <p className="text-sm text-gray-600 mt-1">
                    Submit a listing — our team reviews it within 24 hours before it goes live.
                </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
                {/* Images */}
                <div className="bg-white border border-gray-200 rounded-xl p-6">
                    <h2 className="text-base font-bold text-gray-900 mb-1">
                        Product Images <span className="text-xs text-gray-500 font-normal">(Up to 5, max 5 MB each)</span>
                    </h2>

                    <div
                        onDragOver={e => { e.preventDefault(); setDragging(true); }}
                        onDragLeave={() => setDragging(false)}
                        onDrop={e => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files); }}
                        onClick={() => fileInputRef.current?.click()}
                        className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors my-4 ${
                            dragging ? "border-indigo-600 bg-indigo-50/50" : "border-gray-200 hover:border-gray-300 bg-gray-50/50"
                        }`}
                    >
                        <UploadCloud className="w-10 h-10 text-gray-400 mx-auto mb-2" />
                        <p className="text-sm text-gray-700">
                            Drag & drop images here, or <span className="text-indigo-600 font-semibold">browse files</span>
                        </p>
                        <p className="text-xs text-gray-400 mt-1">JPG, PNG, WEBP — max 5 MB per file</p>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            multiple
                            onChange={e => handleFiles(e.target.files)}
                            className="hidden"
                        />
                    </div>

                    {previews.length > 0 && (
                        <div className="flex gap-3 flex-wrap">
                            {previews.map((src, i) => (
                                <div key={i} className="relative w-20 h-20 rounded-lg overflow-hidden border border-gray-200">
                                    <img src={src} alt="" className="w-full h-full object-cover" />
                                    {i === 0 && (
                                        <span className="absolute bottom-1 left-1 bg-indigo-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded">
                                            COVER
                                        </span>
                                    )}
                                    <button
                                        type="button"
                                        onClick={() => removeImage(i)}
                                        className="absolute top-1 right-1 w-5 h-5 rounded-full bg-red-600 text-white flex items-center justify-center text-xs"
                                    >
                                        <X className="w-3 h-3" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Details */}
                <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
                    <h2 className="text-base font-bold text-gray-900">Product Details</h2>

                    <div>
                        <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                            Title <span className="text-red-500">*</span>
                        </label>
                        <input
                            value={title}
                            onChange={e => setTitle(e.target.value)}
                            placeholder="e.g. Leather Jacket"
                            className="w-full p-2.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:border-indigo-600"
                            maxLength={100}
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                            Description <span className="text-red-500">*</span>
                        </label>
                        <textarea
                            value={description}
                            onChange={e => setDescription(e.target.value)}
                            placeholder="Describe your item — condition, size, materials..."
                            rows={4}
                            className="w-full p-2.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:border-indigo-600"
                        />
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        <div>
                            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                                Price ($) <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="number" min="0" step="0.01"
                                value={price}
                                onChange={e => setPrice(e.target.value)}
                                placeholder="0.00"
                                className="w-full p-2.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:border-indigo-600"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                                Stock <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="number" min="1"
                                value={stock}
                                onChange={e => setStock(e.target.value)}
                                placeholder="1"
                                className="w-full p-2.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:border-indigo-600"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                                Discount (%)
                            </label>
                            <input
                                type="number" min="0" max="100"
                                value={discount}
                                onChange={e => setDiscount(e.target.value)}
                                placeholder="0"
                                className="w-full p-2.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:border-indigo-600"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                                Category <span className="text-red-500">*</span>
                            </label>
                            <select
                                value={categoryId}
                                onChange={e => setCategoryId(e.target.value)}
                                className="w-full p-2.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:border-indigo-600"
                            >
                                <option value="">Select…</option>
                                {categories.map(c => (
                                    <option key={c._id} value={c._id}>{c.name}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                </div>

                {/* Variants */}
                <div className="bg-white border border-gray-200 rounded-xl p-6">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-base font-bold text-gray-900">
                            Variants <span className="text-xs text-gray-500 font-normal">(optional)</span>
                        </h2>
                        <button
                            type="button"
                            onClick={addVariant}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-600 border border-indigo-100 text-xs font-semibold hover:bg-indigo-100 transition-colors"
                        >
                            <Plus className="w-3.5 h-3.5" />
                            Add Variant
                        </button>
                    </div>

                    {variants.length === 0 ? (
                        <p className="text-xs text-gray-500">No variants added. Add size/color options if applicable.</p>
                    ) : (
                        <div className="space-y-3">
                            {variants.map((v, i) => (
                                <div key={i} className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-center">
                                    <input
                                        value={v.size}
                                        onChange={e => updateVariant(i, "size", e.target.value)}
                                        placeholder="Size (e.g. M)"
                                        className="p-2 bg-white border border-gray-200 rounded-lg text-xs text-gray-900 focus:outline-none focus:border-indigo-600"
                                    />
                                    <input
                                        value={v.color}
                                        onChange={e => updateVariant(i, "color", e.target.value)}
                                        placeholder="Color (e.g. Red)"
                                        className="p-2 bg-white border border-gray-200 rounded-lg text-xs text-gray-900 focus:outline-none focus:border-indigo-600"
                                    />
                                    <input
                                        type="number" min="0"
                                        value={v.stock}
                                        onChange={e => updateVariant(i, "stock", e.target.value)}
                                        placeholder="Stock"
                                        className="p-2 bg-white border border-gray-200 rounded-lg text-xs text-gray-900 focus:outline-none focus:border-indigo-600"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => removeVariant(i)}
                                        className="w-8 h-8 rounded-lg bg-red-50 text-red-600 border border-red-200 flex items-center justify-center hover:bg-red-100"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {error && (
                    <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-xs font-medium text-red-700">
                        {error}
                    </div>
                )}

                <div className="flex gap-3 justify-end">
                    <button
                        type="button"
                        onClick={() => router.push("/sell/my-listings")}
                        className="px-5 py-2.5 rounded-lg border border-gray-200 text-gray-700 text-sm font-semibold hover:bg-gray-50 transition-colors"
                    >
                        My Listings
                    </button>
                    <button
                        type="submit"
                        disabled={submitting}
                        className="px-6 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition-colors disabled:opacity-50"
                    >
                        {submitting ? "Submitting…" : "Submit Listing"}
                    </button>
                </div>
            </form>
        </div>
    );
}
