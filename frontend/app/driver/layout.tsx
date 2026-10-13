"use client";

import { DriverProvider, useDriver } from "../context/DriverContext";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LayoutDashboard, History, Truck, LogOut, CheckCircle2, Circle } from "lucide-react";

function DriverNav() {
    const { driver, logout, setOnlineStatus } = useDriver();
    const router = useRouter();
    const pathname = usePathname();
    const [toggling, setToggling] = useState(false);
    const isOnline = driver?.status === "online" || driver?.status === "busy";

    const handleToggle = async () => {
        if (!driver || toggling) return;
        setToggling(true);
        try {
            if (isOnline) {
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
                        console.warn("[Driver] Geolocation prompt/timeout failed, using fallback:", geoErr);
                    }
                }
                await setOnlineStatus("online", lat, lng);
            }
        } catch (err: any) {
            console.error("[Driver] Error toggling status:", err);
            alert(`Failed to update status: ${err.message || "Server error"}`);
        } finally {
            setToggling(false);
        }
    };

    const handleLogout = () => { logout(); router.push("/driver/login"); };

    const navLinks = [
        { href: "/driver/dashboard", label: "Dashboard", icon: LayoutDashboard },
        { href: "/driver/history", label: "History", icon: History },
    ];

    return (
        <nav className="fixed top-0 left-0 right-0 z-50 bg-white border-b border-gray-200">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
                {/* Logo */}
                <Link href="/driver/dashboard" className="flex items-center gap-2 text-gray-900 font-bold text-base">
                    <Truck className="w-5 h-5 text-indigo-600" />
                    <span>ShopMate Driver</span>
                </Link>

                {/* Nav links */}
                <div className="flex gap-4 sm:gap-6 items-center">
                    {navLinks.map(({ href, label, icon: Icon }) => {
                        const active = pathname === href;
                        return (
                            <Link
                                key={href}
                                href={href}
                                className={`text-xs sm:text-sm font-medium flex items-center gap-1.5 transition-colors ${
                                    active ? "text-indigo-600" : "text-gray-600 hover:text-gray-900"
                                }`}
                            >
                                <Icon className="w-4 h-4" />
                                <span>{label}</span>
                            </Link>
                        );
                    })}
                </div>

                {/* Online toggle + logout */}
                <div className="flex gap-3 items-center">
                    <button
                        onClick={handleToggle}
                        disabled={toggling || driver?.status === "busy"}
                        className={`px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 ${
                            isOnline
                                ? "bg-emerald-600 text-white hover:bg-emerald-700"
                                : "bg-gray-100 text-gray-700 border border-gray-300 hover:bg-gray-200"
                        }`}
                    >
                        {isOnline ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Circle className="w-3.5 h-3.5" />}
                        <span>{toggling ? "..." : isOnline ? "Online" : "Go Online"}</span>
                    </button>

                    {driver && (
                        <span className="hidden sm:inline text-xs font-semibold text-gray-900">
                            {driver.name.split(" ")[0]}
                        </span>
                    )}

                    <button
                        onClick={handleLogout}
                        className="p-1.5 sm:px-2.5 sm:py-1.5 rounded-md border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 text-xs flex items-center gap-1 transition-colors cursor-pointer"
                        title="Logout"
                    >
                        <LogOut className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Logout</span>
                    </button>
                </div>
            </div>
        </nav>
    );
}

function DriverLayoutInner({ children }: { children: React.ReactNode }) {
    const { driver, loading } = useDriver();
    const router = useRouter();
    const pathname = usePathname();

    useEffect(() => {
        const publicPaths = ["/driver/login", "/driver/register"];
        if (!loading && !driver && !publicPaths.includes(pathname)) {
            router.push("/driver/login");
        }
    }, [driver, loading, pathname, router]);

    if (pathname === "/driver/login" || pathname === "/driver/register") {
        return <>{children}</>;
    }

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-white">
                <div className="text-center">
                    <Truck className="w-8 h-8 text-indigo-600 mx-auto mb-2 animate-bounce" />
                    <p className="text-xs text-gray-500">Loading driver portal…</p>
                </div>
            </div>
        );
    }

    if (!driver) return null;

    return (
        <div className="bg-white min-h-screen text-gray-900">
            <DriverNav />
            <main className="pt-16 min-h-screen bg-white">
                {children}
            </main>
        </div>
    );
}

export default function DriverLayout({ children }: { children: React.ReactNode }) {
    return (
        <DriverProvider>
            <DriverLayoutInner>{children}</DriverLayoutInner>
        </DriverProvider>
    );
}
