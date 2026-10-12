"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../context/AuthContext";
import { useCart } from "../../context/CartContext";
import { fetchApi } from "../../lib/api";
import { MapPin, Package, ArrowLeft, AlertCircle, CreditCard } from "lucide-react";
import { PayPalScriptProvider, PayPalButtons } from "@paypal/react-paypal-js";

export default function CheckoutPage() {
    const { user, loading: authLoading } = useAuth();
    const { items, summary, clearCart } = useCart();
    const router = useRouter();

    const defaultAddress = user?.addresses?.find((a: any) => a.isDefault) || user?.addresses?.[0];

    const [form, setForm] = useState({
        street: defaultAddress?.street || "",
        city: defaultAddress?.city || "",
        state: defaultAddress?.state || "",
        zip: defaultAddress?.zipCode || "",
        country: defaultAddress?.country || "United States",
    });

    const [error, setError] = useState<string | null>(null);
    const [createdOrderId, setCreatedOrderId] = useState<string | null>(null);

    useEffect(() => {
        if (!authLoading && !user) router.push("/login");
    }, [user, authLoading, router]);

    if (!user || !items) return null;

    const paypalClientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID || "test";

    return (
        <PayPalScriptProvider options={{
            clientId: paypalClientId,
            currency: "USD",
            intent: "capture"
        }}>
            <div className="container-custom py-12 min-h-[80vh] bg-white">
                <div className="mb-8">
                    <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-1">Checkout</h1>
                    <p className="text-xs text-gray-500">Confirm your shipping address and select payment method.</p>
                </div>

                <div className="flex flex-col lg:flex-row gap-8">
                    {/* ── Left Column: Address + Payment Selector ── */}
                    <div className="flex-1 space-y-6">
                        {/* Shipping Address */}
                        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-xs">
                            <h2 className="text-base font-bold text-gray-900 mb-5 flex items-center gap-2">
                                <MapPin className="w-4 h-4 text-indigo-600" />
                                <span>Shipping Address</span>
                            </h2>

                            {error && (
                                <div className="mb-5 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-xs flex items-center gap-2">
                                    <AlertCircle className="w-4 h-4 shrink-0" />
                                    <span>{error}</span>
                                </div>
                            )}

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-xs font-medium text-gray-700 mb-1.5">Street Address *</label>
                                    <input
                                        type="text"
                                        placeholder="123 Main Street, Apt 4B"
                                        value={form.street}
                                        onChange={(e) => setForm({ ...form, street: e.target.value })}
                                        className="w-full bg-white border border-gray-300 rounded-lg px-3.5 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 transition-colors"
                                    />
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-medium text-gray-700 mb-1.5">City *</label>
                                        <input
                                            type="text"
                                            placeholder="New York"
                                            value={form.city}
                                            onChange={(e) => setForm({ ...form, city: e.target.value })}
                                            className="w-full bg-white border border-gray-300 rounded-lg px-3.5 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 transition-colors"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-gray-700 mb-1.5">State</label>
                                        <input
                                            type="text"
                                            placeholder="NY"
                                            value={form.state}
                                            onChange={(e) => setForm({ ...form, state: e.target.value })}
                                            className="w-full bg-white border border-gray-300 rounded-lg px-3.5 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 transition-colors"
                                        />
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-medium text-gray-700 mb-1.5">Postal / PIN Code *</label>
                                        <input
                                            type="text"
                                            placeholder="10001"
                                            value={form.zip}
                                            onChange={(e) => setForm({ ...form, zip: e.target.value })}
                                            className="w-full bg-white border border-gray-300 rounded-lg px-3.5 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 transition-colors"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-gray-700 mb-1.5">Country *</label>
                                        <select
                                            value={form.country}
                                            onChange={(e) => setForm({ ...form, country: e.target.value })}
                                            className="w-full bg-white border border-gray-300 rounded-lg px-3.5 py-2 text-sm text-gray-900 focus:outline-none focus:border-indigo-600 transition-colors"
                                        >
                                            <option>United States</option>
                                            <option>Canada</option>
                                            <option>United Kingdom</option>
                                            <option>Australia</option>
                                            <option>Germany</option>
                                            <option>India</option>
                                            <option>Singapore</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Payment Method */}
                        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-xs">
                            <h2 className="text-base font-bold text-gray-900 mb-1 flex items-center gap-2">
                                <CreditCard className="w-4 h-4 text-indigo-600" />
                                <span>Payment Method</span>
                            </h2>
                            <p className="text-xs text-gray-500 mb-5">
                                Complete your purchase securely via PayPal. Your order total is verified on the server.
                            </p>

                            <div className="max-w-md">
                                <PayPalButtons
                                    style={{ layout: "vertical", shape: "rect", height: 44 }}
                                    createOrder={async () => {
                                        if (!form.street || !form.city || !form.zip || !form.country) {
                                            setError("Please fill in all shipping address fields before paying.");
                                            throw new Error("Missing shipping address");
                                        }
                                        setError(null);

                                        try {
                                            // 1. Create order in DB if not already created
                                            let orderId = createdOrderId;
                                            if (!orderId) {
                                                const order = await fetchApi("/orders", {
                                                    method: "POST",
                                                    body: JSON.stringify({ shippingAddress: form }),
                                                });
                                                orderId = order._id;
                                                setCreatedOrderId(order._id);
                                            }

                                            // 2. Call PayPal create-order endpoint (server computes total)
                                            const res = await fetchApi("/payment/paypal/create-order", {
                                                method: "POST",
                                                body: JSON.stringify({ orderId }),
                                            });

                                            return res.paypalOrderId;
                                        } catch (err: any) {
                                            setError(err.message || "Failed to create PayPal order");
                                            throw err;
                                        }
                                    }}
                                    onApprove={async (data) => {
                                        try {
                                            const res = await fetchApi("/payment/paypal/capture", {
                                                method: "POST",
                                                body: JSON.stringify({ paypalOrderId: data.orderID }),
                                            });

                                            clearCart();
                                            router.push(`/orders/${res.orderId || createdOrderId}?payment=success`);
                                        } catch (err: any) {
                                            setError(err.message || "Failed to capture PayPal payment.");
                                        }
                                    }}
                                    onError={(err) => {
                                        console.error("PayPal Error:", err);
                                        setError("A PayPal error occurred. Please try again.");
                                    }}
                                    onCancel={() => {
                                        setError("PayPal payment was cancelled.");
                                    }}
                                />
                            </div>
                        </div>
                    </div>

                    {/* ── Right Column: Order Summary ── */}
                    <div className="lg:w-80 shrink-0">
                        <div className="bg-white border border-gray-200 rounded-xl p-5 sticky top-24 shadow-xs">
                            <h2 className="text-base font-bold text-gray-900 mb-4 pb-2 border-b border-gray-100">Order Summary</h2>

                            {/* Items */}
                            <div className="space-y-3 mb-4 max-h-56 overflow-y-auto pr-1">
                                {items.map((item, index) => (
                                    <div key={`${item.product_id}-${index}`} className="flex gap-3 items-center">
                                        <div className="w-10 h-10 rounded-md overflow-hidden bg-gray-50 border border-gray-200 shrink-0">
                                            {item.image ? (
                                                <img src={item.image} alt="" className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="flex items-center justify-center h-full text-gray-300">
                                                    <Package className="w-4 h-4" />
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xs font-medium text-gray-900 line-clamp-1">{item.title}</p>
                                            <p className="text-[11px] text-gray-500">Qty: {item.quantity}</p>
                                        </div>
                                        <p className="text-xs font-semibold text-gray-900 shrink-0">
                                            ${(item.price_at_addition * item.quantity).toFixed(2)}
                                        </p>
                                    </div>
                                ))}
                            </div>

                            {summary && (
                                <>
                                    <div className="h-px bg-gray-200 my-3" />
                                    <div className="space-y-2 text-xs text-gray-600 mb-3">
                                        <div className="flex justify-between">
                                            <span>Subtotal</span>
                                            <span className="text-gray-900">${summary.subtotal.toFixed(2)}</span>
                                        </div>
                                        {summary.discountAmount > 0 && (
                                            <div className="flex justify-between text-rose-600">
                                                <span>Discount</span>
                                                <span>-${summary.discountAmount.toFixed(2)}</span>
                                            </div>
                                        )}
                                        <div className="flex justify-between">
                                            <span>Tax (8%)</span>
                                            <span className="text-gray-900">${summary.tax.toFixed(2)}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span>Shipping</span>
                                            <span className={summary.shipping === 0 ? "text-emerald-700 font-medium" : "text-gray-900"}>
                                                {summary.shipping === 0 ? "Free" : `$${summary.shipping.toFixed(2)}`}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="h-px bg-gray-200 my-3" />
                                    <div className="flex justify-between text-sm font-bold text-gray-900 mb-5">
                                        <span>Total</span>
                                        <span className="text-indigo-600">${summary.total.toFixed(2)}</span>
                                    </div>
                                </>
                            )}



                            <button
                                onClick={() => router.back()}
                                className="mt-3 w-full text-center text-xs text-gray-500 hover:text-gray-800 transition-colors flex items-center justify-center gap-1 cursor-pointer"
                            >
                                <ArrowLeft className="w-3 h-3" />
                                <span>Back to Cart</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </PayPalScriptProvider>
    );
}
