"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Lock, Key } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

export default function AdminRegisterPage() {
    const router = useRouter();
    const [form, setForm] = useState({ name: "", email: "", password: "", adminSecret: "" });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const set = (k: string, v: string) => setForm(prev => ({ ...prev, [k]: v }));

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true); setError("");
        try {
            const res = await fetch(`${API}/auth/admin/register`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(form),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message);
            localStorage.setItem("adminToken", data.token);
            localStorage.setItem("token", data.token);
            localStorage.setItem("adminProfile", JSON.stringify(data.admin));
            router.push("/admin");
        } catch (err: any) {
            setError(err.message || "Registration failed");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-white">
            <div className="w-full max-w-md bg-white border border-gray-200 rounded-2xl p-8 shadow-sm">
                <div className="text-center mb-8">
                    <div className="w-12 h-12 rounded-full bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 mx-auto mb-3">
                        <Lock className="w-6 h-6" />
                    </div>
                    <h1 className="text-2xl font-bold text-gray-900 mb-1">Create Admin Account</h1>
                    <p className="text-xs text-gray-500">Requires the admin secret key from your server</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    {[
                        { label: "Full Name", key: "name", type: "text", placeholder: "Admin Name" },
                        { label: "Email", key: "email", type: "email", placeholder: "admin@shopmate.com" },
                        { label: "Password (min 8 chars)", key: "password", type: "password", placeholder: "StrongPass@123" },
                    ].map(({ label, key, type, placeholder }) => (
                        <div key={key}>
                            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">{label}</label>
                            <input
                                type={type}
                                value={(form as any)[key]}
                                onChange={e => set(key, e.target.value)}
                                required
                                placeholder={placeholder}
                                className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:border-indigo-600"
                            />
                        </div>
                    ))}

                    <div>
                        <label className="flex items-center gap-1 text-xs font-semibold text-indigo-600 uppercase tracking-wider mb-1">
                            <Key className="w-3.5 h-3.5" />
                            Admin Secret Key
                        </label>
                        <input
                            type="password"
                            value={form.adminSecret}
                            onChange={e => set("adminSecret", e.target.value)}
                            required
                            placeholder="From your ADMIN_SECRET_KEY env variable"
                            className="w-full px-3.5 py-2.5 bg-white border border-indigo-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:border-indigo-600"
                        />
                        <p className="text-[11px] text-gray-400 mt-1">
                            Configured in backend env as <code className="text-indigo-600 font-mono">ADMIN_SECRET_KEY</code>
                        </p>
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
                        {loading ? "Creating..." : "Create Admin Account"}
                    </button>
                </form>

                <p className="text-center mt-6 text-xs text-gray-500">
                    Already have an account?{" "}
                    <Link href="/admin/login" className="text-indigo-600 hover:text-indigo-700 font-semibold">
                        Sign in
                    </Link>
                </p>
            </div>
        </div>
    );
}
