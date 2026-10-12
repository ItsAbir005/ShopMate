"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, CheckCircle, XCircle, Truck, Car, Bike, Inbox, Check } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

interface DriverMeta {
    name: string;
    email: string;
    phone: string;
    vehicleType: string;
    vehicleNumber: string;
    licenseNumber: string;
}

interface Notification {
    _id: string;
    type: string;
    message: string;
    isRead: boolean;
    relatedId: string;
    createdAt: string;
    metadata?: DriverMeta;
}

export default function NotificationsPage() {
    const router = useRouter();
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [loading, setLoading] = useState(true);
    const [approving, setApproving] = useState<string | null>(null);
    const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);

    const showToast = (type: "success" | "error", msg: string) => {
        setToast({ type, msg });
        setTimeout(() => setToast(null), 3500);
    };

    const fetchNotifications = async () => {
        const token = localStorage.getItem("adminToken");
        if (!token) return router.push("/admin/login");

        try {
            const res = await fetch(`${API}/notifications`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setNotifications(data);
            }
        } catch (err) {
            console.error("Failed to fetch notifications", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchNotifications(); }, []);

    const handleApproveDriver = async (driverId: string) => {
        const token = localStorage.getItem("adminToken");
        if (!token) return;

        setApproving(driverId);
        try {
            const res = await fetch(`${API}/drivers/${driverId}/approve`, {
                method: "PUT",
                headers: { Authorization: `Bearer ${token}` }
            });
            const data = await res.json();

            if (res.ok) {
                showToast("success", "Driver approved successfully! They can now log in.");
                fetchNotifications();
            } else {
                showToast("error", data.message || "Approval failed. Please try again.");
            }
        } catch (err) {
            showToast("error", "Network error. Please try again.");
        } finally {
            setApproving(null);
        }
    };

    const handleMarkAllRead = async () => {
        const token = localStorage.getItem("adminToken");
        if (!token) return;

        try {
            const res = await fetch(`${API}/notifications/read-all`, {
                method: "PUT",
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) fetchNotifications();
        } catch (err) {
            console.error(err);
        }
    };

    const unreadCount = notifications.filter(n => !n.isRead).length;

    return (
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 bg-white min-h-screen">
            {/* Toast */}
            {toast && (
                <div className={`fixed top-20 right-6 z-50 px-5 py-3 rounded-xl text-sm font-semibold shadow-lg ${
                    toast.type === "error" ? "bg-red-600 text-white" : "bg-emerald-600 text-white"
                }`}>
                    {toast.msg}
                </div>
            )}

            {/* Header */}
            <div className="flex justify-between items-center mb-8">
                <div>
                    <div className="flex items-center gap-2">
                        <Bell className="w-7 h-7 text-indigo-600" />
                        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
                            Notifications
                        </h1>
                        {unreadCount > 0 && (
                            <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                                {unreadCount} new
                            </span>
                        )}
                    </div>
                    <p className="text-sm text-gray-600 mt-1">Review pending driver registrations and other alerts.</p>
                </div>
                {unreadCount > 0 && (
                    <button
                        onClick={handleMarkAllRead}
                        className="px-3.5 py-1.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 text-xs font-semibold transition-colors"
                    >
                        Mark All as Read
                    </button>
                )}
            </div>

            {loading ? (
                <div className="py-16 text-gray-500 text-center text-sm">Loading notifications...</div>
            ) : notifications.length === 0 ? (
                <div className="py-16 text-center bg-white border border-gray-200 rounded-2xl max-w-md mx-auto">
                    <Inbox className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                    <p className="font-bold text-gray-900 text-base">You're all caught up!</p>
                    <p className="text-xs text-gray-500 mt-1">No notifications at this time.</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {notifications.map(notif => {
                        const meta = notif.metadata as DriverMeta | undefined;
                        const isDriverNotif = notif.type === "DRIVER_REGISTRATION";

                        return (
                            <div
                                key={notif._id}
                                className={`rounded-xl p-5 border transition-all ${
                                    notif.isRead
                                        ? "bg-white border-gray-200"
                                        : "bg-indigo-50/40 border-indigo-200"
                                }`}
                            >
                                {/* Top row */}
                                <div className="flex justify-between items-center mb-3">
                                    <div className="flex items-center gap-2">
                                        {!notif.isRead && <div className="w-2 h-2 rounded-full bg-red-500" />}
                                        {isDriverNotif && (
                                            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-700">
                                                Driver Registration
                                            </span>
                                        )}
                                    </div>
                                    <span className="text-xs text-gray-500">
                                        {new Date(notif.createdAt).toLocaleString("en-US")}
                                    </span>
                                </div>

                                {/* Driver details */}
                                {isDriverNotif && meta ? (
                                    <div className="space-y-3">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-full bg-indigo-600 text-white font-bold text-sm flex items-center justify-center flex-shrink-0">
                                                {meta.name?.[0]?.toUpperCase() || "D"}
                                            </div>
                                            <div>
                                                <p className="font-bold text-gray-900 text-sm">{meta.name}</p>
                                                <p className="text-xs text-gray-500">{meta.email} · {meta.phone}</p>
                                            </div>
                                        </div>
                                        {/* Vehicle info */}
                                        <div className="flex gap-2 flex-wrap text-xs">
                                            <span className="px-2.5 py-1 bg-gray-100 border border-gray-200 rounded-md font-medium text-gray-700">
                                                {meta.vehicleType?.toUpperCase()}
                                            </span>
                                            <span className="px-2.5 py-1 bg-gray-100 border border-gray-200 rounded-md font-mono text-gray-700">
                                                {meta.vehicleNumber}
                                            </span>
                                            <span className="px-2.5 py-1 bg-gray-100 border border-gray-200 rounded-md text-gray-600">
                                                Lic: {meta.licenseNumber}
                                            </span>
                                        </div>
                                    </div>
                                ) : (
                                    <p className="text-sm text-gray-800">{notif.message}</p>
                                )}

                                {/* Action */}
                                {isDriverNotif && !notif.isRead && (
                                    <div className="mt-4 flex justify-end">
                                        <button
                                            onClick={() => handleApproveDriver(notif.relatedId)}
                                            disabled={approving === notif.relatedId}
                                            className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs transition-colors disabled:opacity-50"
                                        >
                                            {approving === notif.relatedId ? "Approving..." : "Approve Driver"}
                                        </button>
                                    </div>
                                )}

                                {isDriverNotif && notif.isRead && (
                                    <p className="mt-3 text-xs text-emerald-600 font-semibold flex items-center gap-1">
                                        <Check className="w-3.5 h-3.5" /> Approved
                                    </p>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
