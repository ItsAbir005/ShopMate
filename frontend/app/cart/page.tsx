"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import { ShoppingCart, Check, Trash2, Package, AlertTriangle, ArrowRight, ArrowLeft } from "lucide-react";

export default function CartPage() {
    const { user } = useAuth();
    const { items, summary, loading, updateItem, removeItem, clearCart, validateCart, refreshCart } = useCart();
    const [validating, setValidating] = useState(false);
    const [clearing, setClearing] = useState(false);
    const [notifications, setNotifications] = useState<string[]>([]);
    const [updatingId, setUpdatingId] = useState<string | null>(null);

    useEffect(() => { if (user) refreshCart(); }, [user]);

    const showNotifications = (msgs: string[]) => {
        setNotifications(msgs);
        setTimeout(() => setNotifications([]), 5000);
    };

    const handleValidate = async () => {
        setValidating(true);
        try {
            const result = await validateCart();
            if (result.changes.length > 0) showNotifications(result.changes);
            else showNotifications(["Cart is valid — all items are in stock and prices are current."]);
        } finally {
            setValidating(false);
        }
    };

    const handleClear = async () => {
        if (!confirm("Clear your entire cart?")) return;
        setClearing(true);
        try { await clearCart(); }
        finally { setClearing(false); }
    };

    const handleQtyChange = async (itemId: string, newQty: number) => {
        if (newQty < 1) return;
        setUpdatingId(itemId);
        try { await updateItem(itemId, newQty); }
        finally { setUpdatingId(null); }
    };

    // ── Not logged in ─────────────────────────────────────────────────────────
    if (!user) {
        return (
            <div className="container-custom min-h-[80vh] flex flex-col items-center justify-center text-center py-20 bg-white">
                <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-5 text-gray-500">
                    <ShoppingCart className="w-8 h-8" />
                </div>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">Sign in to view your cart</h2>
                <p className="text-sm text-gray-600 mb-6">Your cart items are saved securely when you are logged in.</p>
                <Link href="/login" className="btn btn-primary px-6 py-2.5 text-sm">
                    Sign In
                </Link>
            </div>
        );
    }

    // ── Loading skeleton ──────────────────────────────────────────────────────
    if (loading && items.length === 0) {
        return (
            <div className="container-custom py-12 min-h-[80vh] bg-white">
                <div className="h-8 w-40 bg-gray-100 rounded-lg mb-8 animate-pulse" />
                <div className="flex flex-col lg:flex-row gap-8">
                    <div className="flex-1 space-y-4">
                        {[1, 2, 3].map((i) => (
                            <div key={i} className="bg-white border border-gray-200 rounded-xl p-5 animate-pulse flex gap-5">
                                <div className="w-20 h-20 bg-gray-100 rounded-lg shrink-0" />
                                <div className="flex-1 space-y-2.5">
                                    <div className="h-4 bg-gray-100 rounded w-3/4" />
                                    <div className="h-3 bg-gray-100 rounded w-1/3" />
                                    <div className="h-7 bg-gray-100 rounded w-28 mt-3" />
                                </div>
                                <div className="h-6 w-16 bg-gray-100 rounded" />
                            </div>
                        ))}
                    </div>
                    <div className="lg:w-80 bg-white border border-gray-200 rounded-xl p-6 h-64 animate-pulse" />
                </div>
            </div>
        );
    }

    // ── Empty cart ────────────────────────────────────────────────────────────
    if (items.length === 0) {
        return (
            <div className="container-custom min-h-[80vh] flex flex-col items-center justify-center text-center py-20 bg-white">
                <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-5 text-gray-400">
                    <ShoppingCart className="w-8 h-8" />
                </div>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">Your cart is empty</h2>
                <p className="text-sm text-gray-600 mb-6">Looks like you haven't added anything to your cart yet.</p>
                <Link href="/products" className="btn btn-primary px-6 py-2.5 text-sm">
                    Browse Products
                </Link>
            </div>
        );
    }

    // ── Full cart ─────────────────────────────────────────────────────────────
    return (
        <div className="container-custom py-12 min-h-[80vh] bg-white">
            {/* Notifications */}
            {notifications.length > 0 && (
                <div className="mb-6 bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-1">
                    {notifications.map((msg, i) => (
                        <p key={i} className="text-amber-800 text-xs flex items-center gap-1.5 font-medium">
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                            <span>{msg}</span>
                        </p>
                    ))}
                </div>
            )}

            {/* Header */}
            <div className="flex items-center justify-between mb-8 flex-wrap gap-4 pb-4 border-b border-gray-100">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Shopping Cart</h1>
                    <p className="text-xs text-gray-500 mt-1">
                        {summary?.itemCount ?? 0} item{(summary?.itemCount ?? 0) !== 1 ? "s" : ""}
                    </p>
                </div>
                <div className="flex gap-2.5">
                    <button
                        onClick={handleValidate}
                        disabled={validating}
                        className="px-3 py-1.5 rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 text-xs font-medium transition-colors disabled:opacity-50 flex items-center gap-1 cursor-pointer"
                    >
                        <Check className="w-3.5 h-3.5" />
                        <span>{validating ? "Validating…" : "Validate"}</span>
                    </button>
                    <button
                        onClick={handleClear}
                        disabled={clearing}
                        className="px-3 py-1.5 rounded-lg border border-red-200 bg-white text-red-600 hover:bg-red-50 text-xs font-medium transition-colors disabled:opacity-50 flex items-center gap-1 cursor-pointer"
                    >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>{clearing ? "Clearing…" : "Clear Cart"}</span>
                    </button>
                </div>
            </div>

            <div className="flex flex-col lg:flex-row gap-8">
                {/* ── Cart Items ── */}
                <div className="flex-1 space-y-3">
                    {items.map((item, index) => {
                        const uniqueId = String(item.product_id);
                        const isUpdating = updatingId === uniqueId;
                        const finalPrice = item.price_at_addition;
                        const lineTotal = (finalPrice * item.quantity).toFixed(2);

                        return (
                            <div
                                key={`${uniqueId}-${index}`}
                                className={`bg-white border border-gray-200 rounded-xl p-4 flex flex-col sm:flex-row gap-4 items-start sm:items-center shadow-xs transition-opacity ${
                                    isUpdating ? "opacity-60" : ""
                                }`}
                            >
                                {/* Image */}
                                <div className="w-20 h-20 shrink-0 rounded-lg overflow-hidden bg-gray-50 border border-gray-200">
                                    {item.image ? (
                                        <img src={item.image} alt={item.title} className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="flex items-center justify-center h-full text-gray-300">
                                            <Package className="w-6 h-6" />
                                        </div>
                                    )}
                                </div>

                                {/* Details */}
                                <div className="flex-1 min-w-0">
                                    <h3 className="font-semibold text-sm text-gray-900 leading-snug mb-1 line-clamp-1">
                                        {item.title}
                                    </h3>
                                    {item.variant_id && (
                                        <p className="text-xs text-gray-500 mb-1">Variant: {item.variant_id}</p>
                                    )}

                                    {/* Quantity control */}
                                    <div className="flex items-center gap-3 mt-2">
                                        <div className="flex items-center border border-gray-300 rounded-md overflow-hidden bg-white">
                                            <button
                                                onClick={() => handleQtyChange(uniqueId, item.quantity - 1)}
                                                disabled={isUpdating || item.quantity <= 1}
                                                className="w-7 h-7 flex items-center justify-center text-gray-600 hover:bg-gray-100 disabled:opacity-40 text-sm font-medium transition-colors cursor-pointer"
                                            >
                                                −
                                            </button>
                                            <span className="w-8 text-center text-xs font-semibold text-gray-900">
                                                {item.quantity}
                                            </span>
                                            <button
                                                onClick={() => handleQtyChange(uniqueId, item.quantity + 1)}
                                                disabled={isUpdating}
                                                className="w-7 h-7 flex items-center justify-center text-gray-600 hover:bg-gray-100 disabled:opacity-40 text-sm font-medium transition-colors cursor-pointer"
                                            >
                                                +
                                            </button>
                                        </div>
                                        <button
                                            onClick={() => removeItem(uniqueId)}
                                            disabled={isUpdating}
                                            className="text-xs text-gray-500 hover:text-red-600 transition-colors disabled:opacity-50 cursor-pointer"
                                        >
                                            Remove
                                        </button>
                                    </div>
                                </div>

                                {/* Price */}
                                <div className="text-right shrink-0">
                                    <p className="text-gray-900 font-bold text-base">${lineTotal}</p>
                                    <p className="text-gray-500 text-xs mt-0.5">${finalPrice.toFixed(2)} each</p>
                                    {item.discount > 0 && (
                                        <p className="text-rose-600 text-[11px] font-medium mt-0.5">-{item.discount}% off</p>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* ── Order Summary ── */}
                {summary && (
                    <div className="lg:w-80 shrink-0 self-start sticky top-24">
                        <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4 shadow-xs">
                            <h3 className="text-base font-bold text-gray-900">Order Summary</h3>

                            <div className="space-y-2.5 text-xs">
                                <div className="flex justify-between text-gray-600">
                                    <span>Subtotal ({summary.itemCount} items)</span>
                                    <span className="text-gray-900 font-medium">${summary.subtotal.toFixed(2)}</span>
                                </div>
                                {summary.discountAmount > 0 && (
                                    <div className="flex justify-between text-rose-600 font-medium">
                                        <span>Discount</span>
                                        <span>-${summary.discountAmount.toFixed(2)}</span>
                                    </div>
                                )}
                                <div className="flex justify-between text-gray-600">
                                    <span>Estimated Tax (8%)</span>
                                    <span className="text-gray-900 font-medium">${summary.tax.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between text-gray-600">
                                    <span>Shipping</span>
                                    <span className={summary.shipping === 0 ? "text-emerald-700 font-medium" : "text-gray-900 font-medium"}>
                                        {summary.shipping === 0 ? "Free" : `$${summary.shipping.toFixed(2)}`}
                                    </span>
                                </div>
                                {summary.shippingNote && (
                                    <p className="text-[11px] text-gray-500 italic">{summary.shippingNote}</p>
                                )}
                            </div>

                            <div className="h-px bg-gray-200" />

                            <div className="flex justify-between text-base font-bold text-gray-900">
                                <span>Total</span>
                                <span className="text-indigo-600">${summary.total.toFixed(2)}</span>
                            </div>

                            <Link
                                href="/orders/checkout"
                                className="w-full py-2.5 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer text-center block mt-3"
                            >
                                <span>Proceed to Checkout</span>
                                <ArrowRight className="w-3.5 h-3.5" />
                            </Link>

                            <Link
                                href="/products"
                                className="block text-center text-xs text-gray-500 hover:text-gray-900 transition-colors mt-2"
                            >
                                Continue Shopping
                            </Link>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
