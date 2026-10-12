"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { useAuth } from "../../context/AuthContext";
import { fetchApi } from "../../lib/api";
import ChatBox from "../../components/ChatBox";
import MapTracker from "../../components/MapTracker";
import {
    ArrowLeft,
    CheckCircle2,
    Clock,
    Truck,
    Package,
    AlertCircle,
    Check,
    Mail,
    CreditCard,
    Lock,
    MessageSquare,
    UserCheck,
    XCircle
} from "lucide-react";
import { PayPalScriptProvider, PayPalButtons } from "@paypal/react-paypal-js";

type OrderDetail = {
    _id: string;
    status: string;
    payment_status: string;
    paymentProvider?: string;
    total_amount: number;
    subtotal: number;
    discount_amount: number;
    tax_amount: number;
    shipping_cost: number;
    shipping_address: { street: string; city: string; state: string; zip: string; country: string };
    order_items: { _id: string; product_id: string; title: string; image?: string; price: number; discount: number; quantity: number }[];
    createdAt: string;
    cancelled_at?: string;
    cancellation_reason?: string;
};

type Shipment = {
    _id: string;
    trackingCode: string;
    status: string;
    otp?: string;
    estimatedDelivery?: string;
    driver_id?: {
        name: string;
        phone: string;
        vehicleNumber: string;
        vehicleType: string;
        currentLocation?: { lat: number; lng: number };
    };
};

const SHIPMENT_STATUS_STEPS = ["pending", "assigned", "picked_up", "out_for_delivery", "delivered"];

const STATUS_BADGE: Record<string, string> = {
    pending: "bg-amber-50 text-amber-700 border-amber-200",
    confirmed: "bg-indigo-50 text-indigo-700 border-indigo-200",
    paid: "bg-indigo-50 text-indigo-700 border-indigo-200",
    shipped: "bg-sky-50 text-sky-700 border-sky-200",
    delivered: "bg-emerald-50 text-emerald-700 border-emerald-200",
    cancelled: "bg-rose-50 text-rose-700 border-rose-200",
    returned: "bg-gray-100 text-gray-700 border-gray-200",
};

const STATUS_STEPS = ["pending", "paid", "shipped", "delivered"];

export default function OrderDetailPage() {
    const { user, loading: authLoading } = useAuth();
    const router = useRouter();
    const params = useParams();
    const searchParams = useSearchParams();
    const id = params?.id as string;

    const paymentSuccess = searchParams?.get("payment") === "success";
    const paymentCancel = searchParams?.get("payment") === "cancel";

    const [order, setOrder] = useState<OrderDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [cancelling, setCancelling] = useState(false);
    const [reason, setReason] = useState("");
    const [showCancel, setShowCancel] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [shipment, setShipment] = useState<Shipment | null>(null);
    const [isChatOpen, setIsChatOpen] = useState(false);
    const [token, setToken] = useState<string | undefined>(undefined);

    useEffect(() => {
        if (typeof window !== "undefined") {
            setToken(localStorage.getItem("token") || undefined);
        }
    }, []);

    useEffect(() => {
        if (!authLoading && !user) {
            router.push("/login");
        }
    }, [user, authLoading, router]);

    useEffect(() => {
        if (!user || !id) return;

        const loadOrderData = async () => {
            try {
                if (paymentSuccess) {
                    try {
                        await fetchApi(`/payments/verify/${id}`);
                    } catch (err) {
                        console.error("Payment verification fallback failed:", err);
                    }
                }

                const data = await fetchApi(`/orders/${id}`);
                setOrder(data);

                try {
                    const shipData = await fetchApi(`/shipping/order/${id}`);
                    setShipment(shipData);
                } catch {
                    // No shipment yet
                }
            } catch (err) {
                setError("Order not found.");
            } finally {
                setLoading(false);
            }
        };

        loadOrderData();
    }, [user, id, paymentSuccess]);

    const handleCancel = async () => {
        setCancelling(true);
        setError(null);
        try {
            const updated = await fetchApi(`/orders/${id}/cancel`, {
                method: "PUT",
                body: JSON.stringify({ reason }),
            });
            setOrder(updated);
            setShowCancel(false);
        } catch (err: any) {
            setError(err.message || "Failed to cancel order.");
        } finally {
            setCancelling(false);
        }
    };



    if (loading) {
        return (
            <div className="container-custom py-12 bg-white">
                <div className="animate-pulse space-y-4">
                    <div className="h-6 w-48 bg-gray-100 rounded" />
                    <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-3">
                        <div className="h-4 bg-gray-100 rounded w-1/4" />
                        <div className="h-4 bg-gray-100 rounded w-1/2" />
                    </div>
                </div>
            </div>
        );
    }

    if (error && !order) {
        return (
            <div className="container-custom py-16 text-center bg-white">
                <XCircle className="w-12 h-12 text-rose-500 mx-auto mb-3" />
                <h2 className="text-xl font-bold text-gray-900 mb-4">{error}</h2>
                <Link href="/orders" className="btn btn-primary text-xs px-4 py-2">
                    My Orders
                </Link>
            </div>
        );
    }

    if (!order) return null;

    const isCancellable = ["pending", "paid"].includes(order.status) || order.status === "confirmed";
    const displayStatus = order.status === "confirmed" ? "paid" : order.status;
    const currentStep = STATUS_STEPS.indexOf(displayStatus);

    return (
        <div className="container-custom py-12 min-h-[80vh] bg-white">
            {/* Header */}
            <div className="flex items-start justify-between mb-8 flex-wrap gap-4 pb-4 border-b border-gray-100">
                <div>
                    <Link href="/orders" className="text-xs text-gray-500 hover:text-gray-900 mb-2 flex items-center gap-1">
                        <ArrowLeft className="w-3.5 h-3.5" />
                        <span>Back to Orders</span>
                    </Link>
                    <h1 className="text-2xl font-bold text-gray-900">Order Details</h1>
                    <p className="text-xs text-gray-500 font-mono mt-0.5">#{order._id.slice(-10).toUpperCase()}</p>
                </div>
                <div className="flex items-center gap-2">
                    {order.paymentProvider && (
                        <span className={`text-xs px-2.5 py-1 rounded-full border font-semibold ${
                            order.paymentProvider === 'paypal'
                                ? 'bg-blue-50 text-blue-700 border-blue-200'
                                : 'bg-indigo-50 text-indigo-700 border-indigo-200'
                        }`}>
                            {order.paymentProvider === 'paypal' ? 'PayPal' : 'Stripe'}
                        </span>
                    )}
                    <span className={`text-xs px-3 py-1 rounded-full border font-semibold ${STATUS_BADGE[order.status] || "bg-gray-100 text-gray-700 border-gray-200"}`}>
                        {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                    </span>
                </div>
            </div>

            {error && (
                <div className="mb-6 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{error}</span>
                </div>
            )}

            {/* Status Timeline (only if not cancelled/returned) */}
            {!["cancelled", "returned"].includes(order.status) && (
                <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6 shadow-xs">
                    <div className="flex items-center justify-between relative max-w-xl mx-auto">
                        <div className="absolute top-4 left-4 right-4 h-0.5 bg-gray-200 z-0" />
                        {STATUS_STEPS.map((step, i) => {
                            const isDone = i <= currentStep;
                            return (
                                <div key={step} className="flex flex-col items-center z-10">
                                    <div
                                        className={`w-8 h-8 rounded-full border-2 flex items-center justify-center text-xs font-bold transition-all ${
                                            isDone
                                                ? "bg-indigo-600 border-indigo-600 text-white"
                                                : "bg-white border-gray-300 text-gray-400"
                                        }`}
                                    >
                                        {i < currentStep ? <Check className="w-4 h-4" /> : i + 1}
                                    </div>
                                    <span className={`text-xs mt-2 font-medium ${isDone ? "text-gray-900" : "text-gray-400"}`}>
                                        {step.charAt(0).toUpperCase() + step.slice(1)}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Payment Success Banner */}
            {paymentSuccess && order.payment_status === "paid" && (
                <div className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50/50 p-5">
                    <div className="flex items-center gap-3 mb-3">
                        <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                        <div>
                            <p className="font-semibold text-emerald-900 text-sm">Payment Confirmed</p>
                            <p className="text-xs text-emerald-700">Your order has been paid and is being prepared for shipment.</p>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs text-emerald-800 pt-2 border-t border-emerald-100">
                        <div className="flex items-center gap-2">
                            <Package className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Inventory reserved</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <Mail className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Confirmation email sent</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <CreditCard className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Payment verified</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <Truck className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Fulfillment queued</span>
                        </div>
                    </div>
                </div>
            )}

            {paymentCancel && (
                <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-xs font-medium flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>Payment was cancelled. You can retry paying below whenever you are ready.</span>
                </div>
            )}

            {/* Live Shipment Tracking Card */}
            {shipment && !['cancelled', 'returned'].includes(order.status) && (
                <div className="mb-6 bg-white border border-gray-200 rounded-xl overflow-hidden shadow-xs">
                    <div className="flex items-center justify-between p-5 border-b border-gray-100">
                        <div className="flex items-center gap-3">
                            <Truck className="w-5 h-5 text-indigo-600" />
                            <div>
                                <p className="font-semibold text-gray-900 text-sm">Shipment Tracking</p>
                                <p className="text-xs font-mono text-gray-500">{shipment.trackingCode}</p>
                            </div>
                        </div>
                        <span className="text-xs px-2.5 py-1 rounded-full font-medium bg-indigo-50 text-indigo-700 border border-indigo-200">
                            {shipment.status.replace(/_/g, ' ').toUpperCase()}
                        </span>
                    </div>

                    {/* Delivery OTP Badge */}
                    {shipment.otp && shipment.status !== 'delivered' && (
                        <div className="m-5 p-4 rounded-lg bg-gray-50 border border-gray-200 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <Lock className="w-5 h-5 text-indigo-600" />
                                <div>
                                    <p className="font-semibold text-gray-900 text-xs">Delivery PIN (OTP)</p>
                                    <p className="text-xs text-gray-500">Provide this PIN to your delivery driver</p>
                                </div>
                            </div>
                            <div className="font-mono text-lg font-bold tracking-widest text-indigo-700 bg-white px-3 py-1 rounded border border-gray-300">
                                {shipment.otp}
                            </div>
                        </div>
                    )}

                    {/* Driver info */}
                    {shipment.driver_id && (
                        <div className="mx-5 mb-5 p-3 rounded-lg bg-gray-50 border border-gray-200 flex items-center justify-between gap-4">
                            <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600">
                                    <UserCheck className="w-5 h-5" />
                                </div>
                                <div>
                                    <p className="font-semibold text-gray-900 text-xs">{shipment.driver_id.name}</p>
                                    <p className="text-[11px] text-gray-500">
                                        {shipment.driver_id.vehicleType} · {shipment.driver_id.vehicleNumber}
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => setIsChatOpen(true)}
                                className="px-3 py-1.5 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                            >
                                <MessageSquare className="w-3.5 h-3.5" />
                                <span>Driver Chat</span>
                            </button>
                        </div>
                    )}

                    {/* Live Map Tracker */}
                    {['assigned', 'picked_up', 'out_for_delivery'].includes(shipment.status) && (
                        <div className="mx-5 mb-5">
                            <MapTracker
                                orderId={order._id}
                                deliveryAddress={order.shipping_address}
                                initialDriverLocation={shipment.driver_id?.currentLocation}
                            />
                        </div>
                    )}
                </div>
            )}

            {/* Cancellation info */}
            {order.status === "cancelled" && order.cancellation_reason && (
                <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 mb-6">
                    <p className="text-rose-700 text-xs font-medium">Cancelled: {order.cancellation_reason}</p>
                    {order.cancelled_at && (
                        <p className="text-[11px] text-rose-500 mt-0.5">
                            on {new Date(order.cancelled_at).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}
                        </p>
                    )}
                </div>
            )}

            <div className="flex flex-col lg:flex-row gap-6">
                {/* Order Items */}
                <div className="flex-1 space-y-3">
                    <h2 className="font-bold text-sm text-gray-900">Ordered Items</h2>
                    {order.order_items.map((item) => (
                        <div key={item._id} className="bg-white border border-gray-200 rounded-xl p-4 flex gap-4 items-center shadow-xs">
                            <div className="w-16 h-16 rounded-lg overflow-hidden bg-gray-50 border border-gray-200 shrink-0">
                                {item.image ? (
                                    <img src={item.image} alt={item.title} className="w-full h-full object-cover" />
                                ) : (
                                    <div className="flex items-center justify-center h-full text-gray-300">
                                        <Package className="w-5 h-5" />
                                    </div>
                                )}
                            </div>
                            <div className="flex-1 min-w-0">
                                <h3 className="font-semibold text-xs text-gray-900 line-clamp-1 mb-1">{item.title}</h3>
                                <p className="text-xs text-gray-500">Qty: {item.quantity}</p>
                                {item.discount > 0 && <p className="text-rose-600 text-[11px] font-medium">{item.discount}% off</p>}
                            </div>
                            <div className="text-right shrink-0">
                                <p className="text-gray-900 font-bold text-sm">${(item.price * item.quantity).toFixed(2)}</p>
                                <p className="text-[11px] text-gray-500">${item.price.toFixed(2)} each</p>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Right sidebar */}
                <div className="lg:w-80 space-y-4 shrink-0">
                    {/* Price breakdown */}
                    <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-xs space-y-3">
                        <h3 className="font-bold text-xs uppercase tracking-wider text-gray-500">Price Breakdown</h3>
                        <div className="space-y-2 text-xs text-gray-600">
                            <div className="flex justify-between"><span>Subtotal</span><span className="text-gray-900">${order.subtotal.toFixed(2)}</span></div>
                            {order.discount_amount > 0 && <div className="flex justify-between text-rose-600"><span>Discount</span><span>-${order.discount_amount.toFixed(2)}</span></div>}
                            <div className="flex justify-between"><span>Tax</span><span className="text-gray-900">${order.tax_amount.toFixed(2)}</span></div>
                            <div className="flex justify-between">
                                <span>Shipping</span>
                                <span className={order.shipping_cost === 0 ? "text-emerald-700 font-medium" : "text-gray-900"}>
                                    {order.shipping_cost === 0 ? "Free" : `$${order.shipping_cost.toFixed(2)}`}
                                </span>
                            </div>
                        </div>
                        <div className="h-px bg-gray-200 my-2" />
                        <div className="flex justify-between font-bold text-base text-gray-900">
                            <span>Total</span>
                            <span className="text-indigo-600">${order.total_amount.toFixed(2)}</span>
                        </div>
                    </div>

                    {/* Shipping address */}
                    <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-xs">
                        <h3 className="font-bold text-xs uppercase tracking-wider text-gray-500 mb-2">Delivery Address</h3>
                        <p className="text-xs text-gray-700 leading-relaxed">
                            {order.shipping_address.street}<br />
                            {order.shipping_address.city}, {order.shipping_address.state} {order.shipping_address.zip}<br />
                            {order.shipping_address.country}
                        </p>
                    </div>

                    {/* Pay buttons */}
                    {order.payment_status === "unpaid" && !["cancelled", "returned"].includes(order.status) && (
                        <div className="space-y-3 bg-white border border-gray-200 rounded-xl p-4 shadow-xs">
                            <h4 className="font-bold text-xs uppercase tracking-wider text-gray-500">Pay for Order</h4>
                            <div>
                                <PayPalScriptProvider options={{
                                    clientId: process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID || "test",
                                    currency: "USD",
                                    intent: "capture"
                                }}>
                                    <PayPalButtons
                                        style={{ layout: "vertical", shape: "rect", height: 38 }}
                                        createOrder={async () => {
                                            const res = await fetchApi("/payment/paypal/create-order", {
                                                method: "POST",
                                                body: JSON.stringify({ orderId: order._id }),
                                            });
                                            return res.paypalOrderId;
                                        }}
                                        onApprove={async (data) => {
                                            await fetchApi("/payment/paypal/capture", {
                                                method: "POST",
                                                body: JSON.stringify({ paypalOrderId: data.orderID }),
                                            });
                                            window.location.reload();
                                        }}
                                        onError={() => {
                                            setError("PayPal payment failed. Please try again.");
                                        }}
                                    />
                                </PayPalScriptProvider>
                            </div>
                        </div>
                    )}

                    {/* Cancel button */}
                    {isCancellable && !showCancel && (
                        <button
                            onClick={() => setShowCancel(true)}
                            className="w-full py-2 px-3 rounded-lg border border-red-200 bg-white hover:bg-red-50 text-red-600 text-xs font-medium transition-colors cursor-pointer"
                        >
                            Cancel Order
                        </button>
                    )}

                    {showCancel && (
                        <div className="bg-white border border-red-200 rounded-xl p-4 shadow-xs">
                            <p className="text-xs font-medium text-gray-900 mb-2">Cancellation reason (optional)</p>
                            <textarea
                                value={reason}
                                onChange={(e) => setReason(e.target.value)}
                                placeholder="Let us know why..."
                                rows={2}
                                className="w-full bg-white border border-gray-300 rounded-lg p-2 text-xs text-gray-900 outline-none focus:border-red-500 mb-2 resize-none"
                            />
                            <div className="flex gap-2">
                                <button
                                    onClick={handleCancel}
                                    disabled={cancelling}
                                    className="flex-1 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-medium disabled:opacity-50 cursor-pointer"
                                >
                                    {cancelling ? "Cancelling…" : "Confirm"}
                                </button>
                                <button
                                    onClick={() => setShowCancel(false)}
                                    className="px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 text-xs cursor-pointer"
                                >
                                    Keep
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {isChatOpen && shipment && shipment.driver_id && (
                <ChatBox
                    shipmentId={shipment._id}
                    userMode="customer"
                    userId={user?._id}
                    token={token}
                    recipientName={shipment.driver_id.name}
                    onClose={() => setIsChatOpen(false)}
                />
            )}
        </div>
    );
}
