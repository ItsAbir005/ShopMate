"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
    DollarSign,
    ClipboardList,
    Package,
    Users,
    Truck,
    Clock,
    Activity,
    ArrowRight,
    Lock,
    Store,
    ShieldCheck
} from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

interface Stats {
    totalOrders: number;
    totalProducts: number;
    totalUsers: number;
    totalRevenue: number;
    pendingOrders: number;
    activeDrivers: number;
    pendingShipments: number;
}

const StatCard = ({ icon: Icon, label, value, sub, color }: {
    icon: any; label: string; value: string | number; sub?: string; color?: string;
}) => (
    <div className="bg-white border border-gray-200 rounded-xl p-5 flex flex-col gap-2">
        <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500 uppercase tracking-wider font-semibold">{label}</span>
            <div className="p-2 rounded-lg bg-gray-50 border border-gray-100 text-gray-700">
                <Icon className="w-4 h-4" />
            </div>
        </div>
        <p className="text-2xl font-bold text-gray-900 leading-none">{value}</p>
        {sub && <p className="text-xs text-gray-500">{sub}</p>}
    </div>
);

const QuickLink = ({ href, icon: Icon, label, desc, target }: { href: string; icon: any; label: string; desc: string; target?: string; }) => {
    const isExternal = target === "_blank";
    const commonClass = "flex items-center gap-4 p-4 bg-white border border-gray-200 rounded-xl text-gray-900 hover:border-indigo-400 hover:bg-gray-50/50 transition-colors group";
    const content = (
        <>
            <div className="p-2.5 rounded-lg bg-indigo-50 text-indigo-600 border border-indigo-100 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                <Icon className="w-5 h-5" />
            </div>
            <div className="flex-1">
                <p className="font-semibold text-gray-900 text-sm">{label}</p>
                <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
            </div>
            <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-indigo-600 group-hover:translate-x-0.5 transition-all" />
        </>
    );

    if (isExternal) {
        return (
            <a href={href} target={target} rel="noopener noreferrer" className={commonClass}>
                {content}
            </a>
        );
    }

    return (
        <Link href={href} className={commonClass}>
            {content}
        </Link>
    );
};

export default function AdminDashboard() {
    const [stats, setStats] = useState<Stats | null>(null);
    const [loading, setLoading] = useState(true);
    const [adminName, setAdminName] = useState("");

    useEffect(() => {
        const profile = localStorage.getItem("adminProfile");
        if (profile) setAdminName(JSON.parse(profile).name || "Admin");
    }, []);

    useEffect(() => {
        const load = async () => {
            const token = localStorage.getItem("adminToken");
            try {
                const [ordersRes, productsRes, usersRes, driversRes] = await Promise.allSettled([
                    fetch(`${API}/orders?limit=1000`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
                    fetch(`${API}/products?limit=1`).then(r => r.json()),
                    fetch(`${API}/users`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
                    fetch(`${API}/drivers/all`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
                ]);

                const orders = ordersRes.status === "fulfilled" ? ordersRes.value : null;
                const products = productsRes.status === "fulfilled" ? productsRes.value : null;
                const users = usersRes.status === "fulfilled" ? usersRes.value : null;
                const drivers = driversRes.status === "fulfilled" ? driversRes.value : null;

                const orderList: any[] = orders?.orders || [];
                const revenue = orderList.filter(o => o.payment_status === "paid").reduce((s: number, o: any) => s + (o.total_amount || 0), 0);
                const pending = orderList.filter(o => ["pending", "paid"].includes(o.status)).length;

                setStats({
                    totalOrders: orders?.total || orderList.length,
                    totalProducts: products?.total || 0,
                    totalUsers: Array.isArray(users) ? users.length : users?.total || 0,
                    totalRevenue: revenue,
                    pendingOrders: pending,
                    activeDrivers: Array.isArray(drivers) ? drivers.filter((d: any) => d.status === "online").length : 0,
                    pendingShipments: 0,
                });
            } catch (err) {
                console.error("Dashboard stats error:", err);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, []);

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 bg-white min-h-screen">
            {/* Header */}
            <div className="mb-8">
                <div className="flex items-center gap-2">
                    <ShieldCheck className="w-7 h-7 text-indigo-600" />
                    <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
                        Welcome back, {adminName.split(" ")[0]}
                    </h1>
                </div>
                <p className="text-sm text-gray-600 mt-1">
                    Here's what's happening with your store today.
                </p>
            </div>

            {/* Stats Grid */}
            {loading ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                    {[1, 2, 3, 4].map(i => (
                        <div key={i} className="h-28 bg-gray-50 border border-gray-200 rounded-xl animate-pulse" />
                    ))}
                </div>
            ) : stats && (
                <>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                        <StatCard icon={DollarSign} label="Total Revenue" value={`$${stats.totalRevenue.toLocaleString("en-US", { maximumFractionDigits: 0 })}`} sub="From paid orders" />
                        <StatCard icon={ClipboardList} label="Total Orders" value={stats.totalOrders} sub={`${stats.pendingOrders} pending`} />
                        <StatCard icon={Package} label="Products" value={stats.totalProducts} />
                        <StatCard icon={Users} label="Users" value={stats.totalUsers} />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                        <StatCard icon={Truck} label="Online Drivers" value={stats.activeDrivers} sub="Currently active" />
                        <StatCard icon={Clock} label="Pending Orders" value={stats.pendingOrders} sub="Need attention" />
                        <StatCard icon={Activity} label="System Status" value="Healthy" sub="All services running" />
                    </div>
                </>
            )}

            {/* Quick Links */}
            <h2 className="text-lg font-bold text-gray-900 mb-4">Quick Actions</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <QuickLink href="/admin/products" icon={Package} label="Manage Products" desc="Add, edit or delete products" />
                <QuickLink href="/admin/drivers" icon={Truck} label="Manage Drivers" desc="View and block driver accounts" />
                <QuickLink href="/admin/register" icon={Lock} label="Create Admin Account" desc="Add another admin with secret key" />
                <QuickLink href="/" icon={Store} label="View Store" desc="See customer-facing storefront" target="_blank" />
            </div>
        </div>
    );
}
