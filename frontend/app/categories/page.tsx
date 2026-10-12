"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fetchApi } from "../lib/api";
import {
    Smartphone,
    Shirt,
    BookOpen,
    Home,
    Trophy,
    Sparkles,
    Utensils,
    Compass,
    Tag,
    Package,
    Folder,
    ArrowRight
} from "lucide-react";

type Category = {
    _id: string;
    name: string;
    slug: string;
    icon?: string;
    image?: string;
    description?: string;
    children?: Category[];
};

function getCategoryIconComponent(cat: Category) {
    const slug = (cat.slug || cat.name || "").toLowerCase();
    if (slug.includes("phone") || slug.includes("electronic")) return Smartphone;
    if (slug.includes("fashion") || slug.includes("cloth") || slug.includes("men") || slug.includes("women")) return Shirt;
    if (slug.includes("book")) return BookOpen;
    if (slug.includes("home")) return Home;
    if (slug.includes("sport")) return Trophy;
    if (slug.includes("beauty")) return Sparkles;
    if (slug.includes("kitchen")) return Utensils;
    if (slug.includes("outdoor")) return Compass;
    return Tag;
}

export default function CategoriesPage() {
    const [tree, setTree] = useState<Category[]>([]);
    const [loading, setLoading] = useState(true);
    const [selected, setSelected] = useState<Category | null>(null);
    const [products, setProducts] = useState<any[]>([]);
    const [prodLoading, setProdLoading] = useState(false);

    useEffect(() => {
        fetchApi("/categories/tree")
            .then(setTree)
            .catch(() => setTree([]))
            .finally(() => setLoading(false));
    }, []);

    const loadProducts = async (cat: Category) => {
        setSelected(cat);
        setProdLoading(true);
        try {
            const data = await fetchApi(`/categories/${cat._id}/products?limit=6`);
            setProducts(data.products || []);
        } catch {
            setProducts([]);
        } finally {
            setProdLoading(false);
        }
    };

    return (
        <div className="container-custom py-12 min-h-[80vh]">
            <div className="mb-8">
                <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-2">Categories</h1>
                <p className="text-sm text-gray-600">Browse our product catalog by department</p>
            </div>

            {loading ? (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {Array.from({ length: 8 }).map((_, i) => (
                        <div key={i} className="bg-white border border-gray-200 rounded-xl p-5 animate-pulse">
                            <div className="w-10 h-10 bg-gray-100 rounded-lg mb-3" />
                            <div className="h-4 bg-gray-100 rounded w-3/4 mb-2" />
                            <div className="h-3 bg-gray-100 rounded w-1/2" />
                        </div>
                    ))}
                </div>
            ) : (
                <div className="flex flex-col lg:flex-row gap-8">
                    {/* Category Grid */}
                    <div className="flex-1">
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                            {tree.map((cat) => {
                                const IconComponent = getCategoryIconComponent(cat);
                                const isSelected = selected?._id === cat._id;
                                return (
                                    <div key={cat._id} className="flex flex-col">
                                        {/* Parent category button */}
                                        <button
                                            onClick={() => loadProducts(cat)}
                                            className={`w-full text-left bg-white border rounded-xl p-5 transition-all cursor-pointer group ${
                                                isSelected
                                                    ? "border-indigo-600 ring-1 ring-indigo-600 bg-indigo-50/20"
                                                    : "border-gray-200 hover:border-gray-300 hover:bg-gray-50/50"
                                            }`}
                                        >
                                            <div className="flex items-start gap-3.5">
                                                {cat.image ? (
                                                    <div className="w-12 h-12 rounded-lg overflow-hidden shrink-0 border border-gray-100 bg-gray-50">
                                                        <img src={cat.image} alt={cat.name} className="w-full h-full object-cover" />
                                                    </div>
                                                ) : (
                                                    <div className="w-12 h-12 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
                                                        <IconComponent className="w-5 h-5" />
                                                    </div>
                                                )}
                                                <div className="min-w-0 flex-1">
                                                    <h3 className="font-semibold text-sm text-gray-900 group-hover:text-indigo-600 transition-colors leading-tight">
                                                        {cat.name}
                                                    </h3>
                                                    {cat.description && (
                                                        <p className="text-xs text-gray-500 mt-1 line-clamp-2">{cat.description}</p>
                                                    )}
                                                    {cat.children && cat.children.length > 0 && (
                                                        <p className="text-xs text-gray-400 mt-1.5 font-medium">
                                                            {cat.children.length} sub-categories
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                        </button>

                                        {/* Sub-categories */}
                                        {isSelected && cat.children && cat.children.length > 0 && (
                                            <div className="mt-2 ml-2 pl-3 border-l-2 border-indigo-200 space-y-1 py-1">
                                                {cat.children.map((sub) => {
                                                    const SubIcon = getCategoryIconComponent(sub);
                                                    const isSubSelected = selected?._id === sub._id;
                                                    return (
                                                        <button
                                                            key={sub._id}
                                                            onClick={() => loadProducts(sub)}
                                                            className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium transition-colors flex items-center gap-2 cursor-pointer ${
                                                                isSubSelected
                                                                    ? "bg-indigo-600 text-white"
                                                                    : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                                                            }`}
                                                        >
                                                            <SubIcon className="w-3.5 h-3.5" />
                                                            <span>{sub.name}</span>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Product Preview Panel */}
                    {selected && (
                        <div className="lg:w-80 shrink-0">
                            <div className="bg-white border border-gray-200 rounded-xl p-5 sticky top-24 shadow-xs">
                                <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-100">
                                    <h3 className="font-bold text-base text-gray-900">{selected.name}</h3>
                                    <Link
                                        href={`/products?category=${selected._id}`}
                                        className="text-xs text-indigo-600 hover:text-indigo-700 font-medium flex items-center gap-1"
                                    >
                                        <span>View all</span>
                                        <ArrowRight className="w-3 h-3" />
                                    </Link>
                                </div>

                                {prodLoading ? (
                                    <div className="space-y-3">
                                        {[1, 2, 3].map((i) => (
                                            <div key={i} className="flex gap-3 animate-pulse">
                                                <div className="w-12 h-12 bg-gray-100 rounded-lg shrink-0" />
                                                <div className="flex-1 space-y-2">
                                                    <div className="h-3 bg-gray-100 rounded w-3/4" />
                                                    <div className="h-3 bg-gray-100 rounded w-1/2" />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : products.length === 0 ? (
                                    <div className="text-center py-8 text-gray-500">
                                        <Folder className="w-8 h-8 mx-auto mb-2 text-gray-400 stroke-1" />
                                        <p className="text-xs">No products in this category yet.</p>
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {products.map((p) => (
                                            <Link
                                                href={`/products`}
                                                key={p._id}
                                                className="flex gap-3 group hover:bg-gray-50 rounded-lg p-2 -mx-2 transition-colors border border-transparent hover:border-gray-200"
                                            >
                                                <div className="w-12 h-12 rounded-lg overflow-hidden bg-gray-100 shrink-0 border border-gray-200">
                                                    {p.images?.[0] ? (
                                                        <img
                                                            src={p.images[0]}
                                                            alt={p.title}
                                                            className="w-full h-full object-cover"
                                                        />
                                                    ) : (
                                                        <div className="flex h-full items-center justify-center text-gray-400">
                                                            <Package className="w-4 h-4" />
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-xs font-medium text-gray-900 line-clamp-1 group-hover:text-indigo-600 transition-colors">
                                                        {p.title}
                                                    </p>
                                                    <p className="text-indigo-600 text-xs font-semibold mt-1">
                                                        ${p.discount > 0
                                                            ? (p.price * (1 - p.discount / 100)).toFixed(2)
                                                            : p.price.toFixed(2)}
                                                    </p>
                                                </div>
                                            </Link>
                                        ))}
                                        <Link
                                            href={`/products?category=${selected._id}`}
                                            className="block text-center py-2 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold mt-3 transition-colors"
                                        >
                                            See all in {selected.name}
                                        </Link>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
