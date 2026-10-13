"use client";

import { useEffect, useState } from "react";
import { fetchApi } from "../../lib/api";
import { FolderTree, Edit2, Trash2, Plus, AlertCircle } from "lucide-react";

type Category = {
    _id: string;
    name: string;
    slug: string;
    description?: string;
    parent_id?: string;
};

export default function AdminCategoriesPage() {
    const [categories, setCategories] = useState<Category[]>([]);
    const [loading, setLoading] = useState(true);
    const [pageError, setPageError] = useState<string | null>(null);
    const [formError, setFormError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);

    const [isEditing, setIsEditing] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);

    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [parentId, setParentId] = useState("");

    const loadCategories = async () => {
        try {
            setLoading(true);
            setPageError(null);
            const token = localStorage.getItem("adminToken");
            const data = await fetchApi("/categories", { token: token || undefined });
            if (Array.isArray(data)) {
                setCategories(data);
            }
        } catch (err: any) {
            console.error("Failed to load categories:", err);
            setPageError(err.message || "Failed to load categories.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadCategories();
    }, []);

    const resetForm = () => {
        setIsEditing(false);
        setEditingId(null);
        setName("");
        setDescription("");
        setParentId("");
        setFormError(null);
    };

    const handleEdit = (category: Category) => {
        setIsEditing(true);
        setEditingId(category._id);
        setName(category.name);
        setDescription(category.description || "");
        setParentId(category.parent_id || "");
        setFormError(null);
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Are you sure you want to delete this category?")) return;
        try {
            const token = localStorage.getItem("adminToken");
            await fetchApi(`/categories/${id}`, {
                method: "DELETE",
                token: token || undefined,
            });
            loadCategories();
        } catch (err: any) {
            alert(`Failed to delete category: ${err.message}`);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setFormError(null);

        if (!name.trim()) {
            setFormError("Category name is required.");
            return;
        }

        setSubmitting(true);
        try {
            const token = localStorage.getItem("adminToken");
            const payload: any = {
                name: name.trim(),
                description: description.trim(),
            };
            if (parentId) {
                payload.parent_id = parentId;
            }

            if (isEditing && editingId) {
                await fetchApi(`/categories/${editingId}`, {
                    method: "PUT",
                    token: token || undefined,
                    body: JSON.stringify(payload),
                });
            } else {
                await fetchApi("/categories", {
                    method: "POST",
                    token: token || undefined,
                    body: JSON.stringify(payload),
                });
            }

            resetForm();
            loadCategories();
        } catch (err: any) {
            console.error("Save category error:", err);
            setFormError(err.message || "Failed to save category.");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 bg-white min-h-screen">
            <div className="flex items-center gap-2 mb-8">
                <FolderTree className="w-7 h-7 text-indigo-600" />
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Manage Categories</h1>
            </div>

            {pageError && (
                <div className="mb-6 bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                    <div>
                        <p className="text-sm font-semibold text-red-900">Error loading categories</p>
                        <p className="text-xs text-red-700 mt-0.5">{pageError}</p>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Form Section */}
                <div className="lg:col-span-1 bg-white border border-gray-200 rounded-xl p-6 h-fit shadow-xs">
                    <h2 className="text-lg font-bold text-gray-900 mb-4">
                        {isEditing ? "Edit Category" : "Add New Category"}
                    </h2>

                    {formError && (
                        <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700 font-medium">
                            {formError}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                                Category Name <span className="text-red-500">*</span>
                            </label>
                            <input
                                required
                                value={name}
                                onChange={e => setName(e.target.value)}
                                placeholder="e.g. Electronics, Clothing"
                                className="w-full px-3.5 py-2.5 rounded-lg border border-gray-200 text-gray-900 text-sm focus:outline-none focus:border-indigo-600"
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                                Description
                            </label>
                            <textarea
                                value={description}
                                onChange={e => setDescription(e.target.value)}
                                rows={3}
                                placeholder="Category description (optional)"
                                className="w-full px-3.5 py-2.5 rounded-lg border border-gray-200 text-gray-900 text-sm focus:outline-none focus:border-indigo-600"
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                                Parent Category <span className="text-xs text-gray-500 font-normal">(optional)</span>
                            </label>
                            <select
                                value={parentId}
                                onChange={e => setParentId(e.target.value)}
                                className="w-full px-3.5 py-2.5 rounded-lg border border-gray-200 text-gray-900 text-sm focus:outline-none focus:border-indigo-600"
                            >
                                <option value="">None (Top Level)</option>
                                {categories
                                    .filter(c => !isEditing || c._id !== editingId)
                                    .map(c => (
                                        <option key={c._id} value={c._id}>{c.name}</option>
                                    ))}
                            </select>
                        </div>

                        <div className="flex gap-2 pt-2">
                            <button
                                type="submit"
                                disabled={submitting}
                                className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                            >
                                {submitting ? "Saving…" : isEditing ? "Update Category" : "Create Category"}
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
                                    <th className="p-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Category</th>
                                    <th className="p-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Slug</th>
                                    <th className="p-4 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr>
                                        <td colSpan={3} className="p-12 text-center text-gray-400 text-sm">
                                            Loading categories…
                                        </td>
                                    </tr>
                                ) : categories.length === 0 ? (
                                    <tr>
                                        <td colSpan={3} className="p-12 text-center text-gray-500 text-sm">
                                            No categories found. Create one to get started!
                                        </td>
                                    </tr>
                                ) : (
                                    categories.map(cat => (
                                        <tr key={cat._id} className="border-b border-gray-100 last:border-none hover:bg-gray-50/50 transition-colors">
                                            <td className="p-4">
                                                <div className="font-semibold text-gray-900 text-sm">{cat.name}</div>
                                                {cat.description && (
                                                    <div className="text-xs text-gray-500 truncate max-w-sm">{cat.description}</div>
                                                )}
                                            </td>
                                            <td className="p-4 text-xs font-mono text-gray-600">
                                                {cat.slug}
                                            </td>
                                            <td className="p-4 text-right space-x-3">
                                                <button
                                                    onClick={() => handleEdit(cat)}
                                                    className="text-xs font-medium text-indigo-600 hover:text-indigo-800 transition-colors cursor-pointer"
                                                >
                                                    Edit
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(cat._id)}
                                                    className="text-xs font-medium text-red-600 hover:text-red-800 transition-colors cursor-pointer"
                                                >
                                                    Delete
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}
