"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { fetchApi } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import { Search, X, ShoppingCart, AlertCircle, Package } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────
type Product = {
    _id: string;
    title: string;
    description: string;
    price: number;
    stock: number;
    images?: string[];
    discount: number;
    category_id: { _id: string; name: string } | string;
};

type Category = { _id: string; name: string };

const SORT_OPTIONS = [
    { label: "Newest First", value: "" },
    { label: "Price: Low → High", value: "price" },
    { label: "Price: High → Low", value: "-price" },
    { label: "Name: A → Z", value: "title" },
    { label: "Name: Z → A", value: "-title" },
];

const PAGE_SIZE_OPTIONS = [12, 24, 48];

export default function ProductsPage() {
    const [products, setProducts] = useState<Product[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");
    const [selectedCat, setSelectedCat] = useState("");
    const [sort, setSort] = useState("");
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalCount, setTotalCount] = useState(0);
    const [limit, setLimit] = useState(12);
    const [cartMsg, setCartMsg] = useState<string | null>(null);
    const [cartError, setCartError] = useState<string | null>(null);
    const [addingId, setAddingId] = useState<string | null>(null);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const { user } = useAuth();
    const { addItem } = useCart();

    // Debounce search input
    useEffect(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
            setDebouncedSearch(search);
            setPage(1);
        }, 400);
        return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    }, [search]);

    // Fetch categories once
    useEffect(() => {
        fetchApi("/categories")
            .then((data) => setCategories(Array.isArray(data) ? data : []))
            .catch(() => { });
    }, []);

    // Fetch products whenever filters change
    const loadProducts = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({
                page: String(page),
                limit: String(limit),
                ...(debouncedSearch ? { search: debouncedSearch } : {}),
                ...(selectedCat ? { category: selectedCat } : {}),
                ...(sort ? { sort } : {}),
            });
            const data = await fetchApi(`/products?${params.toString()}`);
            setProducts(data.products ?? []);
            setTotalPages(data.pages ?? 1);
            setTotalCount(data.total ?? 0);
        } catch {
            setProducts([]);
        } finally {
            setLoading(false);
        }
    }, [page, limit, debouncedSearch, selectedCat, sort]);

    useEffect(() => { loadProducts(); }, [loadProducts]);

    const handleAddToCart = async (product: Product) => {
        if (product.stock === 0) return;
        if (!user) {
            setCartError("Please sign in to add items to your cart.");
            setTimeout(() => setCartError(null), 3000);
            return;
        }
        setAddingId(product._id);
        try {
            await addItem(product._id, 1);
            setCartMsg(`"${product.title.substring(0, 30)}" added to cart!`);
            setTimeout(() => setCartMsg(null), 2500);
        } catch (err: any) {
            setCartError(err.message || "Failed to add to cart");
            setTimeout(() => setCartError(null), 3000);
        } finally {
            setAddingId(null);
        }
    };

    const discountedPrice = (price: number, discount: number) =>
        discount > 0 ? (price * (1 - discount / 100)).toFixed(2) : null;

    const resetFilters = () => {
        setSearch("");
        setDebouncedSearch("");
        setSelectedCat("");
        setSort("");
        setPage(1);
        setLimit(12);
    };

    return (
        <div className="min-h-[80vh] py-10 bg-white">
            {/* Toast */}
            {cartMsg && (
                <div className="fixed bottom-6 right-6 z-50 bg-gray-900 text-white px-4 py-3 rounded-xl shadow-lg text-sm font-medium flex items-center gap-2">
                    <ShoppingCart className="w-4 h-4 text-indigo-400" />
                    <span>{cartMsg}</span>
                </div>
            )}
            {cartError && (
                <div className="fixed bottom-6 right-6 z-50 bg-red-600 text-white px-4 py-3 rounded-xl shadow-lg text-sm font-medium flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" />
                    <span>{cartError}</span>
                </div>
            )}

            <div className="container-custom">
                {/* ── Page Header ── */}
                <div className="mb-8">
                    <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-2">All Products</h1>
                    <p className="text-gray-600 text-sm">
                        {totalCount > 0 ? `Showing ${products.length} of ${totalCount} products` : "Browse our full collection"}
                    </p>
                </div>

                <div className="flex flex-col lg:flex-row gap-8">
                    {/* ── Sidebar ── */}
                    <aside className="lg:w-64 flex-shrink-0 space-y-5">
                        {/* Search */}
                        <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-2 shadow-xs">
                            <label className="text-xs uppercase tracking-wider text-gray-500 font-semibold">Search</label>
                            <div className="relative">
                                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                                <input
                                    type="text"
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    placeholder="Search products…"
                                    className="w-full bg-white border border-gray-300 rounded-lg pl-9 pr-8 py-2 text-sm text-gray-900 placeholder:text-gray-400 outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 transition-colors"
                                />
                                {search && (
                                    <button
                                        onClick={() => setSearch("")}
                                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Category filter */}
                        <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-2 shadow-xs">
                            <label className="text-xs uppercase tracking-wider text-gray-500 font-semibold">Category</label>
                            <div className="space-y-1 max-h-64 overflow-y-auto">
                                <button
                                    onClick={() => { setSelectedCat(""); setPage(1); }}
                                    className={`w-full text-left px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                                        selectedCat === ""
                                            ? "bg-indigo-50 text-indigo-700 font-semibold"
                                            : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                                    }`}
                                >
                                    All Categories
                                </button>
                                {categories.map((c) => (
                                    <button
                                        key={c._id}
                                        onClick={() => { setSelectedCat(c._id); setPage(1); }}
                                        className={`w-full text-left px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                                            selectedCat === c._id
                                                ? "bg-indigo-50 text-indigo-700 font-semibold"
                                                : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                                        }`}
                                    >
                                        {c.name}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Sort */}
                        <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-2 shadow-xs">
                            <label className="text-xs uppercase tracking-wider text-gray-500 font-semibold">Sort By</label>
                            <div className="space-y-1">
                                {SORT_OPTIONS.map((opt) => (
                                    <button
                                        key={opt.value}
                                        onClick={() => { setSort(opt.value); setPage(1); }}
                                        className={`w-full text-left px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                                            sort === opt.value
                                                ? "bg-indigo-50 text-indigo-700 font-semibold"
                                                : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                                        }`}
                                    >
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Reset */}
                        {(search || selectedCat || sort || limit !== 12) && (
                            <button
                                onClick={resetFilters}
                                className="w-full py-2 px-4 rounded-lg border border-gray-300 bg-white text-gray-600 hover:text-gray-900 hover:bg-gray-50 text-xs font-medium transition-colors cursor-pointer"
                            >
                                Clear All Filters
                            </button>
                        )}
                    </aside>

                    {/* ── Main Content ── */}
                    <main className="flex-1 min-w-0">
                        {/* Top bar — items-per-page + count */}
                        <div className="flex items-center justify-between mb-5 gap-4 flex-wrap">
                            <span className="text-gray-500 text-xs">
                                Page <strong className="text-gray-900">{page}</strong> of <strong className="text-gray-900">{totalPages}</strong>
                            </span>
                            <div className="flex items-center gap-2 text-xs text-gray-500">
                                <span>Show</span>
                                {PAGE_SIZE_OPTIONS.map((n) => (
                                    <button
                                        key={n}
                                        onClick={() => { setLimit(n); setPage(1); }}
                                        className={`px-2.5 py-1 rounded-md border text-xs font-medium transition-colors cursor-pointer ${
                                            limit === n
                                                ? "bg-indigo-600 border-indigo-600 text-white"
                                                : "border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50"
                                        }`}
                                    >
                                        {n}
                                    </button>
                                ))}
                                <span>per page</span>
                            </div>
                        </div>

                        {/* Loading skeleton */}
                        {loading ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
                                {Array.from({ length: limit > 12 ? 12 : limit }).map((_, i) => (
                                    <div key={i} className="bg-white border border-gray-200 rounded-xl overflow-hidden animate-pulse">
                                        <div className="h-48 bg-gray-100" />
                                        <div className="p-4 space-y-3">
                                            <div className="h-4 bg-gray-100 rounded w-3/4" />
                                            <div className="h-3 bg-gray-100 rounded w-full" />
                                            <div className="h-3 bg-gray-100 rounded w-2/3" />
                                            <div className="h-8 bg-gray-100 rounded mt-4" />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : products.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-24 text-center bg-white border border-gray-200 rounded-xl p-8">
                                <Search className="w-12 h-12 text-gray-300 stroke-1 mb-3" />
                                <h3 className="text-base font-semibold text-gray-900 mb-1">No products found</h3>
                                <p className="text-gray-500 text-xs mb-5">Try adjusting your search or filters.</p>
                                <button
                                    onClick={resetFilters}
                                    className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium cursor-pointer"
                                >
                                    Clear Filters
                                </button>
                            </div>
                        ) : (
                            <>
                                {/* Product Grid */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
                                    {products.map((product) => {
                                        const finalPrice = discountedPrice(product.price, product.discount);
                                        const outOfStock = product.stock === 0;
                                        return (
                                            <div
                                                key={product._id}
                                                className="bg-white border border-gray-200 rounded-xl flex flex-col h-full overflow-hidden shadow-xs hover:border-gray-300 transition-all"
                                            >
                                                {/* Image */}
                                                <div className="relative h-48 bg-gray-50 overflow-hidden border-b border-gray-100">
                                                    {product.images?.[0] ? (
                                                        <img
                                                            src={product.images[0]}
                                                            alt={product.title}
                                                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                                        />
                                                    ) : (
                                                        <div className="flex items-center justify-center h-full text-gray-300">
                                                            <Package className="w-10 h-10" />
                                                        </div>
                                                    )}
                                                    {/* Badges */}
                                                    <div className="absolute top-2.5 left-2.5 flex gap-1.5">
                                                        {product.discount > 0 && (
                                                            <span className="bg-rose-50 border border-rose-200 text-rose-700 text-[10px] font-bold px-2 py-0.5 rounded-full">
                                                                -{product.discount}%
                                                            </span>
                                                        )}
                                                        {outOfStock && (
                                                            <span className="bg-gray-100 border border-gray-200 text-gray-700 text-[10px] font-bold px-2 py-0.5 rounded-full">
                                                                Out of Stock
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Content */}
                                                <div className="flex flex-col flex-1 p-4">
                                                    <h3 className="font-semibold text-sm text-gray-900 leading-snug mb-1 line-clamp-2">
                                                        {product.title}
                                                    </h3>
                                                    <p className="text-gray-500 text-xs leading-relaxed flex-1 mb-3 line-clamp-2">
                                                        {product.description}
                                                    </p>

                                                    {/* Price */}
                                                    <div className="flex items-baseline gap-2 mb-3">
                                                        {finalPrice ? (
                                                            <>
                                                                <span className="text-gray-900 font-bold text-base">${finalPrice}</span>
                                                                <span className="text-gray-400 line-through text-xs">${product.price.toFixed(2)}</span>
                                                            </>
                                                        ) : (
                                                            <span className="text-gray-900 font-bold text-base">${product.price.toFixed(2)}</span>
                                                        )}
                                                    </div>

                                                    {/* Stock indicator */}
                                                    <div className="flex items-center gap-1.5 mb-3">
                                                        <span
                                                            className={`w-1.5 h-1.5 rounded-full ${
                                                                outOfStock ? "bg-red-500" : product.stock < 10 ? "bg-amber-500" : "bg-emerald-500"
                                                            }`}
                                                        />
                                                        <span className="text-[11px] text-gray-500 font-medium">
                                                            {outOfStock ? "Out of stock" : product.stock < 10 ? `Only ${product.stock} left` : "In stock"}
                                                        </span>
                                                    </div>

                                                    <button
                                                        onClick={() => handleAddToCart(product)}
                                                        disabled={outOfStock || addingId === product._id}
                                                        className={`w-full py-2 px-3 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                                                            outOfStock
                                                                ? "bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200"
                                                                : addingId === product._id
                                                                    ? "bg-indigo-400 text-white cursor-wait"
                                                                    : "bg-indigo-600 hover:bg-indigo-700 text-white"
                                                        }`}
                                                    >
                                                        {addingId === product._id ? "Adding…" : outOfStock ? "Unavailable" : "Add to Cart"}
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* ── Pagination Controls ── */}
                                {totalPages > 1 && (
                                    <div className="flex items-center justify-center gap-1.5 mt-10 flex-wrap">
                                        <button
                                            onClick={() => setPage(1)}
                                            disabled={page === 1}
                                            className="px-2.5 py-1.5 rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed text-xs transition-colors cursor-pointer"
                                        >
                                            « First
                                        </button>
                                        <button
                                            onClick={() => setPage((p) => Math.max(1, p - 1))}
                                            disabled={page === 1}
                                            className="px-2.5 py-1.5 rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed text-xs transition-colors cursor-pointer"
                                        >
                                            ‹ Prev
                                        </button>

                                        {Array.from({ length: totalPages }, (_, i) => i + 1)
                                            .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 2)
                                            .reduce<(number | "...")[]>((acc, p, idx, arr) => {
                                                if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push("...");
                                                acc.push(p);
                                                return acc;
                                            }, [])
                                            .map((p, i) =>
                                                p === "..." ? (
                                                    <span key={`ellipsis-${i}`} className="px-2 text-gray-400 text-xs">…</span>
                                                ) : (
                                                    <button
                                                        key={p}
                                                        onClick={() => setPage(p as number)}
                                                        className={`w-8 h-8 rounded-md border text-xs font-medium transition-colors cursor-pointer ${
                                                            page === p
                                                                ? "bg-indigo-600 border-indigo-600 text-white font-semibold"
                                                                : "border-gray-200 text-gray-600 hover:bg-gray-50"
                                                        }`}
                                                    >
                                                        {p}
                                                    </button>
                                                )
                                            )}

                                        <button
                                            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                                            disabled={page === totalPages}
                                            className="px-2.5 py-1.5 rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed text-xs transition-colors cursor-pointer"
                                        >
                                            Next ›
                                        </button>
                                        <button
                                            onClick={() => setPage(totalPages)}
                                            disabled={page === totalPages}
                                            className="px-2.5 py-1.5 rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed text-xs transition-colors cursor-pointer"
                                        >
                                            Last »
                                        </button>
                                    </div>
                                )}
                            </>
                        )}
                    </main>
                </div>
            </div>
        </div>
    );
}
