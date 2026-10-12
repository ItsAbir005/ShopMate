"use client";

import { useState } from "react";
import { fetchApi } from "../../lib/api";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CheckCircle } from "lucide-react";

export default function RegisterPage() {
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [success, setSuccess] = useState(false);
    const router = useRouter();

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        try {
            await fetchApi("/auth/register", {
                method: "POST",
                body: JSON.stringify({ name, email, password }),
            });
            setSuccess(true);
            setTimeout(() => {
                router.push("/login");
            }, 2000);
        } catch (err: any) {
            setError(err.message || "Registration failed");
        }
    };

    if (success) {
        return (
            <div className="container-custom flex justify-center items-center min-h-[80vh] px-4">
                <div className="card w-full max-w-[420px] text-center bg-white border border-gray-200 rounded-xl p-8 shadow-xs">
                    <div className="flex justify-center mb-4">
                        <CheckCircle className="w-12 h-12 text-emerald-600" />
                    </div>
                    <h2 className="text-xl font-bold mb-2 text-gray-900">Registration Successful</h2>
                    <p className="text-sm text-gray-600">Redirecting you to sign in...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="container-custom flex justify-center items-center min-h-[85vh] px-4 py-12">
            <div className="w-full max-w-[420px] bg-white border border-gray-200 rounded-xl p-8 shadow-xs">
                <h2 className="text-2xl font-bold mb-2 text-center text-gray-900">Create Account</h2>
                <p className="text-sm text-gray-600 text-center mb-6">Join ShopMate to start shopping and tracking orders</p>
                
                {error && (
                    <div className="text-red-600 mb-5 p-3 bg-red-50 border border-red-200 rounded-lg text-xs">
                        {error}
                    </div>
                )}
                
                <form onSubmit={handleRegister} className="flex flex-col gap-4">
                    <div>
                        <label className="block mb-1.5 text-xs font-medium text-gray-700">Full Name</label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            required
                            autoComplete="name"
                            placeholder="John Doe"
                            className="w-full px-3.5 py-2.5 rounded-lg border border-gray-300 bg-white text-gray-900 text-sm outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 transition-colors placeholder:text-gray-400"
                        />
                    </div>
                    <div>
                        <label className="block mb-1.5 text-xs font-medium text-gray-700">Email Address</label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            autoComplete="email"
                            placeholder="john@example.com"
                            className="w-full px-3.5 py-2.5 rounded-lg border border-gray-300 bg-white text-gray-900 text-sm outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 transition-colors placeholder:text-gray-400"
                        />
                    </div>
                    <div>
                        <label className="block mb-1.5 text-xs font-medium text-gray-700">Password</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            autoComplete="new-password"
                            placeholder="••••••••"
                            className="w-full px-3.5 py-2.5 rounded-lg border border-gray-300 bg-white text-gray-900 text-sm outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 transition-colors placeholder:text-gray-400"
                        />
                    </div>
                    <button
                        type="submit"
                        className="w-full py-2.5 px-4 mt-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-sm transition-colors cursor-pointer"
                    >
                        Sign Up
                    </button>
                </form>
                
                <p className="mt-6 text-center text-xs text-gray-500">
                    Already have an account?{" "}
                    <Link href="/login" className="text-indigo-600 hover:text-indigo-700 font-medium">
                        Sign in
                    </Link>
                </p>
            </div>
        </div>
    );
}
