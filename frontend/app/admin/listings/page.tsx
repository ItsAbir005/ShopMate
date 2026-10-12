"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Clock, CheckCircle, XCircle, Tag, Check, X, Package, User, Folder } from "lucide-react";

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
    seller_id?: { _id: string; name: string; email: string };
    category_id?: { _id: string; name: string } | string;
    createdAt: string;
};

export default function AdminPendingListingsPage() {
    const router = useRouter();
    const [listings, setListings] = useState<Listing[]>([]);
    const [loading, setLoading] = useState(true);
    const [actionId, setActionId] = useState<string | null>(null);
    const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
    const [rejectModal, setRejectModal] = useState<{ id: string; title: string } | null>(null);
    const [rejectReason, setRejectReason] = useState("");

    const fetchPending = async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem("adminToken");
            const res = await fetch(`${API_URL}/products/admin/pending`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = await res.json();
            if (!res.ok) {
                if (res.status === 401 || res.status === 403) {
                    router.push("/admin/login");
                    return;
                }
                throw new Error(data.message);
            }
            setListings(Array.isArray(data) ? data : []);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchPending(); }, []);

    const showToast = (msg: string, type: "success" | "error" = "success") => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 3500);
    };

    const handleApprove = async (id: string, title: string) => {
        setActionId(id);
        try {
            const token = localStorage.getItem("adminToken");
            const res = await fetch(`${API_URL}/products/admin/${id}/approve`, {
                method: "PATCH",
                headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message);
            setListings(l => l.filter(x => x._id !== id));
            showToast(`"${title}" is now live in the store!`);
        } catch (err: any) {
            showToast(`Error: ${err.message}`, "error");
        } finally {
            setActionId(null);
        }
    };

    const handleReject = async () => {
        if (!rejectModal) return;
        setActionId(rejectModal.id);
        try {
            const token = localStorage.getItem("adminToken");
            const res = await fetch(`${API_URL}/products/admin/${rejectModal.id}/reject`, {
                method: "PATCH",
                headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
                body: JSON.stringify({ reason: rejectReason || undefined }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message);
            setListings(l => l.filter(x => x._id !== rejectModal.id));
            showToast(`"${rejectModal.title}" has been rejected.`);
        } catch (err: any) {
            showToast(`Error: ${err.message}`, "error");
        } finally {
            setActionId(null);
            setRejectModal(null);
            setRejectReason("");
        }
    };

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 bg-white min-h-screen">
            {/* Toast */}
            {toast && (
                <div className={`fixed bottom-6 right-6 z-50 px-5 py-3 rounded-xl text-sm font-semibold shadow-lg ${
                    toast.type === "error" ? "bg-red-600 text-white" : "bg-emerald-600 text-white"
                }`}>
                    {toast.msg}
                </div>
            )}

            {/* Reject Reason Modal */}
            {rejectModal && (
                <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
                    <div className="bg-white border border-gray-200 rounded-2xl p-6 max-w-md w-full shadow-xl">
                        <h3 className="text-lg font-bold text-gray-900 mb-1">
                            Reject Listing
                        </h3>
                        <p className="text-xs text-gray-500 mb-4">
                            Provide a reason (optional) — the seller will see this message.
                        </p>
                        <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-xs font-medium text-red-700">
                            "{rejectModal.title}"
                        </div>
                        <textarea
                            value={rejectReason}
                            onChange={e => setRejectReason(e.target.value)}
                            placeholder="e.g. Images are blurry, price is out of range…"
                            rows={3}
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:border-indigo-600 mb-4"
                        />
                        <div className="flex justify-end gap-2">
                            <button
                                onClick={() => { setRejectModal(null); setRejectReason(""); }}
                                className="px-4 py-2 border border-gray-200 rounded-lg text-gray-600 text-sm font-semibold hover:bg-gray-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleReject}
                                disabled={!!actionId}
                                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-semibold disabled:opacity-50"
                            >
                                {actionId ? "Rejecting…" : "Reject Listing"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Header */}
            <div className="mb-8">
                <div className="flex items-center gap-2">
                    <Tag className="w-7 h-7 text-indigo-600" />
                    <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Pending Listings</h1>
                </div>
                <p className="text-sm text-gray-600 mt-1">
                    Review customer-submitted sell listings before they go live.
                </p>
            </div>

            {/* Stats bar */}
            <div className="mb-6">
                <div className="inline-flex items-center gap-3 bg-white border border-gray-200 rounded-xl px-5 py-3">
                    <Clock className="w-5 h-5 text-amber-500" />
                    <div>
                        <div className="text-xl font-bold text-gray-900">{listings.length}</div>
                        <div className="text-xs text-gray-500 font-medium">Awaiting Review</div>
                    </div>
                </div>
            </div>

            {/* Listings */}
            {loading ? (
                <div className="space-y-4">
                    {[1, 2, 3].map(i => (
                        <div key={i} className="h-32 rounded-xl bg-gray-50 border border-gray-200 animate-pulse" />
                    ))}
                </div>
            ) : listings.length === 0 ? (
                <div className="bg-white border border-gray-200 rounded-2xl p-12 text-center max-w-lg mx-auto">
                    <CheckCircle className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
                    <h3 className="text-lg font-bold text-gray-900 mb-1">All Clear!</h3>
                    <p className="text-sm text-gray-500">No pending listings to review right now.</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {listings.map(listing => {
                        const seller = listing.seller_id;
                        const catName = typeof listing.category_id === "object"
                            ? listing.category_id?.name : "";

                        return (
                            <div key={listing._id} className="bg-white border border-gray-200 rounded-xl p-5 flex flex-col sm:flex-row gap-5 items-start">
                                {/* Images */}
                                <div className="flex gap-2 flex-shrink-0">
                                    {listing.images.slice(0, 3).map((img, i) => (
                                        <div key={i} className="w-20 h-20 rounded-lg overflow-hidden border border-gray-200 bg-gray-50 flex-shrink-0">
                                            <img src={img} alt="" className="w-full h-full object-cover" />
                                        </div>
                                    ))}
                                    {listing.images.length === 0 && (
                                        <div className="w-20 h-20 rounded-lg border border-gray-200 bg-gray-50 flex items-center justify-center text-gray-400">
                                            <Package className="w-8 h-8" />
                                        </div>
                                    )}
                                </div>

                                {/* Info */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap mb-1">
                                        <h3 className="font-bold text-gray-900 text-base">{listing.title}</h3>
                                        <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                                            Pending
                                        </span>
                                    </div>

                                    <p className="text-sm text-gray-500 mb-3 truncate max-w-xl">
                                        {listing.description}
                                    </p>

                                    <div className="flex gap-4 flex-wrap text-xs text-gray-600">
                                        <span className="font-bold text-emerald-600 text-sm">${listing.price.toFixed(2)}</span>
                                        <span>Stock: {listing.stock}</span>
                                        {listing.discount > 0 && <span className="text-amber-600 font-semibold">-{listing.discount}%</span>}
                                        {catName && <span className="flex items-center gap-1"><Folder className="w-3 h-3" /> {catName}</span>}
                                    </div>

                                    {seller && (
                                        <div className="mt-3 inline-flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1 text-xs text-gray-600">
                                            <User className="w-3.5 h-3.5 text-indigo-600" />
                                            <span className="font-medium text-gray-900">{seller.name}</span>
                                            <span>·</span>
                                            <span>{seller.email}</span>
                                        </div>
                                    )}

                                    <div className="mt-2 text-[11px] text-gray-400">
                                        Submitted {new Date(listing.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                                    </div>
                                </div>

                                {/* Action buttons */}
                                <div className="flex sm:flex-col gap-2 flex-shrink-0 w-full sm:w-auto">
                                    <button
                                        onClick={() => handleApprove(listing._id, listing.title)}
                                        disabled={!!actionId}
                                        className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs transition-colors disabled:opacity-50"
                                    >
                                        <Check className="w-3.5 h-3.5" />
                                        <span>Approve</span>
                                    </button>
                                    <button
                                        onClick={() => { setRejectModal({ id: listing._id, title: listing.title }); setRejectReason(""); }}
                                        disabled={!!actionId}
                                        className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 font-semibold text-xs transition-colors disabled:opacity-50"
                                    >
                                        <X className="w-3.5 h-3.5" />
                                        <span>Reject</span>
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
