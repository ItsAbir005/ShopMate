"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { fetchApi } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import Link from "next/link";
import { ShoppingBag, Truck, ShieldCheck, ArrowRight, ArrowLeft } from "lucide-react";

type Role = "customer" | "driver" | "admin";

interface RoleConfig {
    key: Role;
    label: string;
    desc: string;
    icon: React.ComponentType<{ className?: string }>;
}

const ROLES: RoleConfig[] = [
    {
        key: "customer",
        icon: ShoppingBag,
        label: "Customer",
        desc: "Shop products & track orders",
    },
    {
        key: "driver",
        icon: Truck,
        label: "Driver",
        desc: "Manage your deliveries",
    },
    {
        key: "admin",
        icon: ShieldCheck,
        label: "Admin",
        desc: "Manage the store",
    },
];

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

export default function LoginPage() {
    const { login } = useAuth();
    const router = useRouter();
    const [role, setRole] = useState<Role | null>(null);
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError("");
        try {
            if (role === "customer") {
                const data = await fetchApi("/auth/login", {
                    method: "POST",
                    body: JSON.stringify({ email, password }),
                });
                await login(data.token, "/products");

            } else if (role === "driver") {
                const res = await fetch(`${API}/drivers/login`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ email, password }),
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.message);
                localStorage.setItem("driverToken", data.token);
                localStorage.setItem("driverProfile", JSON.stringify(data.driver));
                router.push("/driver/dashboard");

            } else if (role === "admin") {
                const res = await fetch(`${API}/auth/admin/login`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ email, password }),
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.message);
                localStorage.setItem("adminToken", data.token);
                localStorage.setItem("adminProfile", JSON.stringify(data.admin));
                router.push("/admin");
            }
        } catch (err: any) {
            setError(err.message || "Login failed");
        } finally {
            setLoading(false);
        }
    };

    const activeRoleConfig = ROLES.find((r) => r.key === role);
    const ActiveIcon = activeRoleConfig?.icon;

    return (
        <div className="min-h-[85vh] flex items-center justify-center bg-white px-4 py-12">
            <div className="w-full max-w-md">
                {/* Header */}
                <div className="text-center mb-8">
                    <h1 className="text-2xl font-bold text-gray-900 mb-2">Welcome back</h1>
                    <p className="text-sm text-gray-600">
                        {role ? `Sign in as ${activeRoleConfig?.label}` : "Choose how you want to sign in"}
                    </p>
                </div>

                {/* Role selector */}
                {!role ? (
                    <div className="flex flex-col gap-3">
                        {ROLES.map(({ key, label, desc, icon: Icon }) => (
                            <button
                                key={key}
                                onClick={() => setRole(key)}
                                className="w-full flex items-center gap-4 p-4 rounded-xl border border-gray-200 bg-white hover:border-indigo-600 hover:bg-gray-50 transition-all text-left cursor-pointer group"
                            >
                                <div className="w-10 h-10 rounded-lg bg-gray-50 border border-gray-200 flex items-center justify-center text-gray-700 group-hover:text-indigo-600 group-hover:bg-indigo-50 group-hover:border-indigo-200 transition-colors">
                                    <Icon className="w-5 h-5" />
                                </div>
                                <div className="flex-1">
                                    <p className="font-semibold text-gray-900 text-sm">{label}</p>
                                    <p className="text-xs text-gray-500">{desc}</p>
                                </div>
                                <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-indigo-600 transition-colors" />
                            </button>
                        ))}

                        <p className="text-center mt-4 text-xs text-gray-500">
                            New customer?{" "}
                            <Link href="/register" className="text-indigo-600 hover:text-indigo-700 font-medium">
                                Create account
                            </Link>
                            {" · "}
                            <Link href="/driver/register" className="text-indigo-600 hover:text-indigo-700 font-medium">
                                Driver register
                            </Link>
                        </p>
                    </div>
                ) : (
                    /* Login form */
                    <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-xs">
                        {/* Back button */}
                        <button
                            onClick={() => { setRole(null); setError(""); setEmail(""); setPassword(""); }}
                            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800 mb-5 cursor-pointer font-medium"
                        >
                            <ArrowLeft className="w-3.5 h-3.5" />
                            <span>Change role</span>
                        </button>

                        {/* Role badge */}
                        <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-100">
                            {ActiveIcon && (
                                <div className="w-9 h-9 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
                                    <ActiveIcon className="w-4 h-4" />
                                </div>
                            )}
                            <div>
                                <p className="font-semibold text-gray-900 text-sm">
                                    {activeRoleConfig?.label} Sign In
                                </p>
                                <p className="text-xs text-gray-500">
                                    {activeRoleConfig?.desc}
                                </p>
                            </div>
                        </div>

                        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1.5">Email address</label>
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    required
                                    placeholder={role === "admin" ? "admin@shopmate.com" : "you@example.com"}
                                    className="w-full px-3.5 py-2.5 rounded-lg border border-gray-300 text-gray-900 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-indigo-600 focus:border-indigo-600"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1.5">Password</label>
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
                                    placeholder="••••••••"
                                    className="w-full px-3.5 py-2.5 rounded-lg border border-gray-300 text-gray-900 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-indigo-600 focus:border-indigo-600"
                                />
                            </div>

                            {error && (
                                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-xs">
                                    {error}
                                </div>
                            )}

                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full py-2.5 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-sm transition-colors cursor-pointer disabled:opacity-50 mt-1"
                            >
                                {loading ? "Signing in..." : `Sign In as ${activeRoleConfig?.label}`}
                            </button>
                        </form>

                        <div className="mt-5 text-center text-xs text-gray-500">
                            {role === "customer" && (
                                <p>
                                    Don't have an account?{" "}
                                    <Link href="/register" className="text-indigo-600 hover:text-indigo-700 font-medium">
                                        Sign up
                                    </Link>
                                </p>
                            )}
                            {role === "driver" && (
                                <p>
                                    New driver?{" "}
                                    <Link href="/driver/register" className="text-indigo-600 hover:text-indigo-700 font-medium">
                                        Register here
                                    </Link>
                                </p>
                            )}
                            {role === "admin" && (
                                <p>
                                    Need an account?{" "}
                                    <Link href="/admin/register" className="text-indigo-600 hover:text-indigo-700 font-medium">
                                        Register with secret key
                                    </Link>
                                </p>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
