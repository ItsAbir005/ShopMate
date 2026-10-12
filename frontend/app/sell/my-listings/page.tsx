"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "../../context/AuthContext";
import { Clock, CheckCircle, XCircle, Inbox, Package, Folder, Plus, Trash2 } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

type Listing = {
    _id: string;
    title: string;
    description: string;
    price: number;
    stock: number;
    images: string[];
    discount: number;
    status: "pending" | "approved" | "rejected";
    rejectionReason?: string;
    category_id?: { _id: string; name: string } | string;
    createdAt: string;
};

const STATUS_MAP = {
    pending: { label: "Pending Review", color: "text-amber-700", bg: "bg-amber-50", border: "border-amber-200", icon: Clock },
    approved: { label: "Approved — Live", color: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200", icon: CheckCircle },
    rejected: { label: "Rejected", color: "text-red-700", bg: "bg-red-50", border: "border-red-200", icon: XCircle },
};

export default function MyListingsPage() {
    const { user } = useAuth();
    const router = useRouter();
    const [mounted, setMounted] = useState(false);
    const [listings, setListings] = useState<Listing[]>([]);
    const [loading, setLoading] = useState(true);
    const [deleting, setDeleting] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [toast, setToast] = useState<string | null>(null);

    useEffect(() => { setMounted(true); }, []);

    useEffect(() => {
        if (mounted && !user) {
            router.push("/login?redirect=/sell/my-listings");
        }
    }, [mounted, user, router]);

    const loadListings = async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem("token");
            const res = await fetch(`${API_URL}/products/my-listings`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message);
            setListings(Array.isArray(data) ? data : []);
        } catch (err: any) {
            setError(err.message || "Failed to load listings");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (mounted && user) loadListings();
    }, [mounted, user]);

    const handleDelete = async (id: string) => {
        if (!confirm("Delete this listing? This cannot be undone.")) return;
        setDeleting(id);
        try {
            const token = localStorage.getItem("token");
            const res = await fetch(`${API_URL}/products/my-listings/${id}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message);
            setListings(l => l.filter(x => x._id !== id));
            setToast("Listing deleted successfully.");
            setTimeout(() => setToast(null), 3000);
        } catch (err: any) {
            setToast(`Error: ${err.message}`);
            setTimeout(() => setToast(null), 4000);
        } finally {
            setDeleting(null);
        }
    };

    if (!mounted) return null;

    return (
        <div className="min-h-[80vh] py-12 px-4 sm:px-6 lg:px-8 max-w-4xl mx-auto bg-white">
            {/* Toast */}
            {toast && (
                <div className={`fixed bottom-6 right-6 z-50 px-5 py-3 rounded-xl text-sm font-semibold shadow-lg ${
                    toast.startsWith("Error") ? "bg-red-600 text-white" : "bg-emerald-600 text-white"
                }`}>
                    {toast}
                </div>
            )}

            {/* Header */}
            <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-1">My Listings</h1>
                    <p className="text-sm text-gray-600">
                        Track the status of your submitted sell listings.
                    </p>
                </div>
                <Link
                    href="/sell"
                    className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition-colors"
                >
                    <Plus className="w-4 h-4" />
                    New Listing
                </Link>
            </div>

            {/* Status legend */}
            <div className="flex gap-2 flex-wrap mb-6">
                {(Object.entries(STATUS_MAP) as [string, typeof STATUS_MAP["pending"]][]).map(([key, val]) => {
                    const Icon = val.icon;
                    return (
                        <div
                            key={key}
                            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${val.bg} ${val.border} ${val.color}`}
                        >
                            <Icon className="w-3.5 h-3.5" />
                            {val.label}
                        </div>
                    );
                })}
            </div>

            {loading ? (
                <div className="space-y-4">
                    {[1, 2, 3].map(i => (
                        <div key={i} className="h-28 rounded-xl bg-gray-50 border border-gray-200 animate-pulse" />
                    ))}
                </div>
            ) : error ? (
                <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center text-sm font-medium text-red-700">
                    {error}
                </div>
            ) : listings.length === 0 ? (
                <div className="bg-white border border-gray-200 rounded-2xl p-12 text-center max-w-md mx-auto">
                    <Inbox className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                    <h3 className="text-lg font-bold text-gray-900 mb-1">No listings yet</h3>
                    <p className="text-sm text-gray-500 mb-6">Submit your first sell listing to get started.</p>
                    <Link
                        href="/sell"
                        className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition-colors"
                    >
                        <Plus className="w-4 h-4" />
                        Start Selling
                    </Link>
                </div>
            ) : (
                <div className="space-y-4">
                    {listings.map(listing => {
                        const st = STATUS_MAP[listing.status];
                        const StatusIcon = st.icon;
                        const canDelete = listing.status !== "approved";
                        const catName = typeof listing.category_id === "object"
                            ? listing.category_id?.name
                            : "";
                        const finalPrice = listing.discount > 0
                            ? (listing.price * (1 - listing.discount / 100)).toFixed(2)
                            : null;

                        return (
                            <div key={listing._id} className="bg-white border border-gray-200 rounded-xl p-5 flex flex-col sm:flex-row gap-5 items-start">
                                {/* Image */}
                                <div className="w-20 h-20 rounded-lg overflow-hidden border border-gray-200 bg-gray-50 flex-shrink-0 flex items-center justify-center">
                                    {listing.images?.[0] ? (
                                        <img src={listing.images[0]} alt={listing.title} className="w-full h-full object-cover" />
                                    ) : (
                                        <Package className="w-8 h-8 text-gray-300" />
                                    )}
                                </div>

                                {/* Info */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap mb-1">
                                        <h3 className="font-bold text-gray-900 text-base">{listing.title}</h3>
                                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${st.bg} ${st.border} ${st.color}`}>
                                            <StatusIcon className="w-3 h-3" />
                                            {st.label}
                                        </span>
                                    </div>

                                    <p className="text-sm text-gray-500 truncate max-w-xl mb-2">
                                        {listing.description}
                                    </p>

                                    <div className="flex gap-4 flex-wrap text-xs text-gray-600">
                                        <span className="font-bold text-gray-900 text-sm">
                                            {finalPrice ? `$${finalPrice}` : `$${listing.price.toFixed(2)}`}
                                            {finalPrice && <span className="text-gray-400 font-normal line-through ml-1.5">${listing.price.toFixed(2)}</span>}
                                        </span>
                                        <span>Stock: {listing.stock}</span>
                                        {catName && <span className="flex items-center gap-1"><Folder className="w-3 h-3" /> {catName}</span>}
                                        <span className="text-gray-400">
                                            {new Date(listing.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                                        </span>
                                    </div>

                                    {listing.status === "rejected" && listing.rejectionReason && (
                                        <div className="mt-2 bg-red-50 border border-red-200 rounded-lg p-2.5 text-xs text-red-700">
                                            <strong>Reason:</strong> {listing.rejectionReason}
                                        </div>
                                    )}
                                </div>

                                {/* Actions */}
                                <div className="flex sm:flex-col gap-2 flex-shrink-0 w-full sm:w-auto">
                                    {canDelete && (
                                        <button
                                            onClick={() => handleDelete(listing._id)}
                                            disabled={deleting === listing._id}
                                            className="px-3.5 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 text-xs font-semibold transition-colors disabled:opacity-50"
                                        >
                                            {deleting === listing._id ? "Deleting…" : "Delete"}
                                        </button>
                                    )}
                                    {listing.status === "approved" && (
                                        <span className="text-[11px] text-gray-400">
                                            Active in store
                                        </span>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
