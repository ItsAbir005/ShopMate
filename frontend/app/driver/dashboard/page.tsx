"use client";

import { useEffect, useState, useRef } from "react";
import { useDriver } from "../../context/DriverContext";
import Link from "next/link";
import { Activity, Truck, Package, Bell, MapPin, Check, X, ArrowRight, Clock } from "lucide-react";

interface ActiveDelivery {
    _id: string;
    trackingCode: string;
    status: string;
    deliveryAddress: { street: string; city: string; state: string; zip: string; country: string };
    estimatedDelivery?: string;
    order_id?: { _id: string };
}

interface PendingRequest {
    shipmentId: string;
    trackingCode: string;
    deliveryAddress: { street: string; city: string; state: string; zip: string };
    otp?: string;
}

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

export default function DriverDashboard() {
    const { driver, fetchWithAuth, token, loading: ctxLoading, setOnlineStatus } = useDriver();
    const [activeDelivery, setActiveDelivery] = useState<ActiveDelivery | null>(null);
    const [loadingDelivery, setLoadingDelivery] = useState(true);
    const [pendingRequest, setPendingRequest] = useState<PendingRequest | null>(null);
    const [responding, setResponding] = useState(false);
    const [togglingStatus, setTogglingStatus] = useState(false);
    const locationWatchRef = useRef<number | null>(null);

    const handleToggleStatus = async () => {
        if (!driver || togglingStatus) return;
        setTogglingStatus(true);
        try {
            const currentlyOnline = driver.status === "online" || driver.status === "busy";
            if (currentlyOnline) {
                await setOnlineStatus("offline");
            } else {
                let lat = 22.5726;
                let lng = 88.3639;
                if (typeof window !== "undefined" && "geolocation" in navigator) {
                    try {
                        const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
                            navigator.geolocation.getCurrentPosition(resolve, reject, {
                                timeout: 5000,
                                enableHighAccuracy: true,
                            });
                        });
                        lat = pos.coords.latitude;
                        lng = pos.coords.longitude;
                    } catch (geoErr) {
                        console.warn("[Driver] Geolocation prompt/timeout, using fallback:", geoErr);
                    }
                }
                await setOnlineStatus("online", lat, lng);
            }
        } catch (err: any) {
            console.error("[Driver] Error toggling status:", err);
            alert(`Failed to update status: ${err.message || "Server error"}`);
        } finally {
            setTogglingStatus(false);
        }
    };

    const loadActiveDelivery = async () => {
        try {
            const data = await fetchWithAuth("/drivers/delivery/active");
            setActiveDelivery(data);
        } catch {
            setActiveDelivery(null);
        } finally {
            setLoadingDelivery(false);
        }
    };

    useEffect(() => {
        if (driver) {
            loadActiveDelivery();
        } else if (!ctxLoading) {
            setLoadingDelivery(false);
        }
    }, [driver, ctxLoading]);

    // Listen for real-time delivery assigned via Socket.io
    useEffect(() => {
        const handler = (e: any) => {
            const data = (e as CustomEvent).detail || {};
            setPendingRequest({
                shipmentId: data.shipmentId,
                trackingCode: data.trackingCode,
                deliveryAddress: data.deliveryAddress,
            });
            loadActiveDelivery();
        };
        window.addEventListener("deliveryAssigned", handler as EventListener);
        return () => window.removeEventListener("deliveryAssigned", handler as EventListener);
    }, []);

    // Share live location when driver is online
    useEffect(() => {
        if (!token || !driver || (driver.status !== "online" && driver.status !== "busy")) return;

        const shareLocation = (lat: number, lng: number) => {
            fetch(`${API}/drivers/location`, {
                method: "PUT",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ lat, lng }),
            }).catch(() => { });
        };

        if ("geolocation" in navigator) {
            locationWatchRef.current = navigator.geolocation.watchPosition(
                pos => shareLocation(pos.coords.latitude, pos.coords.longitude),
                () => { },
                { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
            );
        }
        return () => {
            if (locationWatchRef.current !== null) {
                navigator.geolocation.clearWatch(locationWatchRef.current);
                locationWatchRef.current = null;
            }
        };
    }, [driver, token]);

    const handleAccept = async () => {
        if (!pendingRequest || !activeDelivery) return;
        setResponding(true);
        try {
            await fetch(`${API}/shipping/${pendingRequest.shipmentId}/accept`, {
                method: "POST",
                headers: { Authorization: `Bearer ${token}` },
            });
            setPendingRequest(null);
        } catch (err) {
            console.error("Accept failed", err);
        } finally {
            setResponding(false);
        }
    };

    const handleReject = async () => {
        if (!pendingRequest) return;
        setResponding(true);
        try {
            await fetch(`${API}/shipping/${pendingRequest.shipmentId}/reject`, {
                method: "POST",
                headers: { Authorization: `Bearer ${token}` },
            });
            setPendingRequest(null);
            setActiveDelivery(null);
        } catch (err) {
            console.error("Reject failed", err);
        } finally {
            setResponding(false);
        }
    };

    if (ctxLoading) {
        return (
            <div className="flex items-center justify-center min-h-[80vh] bg-white">
                <p className="text-gray-500 text-xs">Loading dashboard...</p>
            </div>
        );
    }

    const isOnline = driver?.status === "online" || driver?.status === "busy";

    return (
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 bg-white min-h-[85vh]">
            {/* Header */}
            <div className="mb-8 pb-4 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 mb-1">
                        Driver Dashboard
                    </h1>
                    <p className="text-xs text-gray-500">
                        Welcome back, {driver?.name}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <span
                        className={`text-xs px-3 py-1.5 rounded-full font-semibold border ${
                            isOnline
                                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                : "bg-gray-100 text-gray-600 border-gray-200"
                        }`}
                    >
                        {driver?.status?.toUpperCase() || "OFFLINE"}
                    </span>
                    <button
                        onClick={handleToggleStatus}
                        disabled={togglingStatus || driver?.status === "busy"}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors disabled:opacity-50 ${
                            isOnline
                                ? "bg-red-50 text-red-600 border border-red-200 hover:bg-red-100"
                                : "bg-indigo-600 text-white hover:bg-indigo-700"
                        }`}
                    >
                        {togglingStatus ? "Updating..." : isOnline ? "Go Offline" : "Go Online"}
                    </button>
                </div>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
                <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-xs">
                    <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-gray-500 font-semibold mb-2">
                        <Activity className="w-4 h-4 text-indigo-600" />
                        <span>Status</span>
                    </div>
                    <p className="text-lg font-bold text-gray-900 capitalize">{driver?.status || "Offline"}</p>
                </div>

                <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-xs">
                    <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-gray-500 font-semibold mb-2">
                        <Truck className="w-4 h-4 text-indigo-600" />
                        <span>Vehicle</span>
                    </div>
                    <p className="text-lg font-bold text-gray-900 truncate">
                        {driver?.vehicleType || "—"} · {driver?.vehicleNumber || "—"}
                    </p>
                </div>

                <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-xs">
                    <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-gray-500 font-semibold mb-2">
                        <Package className="w-4 h-4 text-indigo-600" />
                        <span>Active Delivery</span>
                    </div>
                    <p className="text-lg font-bold text-gray-900">
                        {activeDelivery ? "1 Delivery" : "None"}
                    </p>
                </div>
            </div>

            {/* ── Pickup Request Card ── */}
            {pendingRequest && (
                <div className="mb-8 bg-amber-50 border border-amber-300 rounded-xl p-5 shadow-xs">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center text-amber-700">
                            <Bell className="w-4 h-4" />
                        </div>
                        <div>
                            <p className="font-bold text-amber-900 text-sm">New Delivery Request</p>
                            <p className="font-mono text-xs text-amber-700">{pendingRequest.trackingCode}</p>
                        </div>
                    </div>
                    <div className="bg-white border border-amber-200 rounded-lg p-3.5 mb-4 text-xs text-gray-700">
                        <p className="font-semibold text-gray-900 mb-1 flex items-center gap-1.5">
                            <MapPin className="w-3.5 h-3.5 text-indigo-600" />
                            <span>Destination Address</span>
                        </p>
                        <p>
                            {pendingRequest.deliveryAddress?.street}<br />
                            {pendingRequest.deliveryAddress?.city}, {pendingRequest.deliveryAddress?.state} {pendingRequest.deliveryAddress?.zip}
                        </p>
                    </div>
                    <div className="flex gap-3">
                        <button
                            onClick={handleAccept}
                            disabled={responding}
                            className="flex-1 py-2 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                        >
                            <Check className="w-4 h-4" />
                            <span>{responding ? "Processing…" : "Accept Delivery"}</span>
                        </button>
                        <button
                            onClick={handleReject}
                            disabled={responding}
                            className="flex-1 py-2 px-4 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                        >
                            <X className="w-4 h-4" />
                            <span>{responding ? "Processing…" : "Decline"}</span>
                        </button>
                    </div>
                </div>
            )}

            {/* Active delivery card */}
            <h2 className="text-base font-bold text-gray-900 mb-4">Current Delivery</h2>
            {loadingDelivery ? (
                <div className="h-28 bg-gray-50 border border-gray-200 rounded-xl animate-pulse" />
            ) : activeDelivery ? (
                <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-xs">
                    <div className="flex justify-between items-start mb-4 pb-3 border-b border-gray-100 flex-wrap gap-2">
                        <div>
                            <p className="text-xs text-gray-500 uppercase tracking-wider mb-1 font-semibold">Tracking Code</p>
                            <div className="flex items-center gap-2">
                                <span className="font-mono text-base font-bold text-gray-900">{activeDelivery.trackingCode}</span>
                                {activeDelivery.order_id && (
                                    <span className="text-xs text-gray-500 font-mono bg-gray-100 px-2 py-0.5 rounded">
                                        Order #{activeDelivery.order_id._id.slice(-8).toUpperCase()}
                                    </span>
                                )}
                            </div>
                        </div>
                        <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 uppercase">
                            {activeDelivery.status.replace(/_/g, " ")}
                        </span>
                    </div>

                    <div className="space-y-1 text-xs text-gray-600 mb-5">
                        <p className="flex items-center gap-1.5 text-gray-900 font-medium">
                            <MapPin className="w-3.5 h-3.5 text-indigo-600" />
                            <span>{activeDelivery.deliveryAddress.street}, {activeDelivery.deliveryAddress.city}</span>
                        </p>
                        <p className="text-gray-500 pl-5">Sharing real-time location with recipient</p>
                    </div>

                    <Link
                        href={`/driver/delivery/${activeDelivery._id}`}
                        className="inline-flex items-center gap-1.5 py-2 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition-colors cursor-pointer"
                    >
                        <span>View & Update Delivery</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                </div>
            ) : (
                <div className="p-12 text-center bg-white border border-gray-200 rounded-xl">
                    <Clock className="w-10 h-10 text-gray-300 mx-auto mb-3 stroke-1" />
                    <p className="text-xs text-gray-500">
                        {isOnline ? "Waiting for a delivery to be dispatched..." : "Turn status to Online above to receive delivery requests"}
                    </p>
                </div>
            )}
        </div>
    );
}
