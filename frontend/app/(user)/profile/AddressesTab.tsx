"use client";

import { useAuth } from "../../context/AuthContext";
import { useEffect, useState } from "react";
import { fetchApi } from "../../lib/api";

interface Address {
    _id: string;
    street: string;
    city: string;
    state: string;
    zipCode: string;
    country: string;
    isDefault: boolean;
}

export default function AddressesTab() {
    const [addresses, setAddresses] = useState<Address[]>([]);
    const [loading, setLoading] = useState(true);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [isAdding, setIsAdding] = useState(false);

    const [formData, setFormData] = useState({
        street: "",
        city: "",
        state: "",
        zipCode: "",
        country: "",
        isDefault: false
    });

    const loadAddresses = async () => {
        try {
            setLoading(true);
            const data = await fetchApi("/users/profile");
            setAddresses(data.addresses || []);
        } catch (error) {
            console.error("Failed to load addresses", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadAddresses();
    }, []);

    const resetForm = () => {
        setFormData({ street: "", city: "", state: "", zipCode: "", country: "", isDefault: false });
        setIsAdding(false);
        setEditingId(null);
    };

    const handleEdit = (addr: Address) => {
        setFormData({
            street: addr.street,
            city: addr.city,
            state: addr.state,
            zipCode: addr.zipCode,
            country: addr.country,
            isDefault: addr.isDefault
        });
        setEditingId(addr._id);
        setIsAdding(false);
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            if (editingId) {
                const res = await fetchApi(`/users/addresses/${editingId}`, {
                    method: "PUT",
                    body: JSON.stringify(formData),
                });
                setAddresses(res.addresses);
            } else {
                const res = await fetchApi(`/users/addresses`, {
                    method: "POST",
                    body: JSON.stringify(formData),
                });
                setAddresses(res.addresses);
            }
            resetForm();
        } catch (error: any) {
            alert(error.message || "Failed to save address.");
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Delete this address?")) return;
        try {
            const res = await fetchApi(`/users/addresses/${id}`, {
                method: "DELETE",
            });
            setAddresses(res.addresses);
        } catch (error: any) {
            alert(error.message || "Failed to delete address.");
        }
    };

    const handleSetDefault = async (id: string) => {
        try {
            const res = await fetchApi(`/users/addresses/${id}/default`, {
                method: "PUT",
            });
            setAddresses(res.addresses);
        } catch (error: any) {
            alert(error.message || "Failed to set default address.");
        }
    };

    if (loading) {
        return <div className="animate-pulse h-32 bg-gray-50 border border-gray-200 rounded-lg"></div>;
    }

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center border-b border-gray-200 pb-4">
                <h3 className="text-lg font-bold text-gray-900">Your Addresses</h3>
                {(!isAdding && !editingId) && (
                    <button
                        onClick={() => setIsAdding(true)}
                        className="text-xs font-semibold bg-indigo-50 text-indigo-600 border border-indigo-100 px-3.5 py-1.5 rounded-lg hover:bg-indigo-100 transition-colors"
                    >
                        + Add Address
                    </button>
                )}
            </div>

            {(isAdding || editingId) && (
                <form onSubmit={handleSave} className="bg-gray-50 p-5 rounded-xl border border-gray-200 space-y-4">
                    <h4 className="text-sm font-bold text-gray-900 mb-2">
                        {editingId ? "Edit Address" : "New Address"}
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="md:col-span-2">
                            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">Street Address</label>
                            <input required type="text" value={formData.street} onChange={e => setFormData({ ...formData, street: e.target.value })} className="w-full p-2.5 bg-white rounded-lg border border-gray-200 text-gray-900 text-sm focus:outline-none focus:border-indigo-600" />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">City</label>
                            <input required type="text" value={formData.city} onChange={e => setFormData({ ...formData, city: e.target.value })} className="w-full p-2.5 bg-white rounded-lg border border-gray-200 text-gray-900 text-sm focus:outline-none focus:border-indigo-600" />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">State / Province</label>
                            <input required type="text" value={formData.state} onChange={e => setFormData({ ...formData, state: e.target.value })} className="w-full p-2.5 bg-white rounded-lg border border-gray-200 text-gray-900 text-sm focus:outline-none focus:border-indigo-600" />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">Postal / Zip Code</label>
                            <input required type="text" value={formData.zipCode} onChange={e => setFormData({ ...formData, zipCode: e.target.value })} className="w-full p-2.5 bg-white rounded-lg border border-gray-200 text-gray-900 text-sm focus:outline-none focus:border-indigo-600" />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">Country</label>
                            <input required type="text" value={formData.country} onChange={e => setFormData({ ...formData, country: e.target.value })} className="w-full p-2.5 bg-white rounded-lg border border-gray-200 text-gray-900 text-sm focus:outline-none focus:border-indigo-600" />
                        </div>
                        <div className="md:col-span-2 flex items-center mt-2">
                            <input type="checkbox" id="isDefault" checked={formData.isDefault} onChange={e => setFormData({ ...formData, isDefault: e.target.checked })} className="mr-2 rounded border-gray-300 text-indigo-600 focus:ring-indigo-600" />
                            <label htmlFor="isDefault" className="text-xs text-gray-700 font-medium">Set as default shipping address</label>
                        </div>
                    </div>
                    <div className="flex justify-end gap-2 mt-4">
                        <button type="button" onClick={resetForm} className="px-3.5 py-1.5 text-xs font-semibold text-gray-600 hover:text-gray-900">Cancel</button>
                        <button type="submit" className="px-4 py-1.5 text-xs font-semibold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors">Save Address</button>
                    </div>
                </form>
            )}

            {!isAdding && !editingId && addresses.length === 0 ? (
                <div className="text-center py-8 text-gray-500 text-sm">
                    No addresses saved yet.
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {addresses.map((addr) => (
                        <div key={addr._id} className={`p-4 rounded-xl border ${addr.isDefault ? 'border-indigo-300 bg-indigo-50/30' : 'border-gray-200 bg-white'}`}>
                            <div className="flex justify-between items-start mb-2">
                                {addr.isDefault ? (
                                    <span className="text-[11px] font-bold bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">Default</span>
                                ) : (
                                    <button onClick={() => handleSetDefault(addr._id)} className="text-xs text-gray-500 hover:text-indigo-600">Set as Default</button>
                                )}
                                <div className="flex gap-2">
                                    <button onClick={() => handleEdit(addr)} className="text-xs font-medium text-indigo-600 hover:text-indigo-800">Edit</button>
                                    <button onClick={() => handleDelete(addr._id)} className="text-xs font-medium text-red-600 hover:text-red-800">Delete</button>
                                </div>
                            </div>
                            <p className="text-gray-900 mt-2 font-medium text-sm">{addr.street}</p>
                            <p className="text-gray-500 text-xs">{addr.city}, {addr.state} {addr.zipCode}</p>
                            <p className="text-gray-500 text-xs">{addr.country}</p>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
