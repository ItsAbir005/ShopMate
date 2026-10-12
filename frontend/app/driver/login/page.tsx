"use client";

import { useState } from "react";
import { useDriver } from "../../context/DriverContext";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Truck, AlertCircle } from "lucide-react";

export default function DriverLoginPage() {
    const { login } = useDriver();
    const router = useRouter();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError("");
        try {
            await login(email, password);
            router.push("/driver/dashboard");
        } catch (err: any) {
            setError(err.message || "Login failed");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-white px-4 py-12">
            <div className="w-full max-w-md bg-white border border-gray-200 rounded-xl p-8 shadow-xs">
                {/* Header */}
                <div className="text-center mb-8">
                    <div className="w-12 h-12 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 mx-auto mb-3">
                        <Truck className="w-6 h-6" />
                    </div>
                    <h1 className="text-2xl font-bold text-gray-900 mb-1">Driver Portal</h1>
                    <p className="text-xs text-gray-500">Sign in to your delivery account</p>
                </div>

                <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                    <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1.5">Email address</label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            autoComplete="username"
                            placeholder="driver@example.com"
                            className="w-full px-3.5 py-2.5 rounded-lg border border-gray-300 bg-white text-gray-900 text-sm outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 placeholder:text-gray-400"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1.5">Password</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            autoComplete="current-password"
                            placeholder="••••••••"
                            className="w-full px-3.5 py-2.5 rounded-lg border border-gray-300 bg-white text-gray-900 text-sm outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 placeholder:text-gray-400"
                        />
                    </div>

                    {error && (
                        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-xs flex items-center gap-2">
                            <AlertCircle className="w-4 h-4 shrink-0" />
                            <span>{error}</span>
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full py-2.5 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-sm transition-colors cursor-pointer disabled:opacity-50 mt-1"
                    >
                        {loading ? "Signing in..." : "Sign In"}
                    </button>
                </form>

                <p className="text-center mt-6 text-xs text-gray-500">
                    New driver?{" "}
                    <Link href="/driver/register" className="text-indigo-600 hover:text-indigo-700 font-medium">
                        Register an account
                    </Link>
                </p>
            </div>
        </div>
    );
}
