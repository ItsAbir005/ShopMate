"use client";

import { useEffect, useState } from "react";
import { Truck, Search } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

interface Driver {
    _id: string;
    name: string;
    email: string;
    phone: string;
    vehicleNumber: string;
    vehicleType: string;
    status: "offline" | "online" | "busy";
    isAvailable: boolean;
    isBlocked: boolean;
    createdAt: string;
}

const STATUS_COLOR: Record<string, { bg: string; text: string; border: string }> = {
    online: { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" },
    busy: { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200" },
    offline: { bg: "bg-gray-50", text: "text-gray-600", border: "border-gray-200" },
};

export default function AdminDriversPage() {
    const [drivers, setDrivers] = useState<Driver[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [toggling, setToggling] = useState<string | null>(null);

    const load = async () => {
        const token = localStorage.getItem("adminToken");
        setLoading(true);
        try {
            const res = await fetch(`${API}/drivers/all`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = await res.json();
            setDrivers(Array.isArray(data) ? data : data.drivers || []);
        } catch { setDrivers([]); }
        finally { setLoading(false); }
    };

    useEffect(() => { load(); }, []);

    const toggleBlock = async (driverId: string, currentlyBlocked: boolean) => {
        const token = localStorage.getItem("adminToken");
        setToggling(driverId);
        try {
            await fetch(`${API}/drivers/${driverId}/block`, {
                method: "PUT",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ isBlocked: !currentlyBlocked }),
            });
            setDrivers(prev => prev.map(d => d._id === driverId ? { ...d, isBlocked: !currentlyBlocked } : d));
        } catch (e) { alert("Failed to update driver status"); }
        finally { setToggling(null); }
    };

    const filtered = drivers.filter(d =>
        d.name.toLowerCase().includes(search.toLowerCase()) ||
        d.email.toLowerCase().includes(search.toLowerCase()) ||
        d.vehicleNumber.toLowerCase().includes(search.toLowerCase())
    );

    const online = drivers.filter(d => d.status === "online").length;
    const busy = drivers.filter(d => d.status === "busy").length;
    const blocked = drivers.filter(d => d.isBlocked).length;

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 bg-white min-h-screen">
            {/* Header */}
            <div className="mb-8">
                <div className="flex items-center gap-2">
                    <Truck className="w-7 h-7 text-indigo-600" />
                    <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Driver Management</h1>
                </div>
                <p className="text-sm text-gray-600 mt-1">{drivers.length} registered drivers</p>
            </div>

            {/* Stat strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
                {[
                    { label: "Total", value: drivers.length },
                    { label: "Online", value: online, textCol: "text-emerald-600" },
                    { label: "Busy", value: busy, textCol: "text-amber-600" },
                    { label: "Blocked", value: blocked, textCol: "text-red-600" },
                ].map(({ label, value, textCol }) => (
                    <div key={label} className="bg-white border border-gray-200 rounded-xl p-4 text-center">
                        <p className={`text-2xl font-bold ${textCol || "text-gray-900"} mb-1`}>{value}</p>
                        <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold">{label}</p>
                    </div>
                ))}
            </div>

            {/* Search */}
            <div className="mb-6 relative">
                <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                    value={search} onChange={e => setSearch(e.target.value)}
                    placeholder="Search driver by name, email or vehicle number..."
                    className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:border-indigo-600"
                />
            </div>

            {/* Table */}
            {loading ? (
                <div className="space-y-3">
                    {[1, 2, 3].map(i => <div key={i} className="h-16 bg-gray-50 border border-gray-200 rounded-xl animate-pulse" />)}
                </div>
            ) : (
                <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b border-gray-200 bg-gray-50">
                                {["Driver", "Vehicle", "Status", "Joined", "Actions"].map(h => (
                                    <th key={h} className="p-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="p-8 text-center text-gray-500 text-sm">No drivers found</td>
                                </tr>
                            )}
                            {filtered.map(driver => {
                                const sc = STATUS_COLOR[driver.status] || STATUS_COLOR.offline;
                                return (
                                    <tr key={driver._id} className="border-b border-gray-100 last:border-none hover:bg-gray-50/50 transition-colors">
                                        {/* Driver info */}
                                        <td className="p-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-600 font-bold text-xs flex items-center justify-center flex-shrink-0">
                                                    {driver.name[0].toUpperCase()}
                                                </div>
                                                <div>
                                                    <p className={`font-semibold text-sm ${driver.isBlocked ? "text-gray-400 line-through" : "text-gray-900"}`}>
                                                        {driver.name} {driver.isBlocked && <span className="text-xs text-red-600 no-underline font-normal">(Blocked)</span>}
                                                    </p>
                                                    <p className="text-xs text-gray-500">{driver.email}</p>
                                                </div>
                                            </div>
                                        </td>
                                        {/* Vehicle */}
                                        <td className="p-4 text-xs text-gray-600">
                                            <p className="font-medium text-gray-900">{driver.vehicleType} · <span className="font-mono text-gray-600">{driver.vehicleNumber}</span></p>
                                            <p className="text-gray-500">{driver.phone}</p>
                                        </td>
                                        {/* Status */}
                                        <td className="p-4">
                                            <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${sc.bg} ${sc.text} ${sc.border}`}>
                                                {driver.status.toUpperCase()}
                                            </span>
                                        </td>
                                        {/* Joined */}
                                        <td className="p-4 text-xs text-gray-500">
                                            {new Date(driver.createdAt).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" })}
                                        </td>
                                        {/* Actions */}
                                        <td className="p-4">
                                            <button
                                                onClick={() => toggleBlock(driver._id, driver.isBlocked)}
                                                disabled={toggling === driver._id}
                                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                                                    driver.isBlocked
                                                        ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                                                        : "bg-red-50 text-red-700 border-red-200 hover:bg-red-100"
                                                } disabled:opacity-50`}
                                            >
                                                {toggling === driver._id ? "..." : driver.isBlocked ? "Unblock" : "Block"}
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
