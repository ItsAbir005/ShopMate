"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

export default function AdminLoginPage() {
    const router = useRouter();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true); setError("");
        try {
            const res = await fetch(`${API}/auth/admin/login`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message);
            localStorage.setItem("adminToken", data.token);
            localStorage.setItem("token", data.token);
            localStorage.setItem("adminProfile", JSON.stringify(data.admin));
            router.push("/admin");
        } catch (err: any) {
            setError(err.message || "Login failed");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-white">
            <div className="w-full max-w-md bg-white border border-gray-200 rounded-2xl p-8 shadow-sm">
                <div className="text-center mb-8">
                    <div className="w-12 h-12 rounded-full bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 mx-auto mb-3">
                        <ShieldCheck className="w-6 h-6" />
                    </div>
                    <h1 className="text-2xl font-bold text-gray-900 mb-1">Admin Portal</h1>
                    <p className="text-xs text-gray-500">Sign in to manage your store</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">Email</label>
                        <input
                            type="email"
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            required
                            placeholder="admin@shopmate.com"
                            className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:border-indigo-600"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">Password</label>
                        <input
                            type="password"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            required
                            placeholder="••••••••"
                            className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:border-indigo-600"
                        />
                    </div>

                    {error && (
                        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs font-medium">
                            {error}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm rounded-lg transition-colors disabled:opacity-50 mt-2"
                    >
                        {loading ? "Signing in..." : "Sign In as Admin"}
                    </button>
                </form>

                <p className="text-center mt-6 text-xs text-gray-500">
                    Need an admin account?{" "}
                    <Link href="/admin/register" className="text-indigo-600 hover:text-indigo-700 font-semibold">
                        Register with secret key
                    </Link>
                </p>
            </div>
        </div>
    );
}
