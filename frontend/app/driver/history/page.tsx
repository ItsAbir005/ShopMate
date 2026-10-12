"use client";

import { useEffect, useState } from "react";
import { useDriver } from "../../context/DriverContext";
import { Inbox, CheckCircle2, MapPin } from "lucide-react";

interface HistoryItem {
    _id: string;
    trackingCode: string;
    status: string;
    deliveredAt?: string;
    deliveryAddress: { city: string; state: string };
    order_id?: { total_amount: number; createdAt: string };
}

export default function DriverHistoryPage() {
    const { fetchWithAuth } = useDriver();
    const [history, setHistory] = useState<HistoryItem[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [pages, setPages] = useState(1);

    const load = async (p = 1) => {
        setLoading(true);
        try {
            const data = await fetchWithAuth(`/drivers/delivery/history?page=${p}`);
            setHistory(data.deliveries || []);
            setTotal(data.total || 0);
            setPages(data.pages || 1);
        } catch { } finally { setLoading(false); }
    };

    useEffect(() => { load(page); }, [page]);

    return (
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10 bg-white min-h-[85vh]">
            <div className="mb-8 pb-4 border-b border-gray-100">
                <h1 className="text-2xl font-bold text-gray-900 mb-1">Delivery History</h1>
                <p className="text-xs text-gray-500">{total} completed deliveries</p>
            </div>

            {loading ? (
                <div className="space-y-3">
                    {[1, 2, 3].map(i => (
                        <div key={i} className="h-20 bg-gray-50 border border-gray-200 rounded-xl animate-pulse" />
                    ))}
                </div>
            ) : history.length === 0 ? (
                <div className="text-center py-20 bg-white border border-gray-200 rounded-xl p-8">
                    <Inbox className="w-10 h-10 text-gray-300 stroke-1 mx-auto mb-2" />
                    <p className="text-xs text-gray-500">No deliveries completed yet.</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {history.map((item) => (
                        <div
                            key={item._id}
                            className="bg-white border border-gray-200 rounded-xl p-4 sm:p-5 flex justify-between items-center shadow-xs"
                        >
                            <div>
                                <p className="font-mono text-sm font-bold text-gray-900 mb-1">
                                    {item.trackingCode}
                                </p>
                                <p className="text-xs text-gray-500 flex items-center gap-1">
                                    <MapPin className="w-3 h-3 text-gray-400" />
                                    <span>{item.deliveryAddress.city}, {item.deliveryAddress.state}</span>
                                    {item.deliveredAt && (
                                        <span>· {new Date(item.deliveredAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</span>
                                    )}
                                </p>
                            </div>
                            <div className="text-right">
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-semibold">
                                    <CheckCircle2 className="w-3 h-3" />
                                    <span>Delivered</span>
                                </span>
                                {item.order_id?.total_amount && (
                                    <p className="text-xs text-gray-600 font-medium mt-1">
                                        ${item.order_id.total_amount.toFixed(2)}
                                    </p>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Pagination */}
            {pages > 1 && (
                <div className="flex gap-1.5 justify-center mt-8">
                    {Array.from({ length: pages }, (_, i) => i + 1).map(p => (
                        <button
                            key={p}
                            onClick={() => setPage(p)}
                            className={`w-8 h-8 rounded-md text-xs font-medium cursor-pointer transition-colors ${
                                p === page
                                    ? "bg-indigo-600 text-white"
                                    : "border border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                            }`}
                        >
                            {p}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
