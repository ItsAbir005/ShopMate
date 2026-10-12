"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Truck, CheckCircle, AlertCircle } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

export default function DriverRegisterPage() {
    const router = useRouter();
    const [form, setForm] = useState({
        name: "", email: "", password: "", phone: "",
        vehicleNumber: "", vehicleType: "bike", licenseNumber: "",
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [successMessage, setSuccessMessage] = useState("");

    const set = (k: string, v: string) => setForm(prev => ({ ...prev, [k]: v }));

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError("");
        try {
            const res = await fetch(`${API}/drivers/register`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(form),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message);
            setSuccessMessage("Registration successful! Your account is pending admin approval.");
        } catch (err: any) {
            setError(err.message || "Registration failed");
        } finally {
            setLoading(false);
        }
    };

    const field = (label: string, key: string, type = "text", placeholder = "") => (
        <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">{label}</label>
            <input
                type={type}
                value={(form as any)[key]}
                autoComplete={type === 'password' ? 'new-password' : type === 'email' ? 'email' : 'off'}
                onChange={e => set(key, e.target.value)}
                required
                placeholder={placeholder}
                className="w-full px-3.5 py-2 rounded-lg border border-gray-300 bg-white text-gray-900 text-sm outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 placeholder:text-gray-400"
            />
        </div>
    );

    return (
        <div className="min-h-screen flex items-center justify-center bg-white px-4 py-12">
            <div className="w-full max-w-lg bg-white border border-gray-200 rounded-xl p-8 shadow-xs">
                <div className="text-center mb-6">
                    <div className="w-12 h-12 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 mx-auto mb-3">
                        <Truck className="w-6 h-6" />
                    </div>
                    <h1 className="text-2xl font-bold text-gray-900 mb-1">Become a Driver</h1>
                    <p className="text-xs text-gray-500">Register your delivery account</p>
                </div>

                {successMessage ? (
                    <div className="text-center py-6">
                        <div className="w-14 h-14 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 mx-auto mb-4">
                            <CheckCircle className="w-7 h-7" />
                        </div>
                        <h2 className="text-base font-bold text-gray-900 mb-2">Registration Submitted</h2>
                        <p className="text-xs text-gray-600 leading-relaxed mb-6">
                            {successMessage} You can sign in once approved by the admin team.
                        </p>
                        <Link
                            href="/driver/login"
                            className="inline-block w-full py-2.5 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-xs transition-colors"
                        >
                            Go to Driver Login
                        </Link>
                    </div>
                ) : (
                    <>
                        <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                                {field("Full Name", "name", "text", "Rahul Kumar")}
                                {field("Phone", "phone", "tel", "9876543210")}
                            </div>
                            {field("Email", "email", "email", "driver@example.com")}
                            {field("Password", "password", "password", "min 6 chars")}

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                                <div>
                                    <label className="block text-xs font-medium text-gray-700 mb-1.5">Vehicle Type</label>
                                    <select
                                        value={form.vehicleType}
                                        onChange={e => set("vehicleType", e.target.value)}
                                        className="w-full px-3.5 py-2 rounded-lg border border-gray-300 bg-white text-gray-900 text-sm outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600"
                                    >
                                        <option value="bike">Bike / Motorcycle</option>
                                        <option value="scooter">Scooter</option>
                                        <option value="car">Car</option>
                                        <option value="van">Van</option>
                                    </select>
                                </div>
                                {field("Vehicle Number", "vehicleNumber", "text", "MH 01 AB 1234")}
                            </div>

                            {field("License Number", "licenseNumber", "text", "DL-1420110012345")}

                            {error && (
                                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-xs flex items-center gap-2">
                                    <AlertCircle className="w-4 h-4 shrink-0" />
                                    <span>{error}</span>
                                </div>
                            )}

                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full py-2.5 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-xs transition-colors cursor-pointer disabled:opacity-50 mt-2"
                            >
                                {loading ? "Submitting application…" : "Submit Driver Application"}
                            </button>
                        </form>

                        <p className="text-center mt-5 text-xs text-gray-500">
                            Already registered?{" "}
                            <Link href="/driver/login" className="text-indigo-600 hover:text-indigo-700 font-medium">
                                Sign in
                            </Link>
                        </p>
                    </>
                )}
            </div>
        </div>
    );
}
