"use client";

import { useAuth } from "../../context/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect, useState, useRef } from "react";
import { fetchApi } from "../../lib/api";

import AddressesTab from "./AddressesTab";
import NotificationsTab from "./NotificationsTab";

export default function ProfilePage() {
    const { user, loading, logout, setUser } = useAuth();
    const router = useRouter();
    const [mounted, setMounted] = useState(false);

    const [activeTab, setActiveTab] = useState<"account" | "addresses" | "notifications">("account");
    const [isEditing, setIsEditing] = useState(false);
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [saving, setSaving] = useState(false);
    const [uploading, setUploading] = useState(false);

    // Password change states
    const [showPasswordChange, setShowPasswordChange] = useState(false);
    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [changingPassword, setChangingPassword] = useState(false);

    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        if (!loading && !user && mounted) {
            router.push("/login");
        } else if (user) {
            setName(user.name);
            setEmail(user.email);
        }
    }, [user, loading, router, mounted]);

    if (!mounted || loading) {
        return (
            <div className="max-w-4xl mx-auto px-4 mt-16 flex justify-center items-center min-h-[60vh]">
                <div className="h-8 w-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
            </div>
        );
    }

    if (!user) return null;

    const handleSaveProfile = async () => {
        setSaving(true);
        try {
            const data = await fetchApi("/users/profile", {
                method: "PUT",
                body: JSON.stringify({ name, email }),
            });
            setUser(data.user);
            setIsEditing(false);
            alert("Profile updated successfully!");
        } catch (error) {
            alert("Failed to update profile.");
            console.error(error);
        } finally {
            setSaving(false);
        }
    };

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploading(true);
        const formData = new FormData();
        formData.append("profileImage", file);

        try {
            const token = localStorage.getItem("token");
            const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
            const res = await fetch(`${API}/users/profile/image`, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${token}`
                },
                body: formData
            });

            if (!res.ok) throw new Error("Upload failed");

            const data = await res.json();
            setUser(data.user);
            alert("Profile image uploaded successfully!");
        } catch (error) {
            alert("Failed to upload image.");
            console.error(error);
        } finally {
            setUploading(false);
        }
    };

    const handleChangePassword = async () => {
        if (newPassword !== confirmPassword) {
            alert("New passwords do not match!");
            return;
        }
        setChangingPassword(true);
        try {
            await fetchApi("/users/profile/password", {
                method: "PUT",
                body: JSON.stringify({ currentPassword, newPassword }),
            });
            alert("Password changed successfully!");
            setShowPasswordChange(false);
            setCurrentPassword("");
            setNewPassword("");
            setConfirmPassword("");
        } catch (error: any) {
            alert(error.message || "Failed to change password.");
        } finally {
            setChangingPassword(false);
        }
    };

    const handleDeleteAccount = async () => {
        if (confirm("Are you ABSOLUTELY sure you want to delete your account? This cannot be undone.")) {
            try {
                await fetchApi("/users/profile", {
                    method: "DELETE",
                });
                alert("Account deleted.");
                logout();
            } catch (error: any) {
                alert(error.message || "Failed to delete account.");
            }
        }
    };

    return (
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12 min-h-[80vh] bg-white">
            <h1 className="text-3xl font-bold text-gray-900 mb-8">Your Profile</h1>

            <div className="flex border-b border-gray-200 mb-8 overflow-x-auto">
                <button
                    onClick={() => setActiveTab("account")}
                    className={`px-5 py-3 font-semibold text-sm whitespace-nowrap border-b-2 transition-colors ${activeTab === "account" ? "border-indigo-600 text-indigo-600" : "border-transparent text-gray-500 hover:text-gray-900"}`}
                >
                    Account Settings
                </button>
                <button
                    onClick={() => setActiveTab("addresses")}
                    className={`px-5 py-3 font-semibold text-sm whitespace-nowrap border-b-2 transition-colors ${activeTab === "addresses" ? "border-indigo-600 text-indigo-600" : "border-transparent text-gray-500 hover:text-gray-900"}`}
                >
                    Saved Addresses
                </button>
                <button
                    onClick={() => setActiveTab("notifications")}
                    className={`px-5 py-3 font-semibold text-sm whitespace-nowrap border-b-2 transition-colors ${activeTab === "notifications" ? "border-indigo-600 text-indigo-600" : "border-transparent text-gray-500 hover:text-gray-900"}`}
                >
                    Notifications
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {/* User card */}
                <div className="bg-white border border-gray-200 rounded-xl p-6 md:col-span-1 h-fit text-center">
                    <div
                        className="relative w-28 h-28 rounded-full mx-auto mb-4 bg-indigo-50 text-indigo-600 flex items-center justify-center text-3xl font-bold cursor-pointer overflow-hidden border-2 border-indigo-200 group"
                        onClick={() => fileInputRef.current?.click()}
                    >
                        {uploading ? (
                            <div className="h-6 w-6 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
                        ) : user.profileImage ? (
                            <img src={user.profileImage} alt="Profile" className="w-full h-full object-cover" />
                        ) : (
                            user.name.charAt(0).toUpperCase()
                        )}
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center transition-opacity text-white">
                            <span className="text-xs font-semibold">Change</span>
                        </div>
                    </div>
                    <input
                        type="file"
                        ref={fileInputRef}
                        className="hidden"
                        accept="image/*"
                        onChange={handleImageUpload}
                    />

                    <h2 className="text-xl font-bold text-gray-900 mb-1">{user.name}</h2>
                    <p className="text-sm text-gray-500 mb-6">{user.email}</p>

                    <button
                        onClick={logout}
                        className="w-full py-2.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 text-sm font-semibold transition-colors"
                    >
                        Log Out
                    </button>
                </div>

                {/* Tab content */}
                <div className="bg-white border border-gray-200 rounded-xl p-6 md:col-span-2">
                    {activeTab === "account" && (
                        <>
                            <div className="flex justify-between items-center mb-6 border-b border-gray-200 pb-4">
                                <h3 className="text-lg font-bold text-gray-900">Account Details</h3>
                                <button
                                    onClick={() => setIsEditing(!isEditing)}
                                    className="text-xs font-semibold text-indigo-600 hover:text-indigo-800"
                                >
                                    {isEditing ? "Cancel" : "Edit Profile"}
                                </button>
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">Full Name</label>
                                    {isEditing ? (
                                        <input
                                            type="text"
                                            value={name}
                                            onChange={(e) => setName(e.target.value)}
                                            className="w-full p-2.5 bg-white rounded-lg border border-gray-200 text-gray-900 text-sm focus:outline-none focus:border-indigo-600"
                                        />
                                    ) : (
                                        <div className="p-2.5 bg-gray-50 rounded-lg border border-gray-200 text-gray-900 text-sm">
                                            {user.name}
                                        </div>
                                    )}
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">Email Address</label>
                                    {isEditing ? (
                                        <input
                                            type="email"
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            className="w-full p-2.5 bg-white rounded-lg border border-gray-200 text-gray-900 text-sm focus:outline-none focus:border-indigo-600"
                                        />
                                    ) : (
                                        <div className="p-2.5 bg-gray-50 rounded-lg border border-gray-200 text-gray-900 text-sm">
                                            {user.email}
                                        </div>
                                    )}
                                </div>

                                {isEditing && (
                                    <button
                                        onClick={handleSaveProfile}
                                        disabled={saving}
                                        className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg text-sm transition-colors mt-2"
                                    >
                                        {saving ? "Saving..." : "Save Changes"}
                                    </button>
                                )}
                            </div>

                            <div className="mt-8 pt-6 border-t border-gray-200">
                                <div className="flex justify-between items-center mb-4">
                                    <h3 className="text-lg font-bold text-gray-900">Security</h3>
                                    <button
                                        onClick={() => setShowPasswordChange(!showPasswordChange)}
                                        className="text-xs font-semibold text-indigo-600 hover:text-indigo-800"
                                    >
                                        {showPasswordChange ? "Cancel" : "Change Password"}
                                    </button>
                                </div>

                                {showPasswordChange && (
                                    <div className="space-y-3 mb-6 p-4 bg-gray-50 rounded-xl border border-gray-200">
                                        <div>
                                            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">Current Password</label>
                                            <input
                                                type="password"
                                                value={currentPassword}
                                                onChange={(e) => setCurrentPassword(e.target.value)}
                                                className="w-full p-2.5 bg-white rounded-lg border border-gray-200 text-gray-900 text-sm focus:outline-none focus:border-indigo-600"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">New Password</label>
                                            <input
                                                type="password"
                                                value={newPassword}
                                                onChange={(e) => setNewPassword(e.target.value)}
                                                className="w-full p-2.5 bg-white rounded-lg border border-gray-200 text-gray-900 text-sm focus:outline-none focus:border-indigo-600"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">Confirm New Password</label>
                                            <input
                                                type="password"
                                                value={confirmPassword}
                                                onChange={(e) => setConfirmPassword(e.target.value)}
                                                className="w-full p-2.5 bg-white rounded-lg border border-gray-200 text-gray-900 text-sm focus:outline-none focus:border-indigo-600"
                                            />
                                        </div>
                                        <button
                                            onClick={handleChangePassword}
                                            disabled={changingPassword}
                                            className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg text-sm transition-colors mt-2"
                                        >
                                            {changingPassword ? "Updating..." : "Update Password"}
                                        </button>
                                    </div>
                                )}

                                <div className="mt-6 p-5 bg-red-50 rounded-xl border border-red-200 text-center">
                                    <h4 className="text-base font-bold text-red-700 mb-1">Danger Zone</h4>
                                    <p className="text-xs text-gray-600 mb-4">
                                        Once you delete your account, there is no going back.
                                    </p>
                                    <button
                                        onClick={handleDeleteAccount}
                                        className="px-6 py-2 bg-red-600 text-white font-semibold rounded-lg text-xs hover:bg-red-700 transition-colors"
                                    >
                                        Delete Account
                                    </button>
                                </div>
                            </div>
                        </>
                    )}

                    {activeTab === "addresses" && <AddressesTab />}
                    {activeTab === "notifications" && <NotificationsTab />}
                </div>
            </div>
        </div>
    );
}
