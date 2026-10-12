"use client";

import { useAuth } from "./context/AuthContext";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Sparkles, Zap, ShieldCheck, ArrowRight } from "lucide-react";

export default function HomePage() {
    const { user } = useAuth();
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    return (
        <div className="container-custom py-16 sm:py-24 flex flex-col items-center text-center">
            <div className="max-w-3xl mx-auto">
                {mounted && user ? (
                    <>
                        <h1 className="text-4xl sm:text-6xl font-bold tracking-tight text-gray-900 leading-tight mb-6">
                            Welcome back, <span className="text-indigo-600">{user.name}</span>
                        </h1>
                        <p className="text-gray-600 text-lg sm:text-xl max-w-2xl mx-auto mb-10 leading-relaxed">
                            Ready to continue shopping? Browse our newest arrivals and exclusive categories today.
                        </p>
                        <div className="flex flex-col sm:flex-row gap-3 justify-center">
                            <Link
                                href="/products"
                                className="btn btn-primary px-6 py-3 text-base flex items-center justify-center gap-2"
                            >
                                <span>Continue Shopping</span>
                                <ArrowRight className="w-4 h-4" />
                            </Link>
                            <Link
                                href="/profile"
                                className="btn bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 px-6 py-3 text-base"
                            >
                                View Profile
                            </Link>
                        </div>
                    </>
                ) : (
                    <>
                        <h1 className="text-4xl sm:text-6xl font-bold tracking-tight text-gray-900 leading-tight mb-6">
                            Modern Shopping <br className="hidden sm:inline" />
                            <span className="text-gray-900">Made Effortless</span>
                        </h1>
                        <p className="text-gray-600 text-lg sm:text-xl max-w-2xl mx-auto mb-10 leading-relaxed">
                            Discover curated quality products, transparent pricing, and instant real-time order tracking with ShopMate.
                        </p>
                        <div className="flex flex-col sm:flex-row gap-3 justify-center">
                            <Link
                                href="/products"
                                className="btn btn-primary px-6 py-3 text-base flex items-center justify-center gap-2"
                            >
                                <span>Explore Products</span>
                                <ArrowRight className="w-4 h-4" />
                            </Link>
                            <Link
                                href="/register"
                                className="btn bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 px-6 py-3 text-base"
                            >
                                Create Account
                            </Link>
                        </div>
                    </>
                )}
            </div>

            <div className="mt-20 w-full grid grid-cols-1 md:grid-cols-3 gap-6 text-left">
                <div className="card bg-white border border-gray-200 rounded-xl p-6 shadow-xs">
                    <div className="h-10 w-10 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center mb-4 text-indigo-600">
                        <Sparkles className="w-5 h-5" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">Curated Selection</h3>
                    <p className="text-gray-600 text-sm leading-relaxed">Carefully sourced products designed to match high quality standards.</p>
                </div>
                <div className="card bg-white border border-gray-200 rounded-xl p-6 shadow-xs">
                    <div className="h-10 w-10 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center mb-4 text-indigo-600">
                        <Zap className="w-5 h-5" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">Fast Fulfillment</h3>
                    <p className="text-gray-600 text-sm leading-relaxed">Prompt order processing with dedicated live map tracking on every delivery.</p>
                </div>
                <div className="card bg-white border border-gray-200 rounded-xl p-6 shadow-xs">
                    <div className="h-10 w-10 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center mb-4 text-indigo-600">
                        <ShieldCheck className="w-5 h-5" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">Secure Payments</h3>
                    <p className="text-gray-600 text-sm leading-relaxed">Bank-grade end-to-end payment security with trusted payment providers.</p>
                </div>
            </div>
        </div>
    );
}
