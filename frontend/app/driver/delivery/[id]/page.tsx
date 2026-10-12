"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useDriver } from "../../../context/DriverContext";
import ChatBox from "../../../components/ChatBox";
import {
    ClipboardList,
    Package,
    Truck,
    CheckCircle2,
    MapPin,
    ExternalLink,
    MessageSquare,
    Check,
    ArrowLeft,
    AlertCircle
} from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

type ShipmentStatus = "assigned" | "picked_up" | "out_for_delivery" | "delivered" | "failed";

interface Shipment {
    _id: string;
    trackingCode: string;
    status: ShipmentStatus;
    otp: string;
    deliveryAddress: { street: string; city: string; state: string; zip: string; country: string };
    estimatedDelivery?: string;
    order_id?: { _id: string };
    assignedAt?: string;
    pickedUpAt?: string;
}

const STEPS: { key: ShipmentStatus; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { key: "assigned", label: "Assigned", icon: ClipboardList },
    { key: "picked_up", label: "Picked Up", icon: Package },
    { key: "out_for_delivery", label: "Out for Delivery", icon: Truck },
    { key: "delivered", label: "Delivered", icon: CheckCircle2 },
];

const NEXT_STATUS: Partial<Record<ShipmentStatus, ShipmentStatus>> = {
    assigned: "picked_up",
    picked_up: "out_for_delivery",
    out_for_delivery: "delivered",
};

const NEXT_LABEL: Partial<Record<ShipmentStatus, string>> = {
    assigned: "Mark as Picked Up",
    picked_up: "Mark as Out for Delivery",
    out_for_delivery: "Confirm Delivery with OTP",
};

export default function DeliveryDetailPage() {
    const { id } = useParams() as { id: string };
    const { token, driver } = useDriver();
    const router = useRouter();
    const [shipment, setShipment] = useState<Shipment | null>(null);
    const [loading, setLoading] = useState(true);
    const [updating, setUpdating] = useState(false);
    const [otp, setOtp] = useState("");
    const [error, setError] = useState("");
    const [showOtp, setShowOtp] = useState(false);
    const [isChatOpen, setIsChatOpen] = useState(false);

    const fetchShipment = async () => {
        try {
            const res = await fetch(`${API}/drivers/delivery/active`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = await res.json();
            setShipment(data);
        } catch {
            setShipment(null);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { if (token) fetchShipment(); }, [token]);

    const handleStatusUpdate = async () => {
        if (!shipment) return;
        const nextStatus = NEXT_STATUS[shipment.status];
        if (!nextStatus) return;

        if (nextStatus === "delivered") {
            setShowOtp(true);
            return;
        }
        setUpdating(true);
        setError("");
        try {
            await fetch(`${API}/shipping/${id}/status`, {
                method: "PUT",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ status: nextStatus }),
            });
            await fetchShipment();
        } catch (e: any) {
            setError(e.message || "Failed to update status");
        } finally {
            setUpdating(false);
        }
    };

    const handleConfirmDelivery = async () => {
        setUpdating(true);
        setError("");
        try {
            const res = await fetch(`${API}/shipping/${id}/confirm-delivery`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ otp }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || "OTP verification failed");
            router.push("/driver/dashboard");
        } catch (e: any) {
            setError(e.message || "Failed to confirm delivery");
        } finally {
            setUpdating(false);
        }
    };

    if (loading) {
        return (
            <div className="max-w-2xl mx-auto px-4 py-10 bg-white min-h-[80vh]">
                <div className="h-64 bg-gray-50 border border-gray-200 rounded-xl animate-pulse" />
            </div>
        );
    }

    if (!shipment) {
        return (
            <div className="text-center py-24 px-4 bg-white min-h-[80vh]">
                <Package className="w-12 h-12 text-gray-300 stroke-1 mx-auto mb-3" />
                <p className="text-gray-500 text-sm">No active delivery found.</p>
                <Link href="/driver/dashboard" className="text-indigo-600 hover:text-indigo-700 text-xs font-semibold mt-3 inline-block">
                    Return to Dashboard
                </Link>
            </div>
        );
    }

    const currentStep = STEPS.findIndex((s) => s.key === shipment.status);
    const nextLabel = NEXT_LABEL[shipment.status];
    const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        `${shipment.deliveryAddress.street}, ${shipment.deliveryAddress.city}`
    )}`;

    return (
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10 bg-white min-h-[85vh]">
            {/* Header */}
            <div className="mb-8 pb-4 border-b border-gray-100">
                <Link
                    href="/driver/dashboard"
                    className="text-xs text-gray-500 hover:text-gray-800 mb-2 inline-flex items-center gap-1 font-medium"
                >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Back to Dashboard</span>
                </Link>
                <div className="flex items-baseline justify-between gap-3 flex-wrap">
                    <div>
                        <h1 className="text-2xl font-bold font-mono text-gray-900">
                            {shipment.trackingCode}
                        </h1>
                        {shipment.order_id && (
                            <span className="text-xs text-gray-500 font-mono mt-0.5 inline-block">
                                Order #{shipment.order_id._id.slice(-8).toUpperCase()}
                            </span>
                        )}
                    </div>
                    <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 uppercase">
                        {shipment.status.replace(/_/g, " ")}
                    </span>
                </div>
            </div>

            {/* Progress stepper */}
            <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6 shadow-xs">
                <div className="flex justify-between items-center relative">
                    <div className="absolute top-4 left-4 right-4 h-0.5 bg-gray-200 z-0" />
                    {STEPS.map((step, i) => {
                        const StepIcon = step.icon;
                        const isDone = i <= currentStep;
                        return (
                            <div key={step.key} className="flex flex-col items-center z-10">
                                <div
                                    className={`w-8 h-8 rounded-full border-2 flex items-center justify-center text-xs font-bold transition-all ${
                                        isDone
                                            ? "bg-indigo-600 border-indigo-600 text-white"
                                            : "bg-white border-gray-300 text-gray-400"
                                    }`}
                                >
                                    {i < currentStep ? <Check className="w-4 h-4" /> : <StepIcon className="w-4 h-4" />}
                                </div>
                                <span className={`text-[11px] mt-2 font-medium ${isDone ? "text-gray-900" : "text-gray-400"}`}>
                                    {step.label}
                                </span>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Delivery address */}
            <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6 shadow-xs">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2 flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Destination Address</span>
                </p>
                <p className="text-sm font-medium text-gray-900">
                    {shipment.deliveryAddress.street}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                    {shipment.deliveryAddress.city}, {shipment.deliveryAddress.state} {shipment.deliveryAddress.zip}
                </p>
                <div className="flex gap-2.5 mt-4 flex-wrap">
                    <a
                        href={mapsUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 text-xs font-medium transition-colors"
                    >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>Open in Google Maps</span>
                    </a>
                    <button
                        onClick={() => setIsChatOpen(true)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 text-xs font-medium transition-colors cursor-pointer"
                    >
                        <MessageSquare className="w-3.5 h-3.5" />
                        <span>Chat with Customer</span>
                    </button>
                </div>
            </div>

            {/* Error */}
            {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-xs mb-5 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{error}</span>
                </div>
            )}

            {/* OTP confirmation panel */}
            {showOtp && (
                <div className="bg-white border border-indigo-200 rounded-xl p-5 mb-6 shadow-xs">
                    <p className="font-semibold text-gray-900 text-xs mb-3">
                        Enter Customer 6-Digit OTP to Complete Delivery
                    </p>
                    <input
                        type="text"
                        value={otp}
                        onChange={(e) => setOtp(e.target.value.replace(/\D/, "").slice(0, 6))}
                        placeholder="••••••"
                        maxLength={6}
                        className="w-full p-2.5 bg-white border border-gray-300 rounded-lg text-xl font-mono text-center tracking-widest text-gray-900 outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 mb-3"
                    />
                    <div className="flex gap-2">
                        <button
                            onClick={handleConfirmDelivery}
                            disabled={otp.length !== 6 || updating}
                            className="flex-1 py-2 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-50 transition-colors"
                        >
                            {updating ? "Verifying…" : "Confirm Delivery"}
                        </button>
                        <button
                            onClick={() => setShowOtp(false)}
                            className="px-3 py-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 text-xs cursor-pointer"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            {/* Status action button */}
            {nextLabel && !showOtp && shipment.status !== "delivered" && (
                <button
                    onClick={handleStatusUpdate}
                    disabled={updating}
                    className="w-full py-2.5 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-50 transition-colors"
                >
                    {updating ? "Updating…" : nextLabel}
                </button>
            )}

            {isChatOpen && shipment && (
                <ChatBox
                    shipmentId={shipment._id}
                    userMode="driver"
                    userId={driver?.id || ""}
                    token={token || undefined}
                    recipientName="Customer"
                    onClose={() => setIsChatOpen(false)}
                />
            )}
        </div>
    );
}
