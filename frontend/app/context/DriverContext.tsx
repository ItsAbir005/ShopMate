"use client";

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { io, Socket } from "socket.io-client";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:4000";

interface DriverProfile {
    id: string;
    name: string;
    email: string;
    phone: string;
    vehicleNumber: string;
    vehicleType: string;
    status: "offline" | "online" | "busy";
    isAvailable: boolean;
}

interface DriverContextValue {
    driver: DriverProfile | null;
    token: string | null;
    socket: Socket | null;
    loading: boolean;
    login: (email: string, password: string) => Promise<void>;
    logout: () => void;
    setOnlineStatus: (status: "online" | "offline", lat?: number, lng?: number) => Promise<void>;
    updateLocation: (lat: number, lng: number) => Promise<void>;
    fetchWithAuth: (path: string, opts?: RequestInit) => Promise<any>;
}

const DriverContext = createContext<DriverContextValue | null>(null);

export const useDriver = () => {
    const ctx = useContext(DriverContext);
    if (!ctx) throw new Error("useDriver must be used inside DriverProvider");
    return ctx;
};

export function DriverProvider({ children }: { children: ReactNode }) {
    const [driver, setDriver] = useState<DriverProfile | null>(null);
    const [token, setToken] = useState<string | null>(null);
    const [socket, setSocket] = useState<Socket | null>(null);
    const [loading, setLoading] = useState(true);

    // Hydrate from localStorage on mount
    useEffect(() => {
        const saved = localStorage.getItem("driverToken");
        const savedDriver = localStorage.getItem("driverProfile");
        if (saved && savedDriver) {
            setToken(saved);
            setDriver(JSON.parse(savedDriver));
        }
        setLoading(false);
    }, []);

    // Connect Socket.io when driver logs in
    useEffect(() => {
        if (!token) { setSocket(null); return; }
        const s = io(SOCKET_URL, { auth: { token } });
        s.on("delivery:assigned", (data: any) => {
            // Store in localStorage so dashboard can refresh
            localStorage.setItem("pendingDelivery", JSON.stringify(data));
            // Dispatch a CustomEvent so dashboard can read the shipment details
            window.dispatchEvent(new CustomEvent("deliveryAssigned", { detail: data }));
        });
        setSocket(s);
        return () => { s.disconnect(); };
    }, [token]);

    const fetchWithAuth = useCallback(async (path: string, opts: RequestInit = {}) => {
        const t = token || localStorage.getItem("driverToken");
        const res = await fetch(`${API}${path}`, {
            ...opts,
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${t}`,
                ...(opts.headers || {}),
            },
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || "Request failed");
        return data;
    }, [token]);

    const login = async (email: string, password: string) => {
        const res = await fetch(`${API}/drivers/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || "Login failed");
        setToken(data.token);
        setDriver(data.driver);
        localStorage.setItem("driverToken", data.token);
        localStorage.setItem("driverProfile", JSON.stringify(data.driver));
    };

    const logout = () => {
        setToken(null);
        setDriver(null);
        socket?.disconnect();
        localStorage.removeItem("driverToken");
        localStorage.removeItem("driverProfile");
    };

    const setOnlineStatus = async (status: "online" | "offline", lat?: number, lng?: number) => {
        const updated = await fetchWithAuth("/drivers/status", {
            method: "PUT",
            body: JSON.stringify({ status, lat, lng }),
        });
        setDriver((prev) => prev ? { ...prev, status: updated.status, isAvailable: updated.isAvailable } : prev);
        const saved = localStorage.getItem("driverProfile");
        if (saved) {
            const parsed = JSON.parse(saved);
            localStorage.setItem("driverProfile", JSON.stringify({ ...parsed, status: updated.status }));
        }
    };

    const updateLocation = async (lat: number, lng: number) => {
        await fetchWithAuth("/drivers/location", {
            method: "PUT",
            body: JSON.stringify({ lat, lng }),
        });
    };

    return (
        <DriverContext.Provider value={{ driver, token, socket, loading, login, logout, setOnlineStatus, updateLocation, fetchWithAuth }}>
            {children}
        </DriverContext.Provider>
    );
}
