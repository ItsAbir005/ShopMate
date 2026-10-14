"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
    ClipboardList,
    ShieldCheck,
    AlertTriangle,
    AlertOctagon,
    Clock,
    Search,
    Filter,
    ChevronDown,
    ChevronUp,
    ExternalLink,
    RefreshCw,
    CheckCircle2,
    XCircle,
    Truck,
    Package,
    DollarSign,
    User,
    Calendar,
    MapPin,
    Eye
} from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

interface OrderItem {
    _id?: string;
    product_id?: string;
    title: string;
    price: number;
    quantity: number;
    image?: string;
}

interface OrderAiRisk {
    decision: "approve" | "review" | "flag";
    reason: string;
    checkedAt?: string;
    signals?: {
        orderTotal: number;
        accountAgeDays: number;
        ordersInLastHour: number;
        addressChanges: number;
    };
}

interface Order {
    _id: string;
    user_id?: {
        _id: string;
        name: string;
        email: string;
    };
    total_amount: number;
    subtotal: number;
    shipping_cost?: number;
    status: string;
    payment_status: string;
    paymentProvider?: string;
    shipping_address?: {
        street: string;
        city: string;
        state: string;
        zip: string;
        country: string;
    };
    order_items: OrderItem[];
    aiRisk?: OrderAiRisk;
    createdAt: string;
}

export default function AdminOrdersPage() {
    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [page, setPage] = useState(1);
    const [totalPages, setPages] = useState(1);
    const [totalOrders, setTotalOrders] = useState(0);

    // Filters
    const [riskFilter, setRiskFilter] = useState<string>("all");
    const [statusFilter, setStatusFilter] = useState<string>("all");
    const [searchQuery, setSearchQuery] = useState<string>("");

    // Details Modal / Selected Order
    const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
    const [statusUpdating, setStatusUpdating] = useState<string | null>(null);

    const fetchOrders = async () => {
        setLoading(true);
        setError(null);
        const token = localStorage.getItem("adminToken");
        if (!token) {
            setError("Admin authorization required. Please log in.");
            setLoading(false);
            return;
        }

        try {
            const params = new URLSearchParams();
            params.append("page", page.toString());
            params.append("limit", "15");
            if (riskFilter !== "all") params.append("aiRisk", riskFilter);
            if (statusFilter !== "all") params.append("status", statusFilter);

            const res = await fetch(`${API}/orders?${params.toString()}`, {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.message || `Failed to fetch orders (${res.status})`);
            }

            const data = await res.json();
            setOrders(data.orders || []);
            setPages(data.pages || 1);
            setTotalOrders(data.total || 0);
        } catch (err: any) {
            setError(err.message || "Failed to load orders");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchOrders();
    }, [page, riskFilter, statusFilter]);

    const handleUpdateStatus = async (orderId: string, newStatus: string) => {
        const token = localStorage.getItem("adminToken");
        if (!token) return;
        setStatusUpdating(orderId);
        try {
            const res = await fetch(`${API}/orders/${orderId}/status`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ status: newStatus })
            });

            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                alert(errData.message || "Failed to update status");
                return;
            }

            const updated = await res.json();
            setOrders(prev => prev.map(o => (o._id === orderId ? { ...o, status: updated.order?.status || newStatus } : o)));
            if (selectedOrder && selectedOrder._id === orderId) {
                setSelectedOrder(prev => prev ? { ...prev, status: updated.order?.status || newStatus } : null);
            }
        } catch (err: any) {
            alert(err.message || "Status update failed");
        } finally {
            setStatusUpdating(null);
        }
    };

    // Filter by client search query
    const filteredOrders = orders.filter(o => {
        if (!searchQuery) return true;
        const q = searchQuery.toLowerCase();
        const idMatch = o._id.toLowerCase().includes(q);
        const nameMatch = o.user_id?.name?.toLowerCase().includes(q);
        const emailMatch = o.user_id?.email?.toLowerCase().includes(q);
        return idMatch || nameMatch || emailMatch;
    });

    const getRiskBadge = (risk?: OrderAiRisk) => {
        if (!risk) {
            return (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700 border border-gray-200">
                    <Clock className="w-3 h-3 text-gray-500" />
                    <span>Unchecked</span>
                </span>
            );
        }

        switch (risk.decision) {
            case "approve":
                return (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Approved</span>
                    </span>
                );
            case "review":
                return (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-300">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                        <span>Review</span>
                    </span>
                );
            case "flag":
                return (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-300">
                        <AlertOctagon className="w-3.5 h-3.5 text-rose-600" />
                        <span>Flagged</span>
                    </span>
                );
            default:
                return null;
        }
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case "paid":
                return <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">Paid</span>;
            case "shipped":
                return <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-sky-50 text-sky-700 border border-sky-200">Shipped</span>;
            case "delivered":
                return <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">Delivered</span>;
            case "cancelled":
                return <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-rose-50 text-rose-700 border border-rose-200">Cancelled</span>;
            default:
                return <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-amber-50 text-amber-700 border border-amber-200">{status}</span>;
        }
    };

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 bg-white min-h-screen">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6 pb-6 border-b border-gray-200">
                <div>
                    <div className="flex items-center gap-2">
                        <ClipboardList className="w-7 h-7 text-indigo-600" />
                        <h1 className="text-2xl font-bold text-gray-900">Orders & AI Risk Monitor</h1>
                    </div>
                    <p className="text-sm text-gray-500 mt-1">
                        Review customer orders with real-time AI fraud detection powered by Google Gemini.
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={fetchOrders}
                        disabled={loading}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                        <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-indigo-600" : ""}`} />
                        <span>Refresh</span>
                    </button>
                    <Link
                        href="/admin/copilot"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
                    >
                        <span>Open AI Copilot</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                    </Link>
                </div>
            </div>

            {/* Quick Filter Counts */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                <button
                    onClick={() => { setRiskFilter("all"); setPage(1); }}
                    className={`p-3 rounded-xl border text-left transition-all ${
                        riskFilter === "all" ? "border-indigo-600 bg-indigo-50/40" : "border-gray-200 bg-white hover:border-gray-300"
                    }`}
                >
                    <p className="text-xs text-gray-500 font-medium">Total Orders</p>
                    <p className="text-xl font-bold text-gray-900 mt-0.5">{totalOrders}</p>
                </button>
                <button
                    onClick={() => { setRiskFilter("approve"); setPage(1); }}
                    className={`p-3 rounded-xl border text-left transition-all ${
                        riskFilter === "approve" ? "border-emerald-600 bg-emerald-50/40" : "border-gray-200 bg-white hover:border-gray-300"
                    }`}
                >
                    <div className="flex items-center justify-between">
                        <p className="text-xs text-emerald-700 font-medium">Approved</p>
                        <ShieldCheck className="w-4 h-4 text-emerald-600" />
                    </div>
                    <p className="text-xl font-bold text-gray-900 mt-0.5">Low Risk</p>
                </button>
                <button
                    onClick={() => { setRiskFilter("review"); setPage(1); }}
                    className={`p-3 rounded-xl border text-left transition-all ${
                        riskFilter === "review" ? "border-amber-500 bg-amber-50/40" : "border-gray-200 bg-white hover:border-gray-300"
                    }`}
                >
                    <div className="flex items-center justify-between">
                        <p className="text-xs text-amber-700 font-medium">Needs Review</p>
                        <AlertTriangle className="w-4 h-4 text-amber-600" />
                    </div>
                    <p className="text-xl font-bold text-gray-900 mt-0.5">Medium Risk</p>
                </button>
                <button
                    onClick={() => { setRiskFilter("flag"); setPage(1); }}
                    className={`p-3 rounded-xl border text-left transition-all ${
                        riskFilter === "flag" ? "border-rose-600 bg-rose-50/40" : "border-gray-200 bg-white hover:border-gray-300"
                    }`}
                >
                    <div className="flex items-center justify-between">
                        <p className="text-xs text-rose-700 font-medium">Flagged</p>
                        <AlertOctagon className="w-4 h-4 text-rose-600" />
                    </div>
                    <p className="text-xl font-bold text-gray-900 mt-0.5">High Risk</p>
                </button>
            </div>

            {/* Filter controls */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mb-6 bg-gray-50/70 p-3 rounded-xl border border-gray-200">
                <div className="flex items-center gap-2 flex-1">
                    <div className="relative flex-1 max-w-sm">
                        <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
                        <input
                            type="text"
                            placeholder="Search by order ID, customer name or email..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-gray-200 rounded-lg outline-none focus:border-indigo-600 text-gray-900 placeholder:text-gray-400"
                        />
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5">
                        <span className="text-xs text-gray-500 font-medium">Risk:</span>
                        <select
                            value={riskFilter}
                            onChange={(e) => { setRiskFilter(e.target.value); setPage(1); }}
                            className="text-xs bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 text-gray-900 outline-none focus:border-indigo-600"
                        >
                            <option value="all">All Decisions</option>
                            <option value="approve">Approve (Low Risk)</option>
                            <option value="review">Review (Needs Attention)</option>
                            <option value="flag">Flag (High Risk)</option>
                        </select>
                    </div>

                    <div className="flex items-center gap-1.5">
                        <span className="text-xs text-gray-500 font-medium">Status:</span>
                        <select
                            value={statusFilter}
                            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
                            className="text-xs bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 text-gray-900 outline-none focus:border-indigo-600"
                        >
                            <option value="all">All Statuses</option>
                            <option value="pending">Pending</option>
                            <option value="paid">Paid</option>
                            <option value="shipped">Shipped</option>
                            <option value="delivered">Delivered</option>
                            <option value="cancelled">Cancelled</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* Error banner */}
            {error && (
                <div className="mb-6 p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs">
                    {error}
                </div>
            )}

            {/* Table */}
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                        <thead className="bg-gray-50 border-b border-gray-200 text-gray-600 font-semibold uppercase tracking-wider text-[11px]">
                            <tr>
                                <th className="px-4 py-3">Order</th>
                                <th className="px-4 py-3">Customer</th>
                                <th className="px-4 py-3">Total</th>
                                <th className="px-4 py-3">Status</th>
                                <th className="px-4 py-3">Payment</th>
                                <th className="px-4 py-3">AI Risk Decision</th>
                                <th className="px-4 py-3 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {loading ? (
                                Array.from({ length: 5 }).map((_, i) => (
                                    <tr key={i} className="animate-pulse">
                                        <td className="px-4 py-3.5"><div className="h-4 bg-gray-200 rounded w-24"></div></td>
                                        <td className="px-4 py-3.5"><div className="h-4 bg-gray-200 rounded w-32"></div></td>
                                        <td className="px-4 py-3.5"><div className="h-4 bg-gray-200 rounded w-16"></div></td>
                                        <td className="px-4 py-3.5"><div className="h-4 bg-gray-200 rounded w-20"></div></td>
                                        <td className="px-4 py-3.5"><div className="h-4 bg-gray-200 rounded w-16"></div></td>
                                        <td className="px-4 py-3.5"><div className="h-4 bg-gray-200 rounded w-28"></div></td>
                                        <td className="px-4 py-3.5"><div className="h-4 bg-gray-200 rounded w-16 ml-auto"></div></td>
                                    </tr>
                                ))
                            ) : filteredOrders.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="px-4 py-12 text-center text-gray-500">
                                        <ClipboardList className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                                        <p className="font-medium text-gray-700">No orders match the selected filters</p>
                                        <p className="text-xs text-gray-400 mt-1">Try resetting the risk or status filter</p>
                                    </td>
                                </tr>
                            ) : (
                                filteredOrders.map((order) => (
                                    <tr
                                        key={order._id}
                                        className="hover:bg-gray-50/70 transition-colors cursor-pointer"
                                        onClick={() => setSelectedOrder(order)}
                                    >
                                        <td className="px-4 py-3.5">
                                            <div className="font-mono font-semibold text-gray-900">
                                                #{order._id.slice(-8).toUpperCase()}
                                            </div>
                                            <div className="text-[11px] text-gray-400 flex items-center gap-1 mt-0.5">
                                                <Calendar className="w-3 h-3" />
                                                <span>{new Date(order.createdAt).toLocaleDateString()}</span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3.5">
                                            <div className="font-medium text-gray-900">
                                                {order.user_id?.name || "Guest Customer"}
                                            </div>
                                            <div className="text-[11px] text-gray-500 truncate max-w-[180px]">
                                                {order.user_id?.email || "—"}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3.5 font-bold text-gray-900">
                                            ${(order.total_amount || 0).toFixed(2)}
                                        </td>
                                        <td className="px-4 py-3.5">
                                            {getStatusBadge(order.status)}
                                        </td>
                                        <td className="px-4 py-3.5">
                                            <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                                                order.payment_status === "paid" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-gray-100 text-gray-700 border border-gray-200"
                                            }`}>
                                                {order.payment_status}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3.5">
                                            <div className="flex flex-col items-start gap-1">
                                                {getRiskBadge(order.aiRisk)}
                                                {order.aiRisk?.reason && (
                                                    <p className="text-[11px] text-gray-500 truncate max-w-[220px]" title={order.aiRisk.reason}>
                                                        {order.aiRisk.reason}
                                                    </p>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3.5 text-right" onClick={(e) => e.stopPropagation()}>
                                            <div className="flex items-center justify-end gap-2">
                                                <button
                                                    onClick={() => setSelectedOrder(order)}
                                                    className="p-1.5 text-gray-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                                                    title="View Risk Details"
                                                >
                                                    <Eye className="w-4 h-4" />
                                                </button>
                                                <Link
                                                    href={`/orders/${order._id}`}
                                                    target="_blank"
                                                    className="p-1.5 text-gray-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                                                    title="Open Order Details"
                                                >
                                                    <ExternalLink className="w-4 h-4" />
                                                </Link>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                    <div className="flex items-center justify-between px-4 py-3 bg-white border-t border-gray-200 text-xs text-gray-600">
                        <span>Page {page} of {totalPages} ({totalOrders} total)</span>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setPage(p => Math.max(1, p - 1))}
                                disabled={page <= 1 || loading}
                                className="px-3 py-1 rounded border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                Previous
                            </button>
                            <button
                                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                disabled={page >= totalPages || loading}
                                className="px-3 py-1 rounded border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                Next
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Modal: AI Risk & Order Details */}
            {selectedOrder && (
                <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
                    <div className="bg-white border border-gray-200 rounded-2xl max-w-2xl w-full p-6 shadow-2xl overflow-y-auto max-h-[90vh]">
                        {/* Modal Header */}
                        <div className="flex items-center justify-between pb-4 border-b border-gray-200">
                            <div>
                                <div className="flex items-center gap-2">
                                    <h2 className="text-lg font-bold text-gray-900">
                                        Order #{selectedOrder._id.slice(-8).toUpperCase()}
                                    </h2>
                                    {getRiskBadge(selectedOrder.aiRisk)}
                                </div>
                                <p className="text-xs text-gray-500 mt-0.5">
                                    Placed on {new Date(selectedOrder.createdAt).toLocaleString()} · PayPal Sandbox
                                </p>
                            </div>
                            <button
                                onClick={() => setSelectedOrder(null)}
                                className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                            >
                                <XCircle className="w-5 h-5" />
                            </button>
                        </div>

                        {/* AI Risk Assessment Card */}
                        <div className="mt-5 p-4 rounded-xl border border-indigo-100 bg-indigo-50/40">
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-1.5">
                                    <ShieldCheck className="w-4 h-4 text-indigo-600" />
                                    <span className="text-xs font-bold text-gray-900">Gemini Fraud & Risk Assessment</span>
                                </div>
                                <span className="text-[11px] text-gray-500 font-mono">
                                    {selectedOrder.aiRisk?.checkedAt ? new Date(selectedOrder.aiRisk.checkedAt).toLocaleTimeString() : "Evaluated at checkout"}
                                </span>
                            </div>
                            <p className="text-xs text-gray-700 leading-relaxed bg-white p-3 rounded-lg border border-indigo-100">
                                <strong className="font-semibold text-gray-900">Reason: </strong>
                                {selectedOrder.aiRisk?.reason || "No risk analysis record found for this order."}
                            </p>

                            {/* Evaluated Signals Grid */}
                            {selectedOrder.aiRisk?.signals && (
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
                                    <div className="bg-white p-2.5 rounded-lg border border-indigo-100 text-center">
                                        <p className="text-[10px] text-gray-500 font-semibold uppercase">Order Total</p>
                                        <p className="text-sm font-bold text-gray-900 mt-0.5">
                                            ${selectedOrder.aiRisk.signals.orderTotal?.toFixed(2)}
                                        </p>
                                    </div>
                                    <div className="bg-white p-2.5 rounded-lg border border-indigo-100 text-center">
                                        <p className="text-[10px] text-gray-500 font-semibold uppercase">Account Age</p>
                                        <p className="text-sm font-bold text-gray-900 mt-0.5">
                                            {selectedOrder.aiRisk.signals.accountAgeDays} days
                                        </p>
                                    </div>
                                    <div className="bg-white p-2.5 rounded-lg border border-indigo-100 text-center">
                                        <p className="text-[10px] text-gray-500 font-semibold uppercase">Orders Last 1h</p>
                                        <p className="text-sm font-bold text-gray-900 mt-0.5">
                                            {selectedOrder.aiRisk.signals.ordersInLastHour}
                                        </p>
                                    </div>
                                    <div className="bg-white p-2.5 rounded-lg border border-indigo-100 text-center">
                                        <p className="text-[10px] text-gray-500 font-semibold uppercase">Address Changes</p>
                                        <p className="text-sm font-bold text-gray-900 mt-0.5">
                                            {selectedOrder.aiRisk.signals.addressChanges}
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Customer & Shipping Details */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-5 text-xs">
                            <div className="p-3.5 bg-gray-50 rounded-xl border border-gray-200">
                                <div className="flex items-center gap-1.5 font-semibold text-gray-900 mb-2">
                                    <User className="w-3.5 h-3.5 text-indigo-600" />
                                    <span>Customer Info</span>
                                </div>
                                <p className="text-gray-800 font-medium">{selectedOrder.user_id?.name || "Guest"}</p>
                                <p className="text-gray-500">{selectedOrder.user_id?.email || "No email"}</p>
                                <div className="mt-2 pt-2 border-t border-gray-200 flex items-center justify-between">
                                    <span className="text-gray-500">Status:</span>
                                    {getStatusBadge(selectedOrder.status)}
                                </div>
                            </div>

                            <div className="p-3.5 bg-gray-50 rounded-xl border border-gray-200">
                                <div className="flex items-center gap-1.5 font-semibold text-gray-900 mb-2">
                                    <MapPin className="w-3.5 h-3.5 text-indigo-600" />
                                    <span>Shipping Destination</span>
                                </div>
                                {selectedOrder.shipping_address ? (
                                    <div className="text-gray-700">
                                        <p>{selectedOrder.shipping_address.street}</p>
                                        <p>{selectedOrder.shipping_address.city}, {selectedOrder.shipping_address.state} {selectedOrder.shipping_address.zip}</p>
                                        <p>{selectedOrder.shipping_address.country}</p>
                                    </div>
                                ) : (
                                    <p className="text-gray-500">Standard delivery address</p>
                                )}
                            </div>
                        </div>

                        {/* Order Items */}
                        <div className="mt-5">
                            <h3 className="text-xs font-semibold text-gray-900 uppercase tracking-wider mb-2">
                                Purchased Items ({selectedOrder.order_items?.length || 0})
                            </h3>
                            <div className="divide-y divide-gray-100 border border-gray-200 rounded-xl overflow-hidden text-xs">
                                {selectedOrder.order_items?.map((item, idx) => (
                                    <div key={idx} className="flex items-center justify-between p-3 bg-white">
                                        <div className="flex items-center gap-2.5">
                                            <Package className="w-4 h-4 text-gray-400" />
                                            <div>
                                                <p className="font-medium text-gray-900">{item.title}</p>
                                                <p className="text-[11px] text-gray-500">Qty: {item.quantity}</p>
                                            </div>
                                        </div>
                                        <div className="text-right font-bold text-gray-900">
                                            ${((item.price || 0) * (item.quantity || 1)).toFixed(2)}
                                        </div>
                                    </div>
                                ))}
                                <div className="p-3 bg-gray-50 flex items-center justify-between font-bold text-gray-900">
                                    <span>Total Amount</span>
                                    <span>${(selectedOrder.total_amount || 0).toFixed(2)}</span>
                                </div>
                            </div>
                        </div>

                        {/* Admin Action: Update status */}
                        <div className="mt-6 pt-4 border-t border-gray-200 flex flex-col sm:flex-row items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                                <span className="text-xs text-gray-500 font-medium">Update Status:</span>
                                <select
                                    disabled={statusUpdating === selectedOrder._id}
                                    value={selectedOrder.status}
                                    onChange={(e) => handleUpdateStatus(selectedOrder._id, e.target.value)}
                                    className="text-xs bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 text-gray-900 outline-none focus:border-indigo-600 disabled:opacity-50"
                                >
                                    <option value="pending">Pending</option>
                                    <option value="paid">Paid</option>
                                    <option value="shipped">Shipped</option>
                                    <option value="delivered">Delivered</option>
                                    <option value="cancelled">Cancelled</option>
                                </select>
                                {statusUpdating === selectedOrder._id && (
                                    <span className="text-xs text-indigo-600">Updating...</span>
                                )}
                            </div>

                            <div className="flex items-center gap-2">
                                <Link
                                    href={`/orders/${selectedOrder._id}`}
                                    target="_blank"
                                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-indigo-600 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 transition-colors"
                                >
                                    <span>Full Customer View</span>
                                    <ExternalLink className="w-3.5 h-3.5" />
                                </Link>
                                <button
                                    onClick={() => setSelectedOrder(null)}
                                    className="px-3.5 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                                >
                                    Close
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
