"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "../context/AuthContext";
import { fetchApi } from "../lib/api";
import { useToast } from "../components/Toast";
import { Package, Clock, CreditCard, Truck, CheckCircle2, XCircle, RotateCcw, ClipboardList } from "lucide-react";

type Order = {
    _id: string;
    status: string;
    payment_status: string;
    paymentProvider?: string;
    total_amount: number;
    subtotal: number;
    order_items: { title: string; quantity: number; image?: string }[];
    createdAt: string;
};

const STATUS_BADGE: Record<string, string> = {
    pending: "bg-amber-50 text-amber-700 border-amber-200",
    confirmed: "bg-indigo-50 text-indigo-700 border-indigo-200",
    paid: "bg-indigo-50 text-indigo-700 border-indigo-200",
    shipped: "bg-sky-50 text-sky-700 border-sky-200",
    delivered: "bg-emerald-50 text-emerald-700 border-emerald-200",
    cancelled: "bg-rose-50 text-rose-700 border-rose-200",
    returned: "bg-gray-100 text-gray-700 border-gray-200",
};

export default function OrdersContent() {
    const { user, loading: authLoading } = useAuth();
    const router = useRouter();
    const { toast } = useToast();
    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [statusFilter, setStatusFilter] = useState("");

    useEffect(() => {
        if (!authLoading && !user) router.push("/login");
    }, [user, authLoading, router]);

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        if (params.get("payment") === "success") {
            toast("success", "Payment Successful!", "Your order is confirmed and notification emails have been sent.");
        }
    }, [toast]);

    useEffect(() => {
        if (!user) return;
        const load = async () => {
            setLoading(true);
            try {
                const params = new URLSearchParams({ page: String(page), limit: "8" });
                if (statusFilter) params.set("status", statusFilter);
                const data = await fetchApi(`/orders/my?${params}`);
                setOrders(data.orders || []);
                setTotalPages(data.pages || 1);
            } catch {
                setOrders([]);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [user, page, statusFilter]);

    const statuses = ["", "pending", "paid", "shipped", "delivered", "cancelled", "returned"];

    return (
        <div className="container-custom py-12 min-h-[80vh] bg-white">
            <div className="flex items-center justify-between mb-8 flex-wrap gap-4 pb-4 border-b border-gray-100">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">My Orders</h1>
                    <p className="text-xs text-gray-500 mt-0.5">Track and manage your order history</p>
                </div>
                <Link href="/products" className="btn btn-primary text-xs px-4 py-2">
                    Shop More
                </Link>
            </div>

            {/* Status filter */}
            <div className="flex gap-2 flex-wrap mb-8">
                {statuses.map((s) => (
                    <button
                        key={s}
                        onClick={() => { setStatusFilter(s); setPage(1); }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer capitalize ${
                            statusFilter === s
                                ? "bg-indigo-600 border-indigo-600 text-white"
                                : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                        }`}
                    >
                        {s ? s : "All Orders"}
                    </button>
                ))}
            </div>

            {loading ? (
                <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                        <div key={i} className="bg-white border border-gray-200 rounded-xl p-5 animate-pulse flex gap-4">
                            <div className="w-14 h-14 bg-gray-100 rounded-lg shrink-0" />
                            <div className="flex-1 space-y-2.5">
                                <div className="h-4 bg-gray-100 rounded w-1/4" />
                                <div className="h-3 bg-gray-100 rounded w-1/2" />
                            </div>
                        </div>
                    ))}
                </div>
            ) : orders.length === 0 ? (
                <div className="text-center py-20 bg-white border border-gray-200 rounded-xl p-8">
                    <ClipboardList className="w-12 h-12 text-gray-300 stroke-1 mx-auto mb-3" />
                    <h2 className="text-base font-bold text-gray-900 mb-1">No orders found</h2>
                    <p className="text-xs text-gray-500 mb-5">
                        {statusFilter ? `No "${statusFilter}" orders found.` : "You haven't placed any orders yet."}
                    </p>
                    <Link href="/products" className="btn btn-primary text-xs px-4 py-2">
                        Start Shopping
                    </Link>
                </div>
            ) : (
                <div className="space-y-3">
                    {orders.map((order) => (
                        <Link href={`/orders/${order._id}`} key={order._id} className="block group">
                            <div className="bg-white border border-gray-200 rounded-xl p-4 sm:p-5 hover:border-gray-300 hover:shadow-xs transition-all">
                                <div className="flex items-start gap-4 flex-wrap">
                                    <div className="flex -space-x-2 shrink-0">
                                        {order.order_items.slice(0, 3).map((item, i) => (
                                            <div key={i} className="w-12 h-12 rounded-lg border border-gray-200 overflow-hidden bg-gray-50">
                                                {item.image ? (
                                                    <img src={item.image} alt={item.title} className="w-full h-full object-cover" />
                                                ) : (
                                                    <div className="flex items-center justify-center h-full text-gray-300">
                                                        <Package className="w-4 h-4" />
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                        {order.order_items.length > 3 && (
                                            <div className="w-12 h-12 rounded-lg border border-gray-200 bg-gray-100 flex items-center justify-center text-[10px] text-gray-600 font-medium">
                                                +{order.order_items.length - 3}
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2.5 flex-wrap mb-1">
                                            <span className="font-mono text-xs text-gray-500 font-medium">
                                                #{order._id.slice(-8).toUpperCase()}
                                            </span>
                                            <span className={`text-[11px] px-2 py-0.5 rounded-full border font-semibold ${STATUS_BADGE[order.status] || "bg-gray-100 text-gray-700 border-gray-200"}`}>
                                                {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                                            </span>
                                            {order.paymentProvider && (
                                                <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${
                                                    order.paymentProvider === 'paypal'
                                                        ? 'bg-blue-50 text-blue-700 border-blue-200'
                                                        : 'bg-indigo-50 text-indigo-700 border-indigo-200'
                                                }`}>
                                                    {order.paymentProvider === 'paypal' ? 'PayPal' : 'Stripe'}
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-xs text-gray-700 line-clamp-1">
                                            {order.order_items.map((i) => i.title).join(", ")}
                                        </p>
                                        <p className="text-[11px] text-gray-400 mt-1">
                                            {new Date(order.createdAt).toLocaleDateString("en-IN", {
                                                day: "numeric",
                                                month: "short",
                                                year: "numeric",
                                            })}
                                        </p>
                                    </div>

                                    <div className="text-right shrink-0">
                                        <p className="text-base font-bold text-gray-900">${order.total_amount.toFixed(2)}</p>
                                        <p className="text-[11px] text-gray-500 mt-0.5">
                                            {order.order_items.reduce((s, i) => s + i.quantity, 0)} items
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </Link>
                    ))}
                </div>
            )}

            {totalPages > 1 && (
                <div className="flex justify-center items-center gap-2 mt-8">
                    <button
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={page === 1}
                        className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-30 text-xs cursor-pointer"
                    >
                        Previous
                    </button>
                    <span className="text-xs text-gray-500 px-2">Page {page} of {totalPages}</span>
                    <button
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                        disabled={page === totalPages}
                        className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-30 text-xs cursor-pointer"
                    >
                        Next
                    </button>
                </div>
            )}
        </div>
    );
}
