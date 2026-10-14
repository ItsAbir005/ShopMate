"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ShieldCheck, LayoutDashboard, Package, Tag, Truck, Bell, User, LogOut, ClipboardList, Sparkles } from "lucide-react";

function AdminNav() {
    const pathname = usePathname();
    const router = useRouter();
    const [adminName, setAdminName] = useState("");
    const [unreadCount, setUnreadCount] = useState(0);

    const fetchNotifications = async () => {
        const token = localStorage.getItem("adminToken");
        if (!token) return;
        try {
            const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
            const res = await fetch(`${API}/notifications/unread`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setUnreadCount(data.length);
            }
        } catch (err) {
            console.error("Failed to fetch notifications", err);
        }
    };

    useEffect(() => {
        const profile = localStorage.getItem("adminProfile");
        if (profile) {
            setAdminName(JSON.parse(profile).name?.split(" ")[0] || "Admin");
        }
        fetchNotifications();
        const interval = setInterval(fetchNotifications, 30000);
        return () => clearInterval(interval);
    }, []);

    const handleLogout = () => {
        localStorage.removeItem("adminToken");
        localStorage.removeItem("adminProfile");
        router.push("/admin/login");
    };

    const links = [
        { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
        { href: "/admin/orders", label: "Orders", icon: ClipboardList },
        { href: "/admin/products", label: "Products", icon: Package },
        { href: "/admin/categories", label: "Categories", icon: Tag },
        { href: "/admin/drivers", label: "Drivers", icon: Truck },
        { href: "/admin/copilot", label: "AI Copilot", icon: Sparkles },
    ];

    return (
        <nav className="fixed top-0 left-0 right-0 z-50 bg-white border-b border-gray-200">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-6">
                {/* Logo */}
                <Link href="/admin" className="flex items-center gap-2 text-gray-900 font-bold text-lg flex-shrink-0">
                    <ShieldCheck className="w-6 h-6 text-indigo-600" />
                    <span>ShopMate Admin</span>
                </Link>

                {/* Nav links */}
                <div className="flex items-center gap-1 sm:gap-2 flex-1 max-w-2xl overflow-x-auto">
                    {links.map(({ href, label, icon: Icon }) => {
                        const active = pathname === href || (href !== "/admin" && pathname.startsWith(href));
                        return (
                            <Link
                                key={href}
                                href={href}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                                    active
                                        ? "bg-indigo-50 text-indigo-600 border border-indigo-100"
                                        : "text-gray-600 hover:text-gray-900 hover:bg-gray-50 border border-transparent"
                                }`}
                            >
                                <Icon className="w-4 h-4" />
                                <span className="hidden sm:inline">{label}</span>
                            </Link>
                        );
                    })}
                </div>

                {/* Admin info + logout */}
                <div className="flex items-center gap-4 flex-shrink-0">
                    <Link href="/admin/notifications" className="relative p-1.5 text-gray-600 hover:text-gray-900 rounded-lg hover:bg-gray-50">
                        <Bell className="w-5 h-5" />
                        {unreadCount > 0 && (
                            <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                                {unreadCount}
                            </span>
                        )}
                    </Link>

                    {adminName && (
                        <div className="hidden sm:flex items-center gap-1.5 text-xs font-semibold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-full border border-indigo-100">
                            <User className="w-3.5 h-3.5" />
                            <span>{adminName}</span>
                        </div>
                    )}

                    <button
                        onClick={handleLogout}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 text-xs font-medium hover:text-gray-900 hover:bg-gray-50 transition-colors"
                    >
                        <LogOut className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Logout</span>
                    </button>
                </div>
            </div>
        </nav>
    );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const pathname = usePathname();
    const isAuthPage = pathname === "/admin/login" || pathname === "/admin/register";

    useEffect(() => {
        if (!isAuthPage) {
            const adminToken = localStorage.getItem("adminToken");
            if (!adminToken) {
                router.push("/admin/login");
            } else {
                if (!localStorage.getItem("token")) {
                    localStorage.setItem("token", adminToken);
                }
            }
        }
    }, [pathname, isAuthPage, router]);

    if (isAuthPage) return <>{children}</>;

    return (
        <div className="min-h-screen bg-white">
            <AdminNav />
            <main className="pt-16 min-h-screen bg-white">
                {children}
            </main>
        </div>
    );
}
