"use client";

import { useEffect, useState } from "react";
import { fetchApi } from "../../lib/api";

type NotificationSettings = {
    email: boolean;
    sms: boolean;
    push: boolean;
};

export default function NotificationsTab() {
    const [settings, setSettings] = useState<NotificationSettings>({ email: true, sms: true, push: true });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        const loadSettings = async () => {
            try {
                const data = await fetchApi("/users/profile");
                if (data.notificationSettings) {
                    setSettings(data.notificationSettings);
                }
            } catch (error) {
                console.error("Failed to load settings", error);
            } finally {
                setLoading(false);
            }
        };
        loadSettings();
    }, []);

    const handleChange = async (key: keyof NotificationSettings) => {
        const newSettings = { ...settings, [key]: !settings[key] };
        setSettings(newSettings);

        setSaving(true);
        try {
            await fetchApi("/users/notifications", {
                method: "PUT",
                body: JSON.stringify(newSettings),
            });
        } catch (error: any) {
            setSettings(settings);
            alert("Failed to update preferences");
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return <div className="animate-pulse h-32 bg-gray-50 border border-gray-200 rounded-lg"></div>;
    }

    return (
        <div className="space-y-6">
            <h3 className="text-lg font-bold text-gray-900 border-b border-gray-200 pb-4">Notification Preferences</h3>

            <div className="bg-gray-50 p-5 rounded-xl border border-gray-200 space-y-6">

                <div className="flex items-center justify-between">
                    <div>
                        <h4 className="text-gray-900 font-semibold text-sm">Email Notifications</h4>
                        <p className="text-xs text-gray-500">Receive updates, promotions, and account alerts via email.</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" className="sr-only peer" checked={settings.email} onChange={() => handleChange('email')} disabled={saving} />
                        <div className="w-11 h-6 bg-gray-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                    </label>
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-gray-200">
                    <div>
                        <h4 className="text-gray-900 font-semibold text-sm">SMS Notifications</h4>
                        <p className="text-xs text-gray-500">Get order delivery updates directly to your phone.</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" className="sr-only peer" checked={settings.sms} onChange={() => handleChange('sms')} disabled={saving} />
                        <div className="w-11 h-6 bg-gray-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                    </label>
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-gray-200">
                    <div>
                        <h4 className="text-gray-900 font-semibold text-sm">Push Notifications</h4>
                        <p className="text-xs text-gray-500">Allow browser notifications for immediate updates while active on the site.</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" className="sr-only peer" checked={settings.push} onChange={() => handleChange('push')} disabled={saving} />
                        <div className="w-11 h-6 bg-gray-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                    </label>
                </div>

            </div>
        </div>
    );
}
