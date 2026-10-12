"use client";

import { useEffect, useState } from "react";
import { fetchApi } from "../../lib/api";
import { useRouter } from "next/navigation";
import { Plus, Edit2, Trash2, Package } from "lucide-react";

type Product = {
    _id: string;
    title: string;
    description: string;
    price: number;
    stock: number;
    discount?: number;
    images?: string[];
};

export default function AdminProductsPage() {
    const router = useRouter();

    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);

    const [isEditing, setIsEditing] = useState(false);
    const [formData, setFormData] = useState<Partial<Product>>({ title: "", description: "", price: 0, stock: 0, discount: 0 });

    const loadProducts = async () => {
        try {
            setLoading(true);
            const token = localStorage.getItem("adminToken");
            const data = await fetchApi("/products?limit=100", { token: token || undefined });
            if (data && data.products) setProducts(data.products);
        } catch (error) {
            console.error("Failed to fetch products:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadProducts();
    }, []);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: name === "price" || name === "stock" || name === "discount" ? Number(value) : value
        }));
    };

    const handleEdit = (product: Product) => {
        setIsEditing(true);
        setFormData(product);
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Are you sure you want to delete this product?")) return;
        try {
            const token = localStorage.getItem("adminToken");
            await fetchApi(`/products/${id}`, { method: "DELETE", token: token || undefined });
            loadProducts();
        } catch (error) {
            alert("Failed to delete product");
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            if (isEditing && formData._id) {
                const token = localStorage.getItem("adminToken");
                await fetchApi(`/products/${formData._id}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    token: token || undefined,
                    body: JSON.stringify(formData),
                });
            } else {
                const token = localStorage.getItem("adminToken");
                await fetchApi(`/products`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    token: token || undefined,
                    body: JSON.stringify(formData),
                });
            }
            setIsEditing(false);
            setFormData({ title: "", description: "", price: 0, stock: 0, discount: 0 });
            loadProducts();
        } catch (error) {
            alert("Failed to save product");
        }
    };

    if (loading) return <div className="max-w-7xl mx-auto px-4 py-16 text-center text-gray-500">Loading products...</div>;

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 bg-white min-h-screen">
            <div className="flex items-center gap-2 mb-8">
                <Package className="w-7 h-7 text-indigo-600" />
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Manage Products</h1>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Form Section */}
                <div className="lg:col-span-1 bg-white border border-gray-200 rounded-xl p-6 h-fit">
                    <h2 className="text-lg font-bold text-gray-900 mb-4">{isEditing ? "Edit Product" : "Add New Product"}</h2>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">Title</label>
                            <input required name="title" value={formData.title} onChange={handleChange} className="w-full px-3.5 py-2.5 rounded-lg border border-gray-200 text-gray-900 text-sm focus:outline-none focus:border-indigo-600" />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">Description</label>
                            <textarea required name="description" value={formData.description} onChange={handleChange} className="w-full px-3.5 py-2.5 rounded-lg border border-gray-200 text-gray-900 text-sm focus:outline-none focus:border-indigo-600" rows={3} />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">Price ($)</label>
                                <input required type="number" min="0" step="0.01" name="price" value={formData.price} onChange={handleChange} className="w-full px-3.5 py-2.5 rounded-lg border border-gray-200 text-gray-900 text-sm focus:outline-none focus:border-indigo-600" />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">Stock</label>
                                <input required type="number" min="0" name="stock" value={formData.stock} onChange={handleChange} className="w-full px-3.5 py-2.5 rounded-lg border border-gray-200 text-gray-900 text-sm focus:outline-none focus:border-indigo-600" />
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">Discount (%)</label>
                            <input type="number" min="0" max="100" name="discount" value={formData.discount} onChange={handleChange} className="w-full px-3.5 py-2.5 rounded-lg border border-gray-200 text-gray-900 text-sm focus:outline-none focus:border-indigo-600" />
                        </div>

                        <div className="flex gap-2 pt-2">
                            <button type="submit" className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm rounded-lg transition-colors">
                                {isEditing ? "Update" : "Create"}
                            </button>
                            {isEditing && (
                                <button type="button" onClick={() => { setIsEditing(false); setFormData({ title: "", description: "", price: 0, stock: 0, discount: 0 }); }} className="flex-1 py-2.5 border border-gray-200 hover:bg-gray-50 text-gray-700 font-semibold text-sm rounded-lg transition-colors">
                                    Cancel
                                </button>
                            )}
                        </div>
                    </form>
                </div>

                {/* List Section */}
                <div className="lg:col-span-2">
                    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-gray-200 bg-gray-50">
                                    <th className="p-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Product</th>
                                    <th className="p-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Price</th>
                                    <th className="p-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Stock</th>
                                    <th className="p-4 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {products.map((product) => (
                                    <tr key={product._id} className="border-b border-gray-100 last:border-none hover:bg-gray-50/50 transition-colors">
                                        <td className="p-4">
                                            <div className="font-semibold text-gray-900 text-sm">{product.title}</div>
                                            <div className="text-xs text-gray-500 truncate max-w-[240px]">{product.description}</div>
                                        </td>
                                        <td className="p-4 text-sm font-semibold text-gray-900">${product.price.toFixed(2)}</td>
                                        <td className="p-4">
                                            <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${product.stock > 0 ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
                                                {product.stock > 0 ? `${product.stock} in stock` : "Out of stock"}
                                            </span>
                                        </td>
                                        <td className="p-4 text-right space-x-3">
                                            <button onClick={() => handleEdit(product)} className="text-xs font-medium text-indigo-600 hover:text-indigo-800 transition-colors">Edit</button>
                                            <button onClick={() => handleDelete(product._id)} className="text-xs font-medium text-red-600 hover:text-red-800 transition-colors">Delete</button>
                                        </td>
                                    </tr>
                                ))}
                                {products.length === 0 && (
                                    <tr>
                                        <td colSpan={4} className="p-8 text-center text-gray-500 text-sm">No products found. Add one to get started!</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}
