"use client";

import { createContext, useContext, useState, useCallback, useRef, ReactNode } from "react";
import { CheckCircle2, XCircle, Info, AlertTriangle, X } from "lucide-react";

type ToastType = "success" | "error" | "info" | "warning";

interface Toast {
    id: string;
    type: ToastType;
    title: string;
    message?: string;
}

interface ToastContextValue {
    toast: (type: ToastType, title: string, message?: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export const useToast = () => {
    const ctx = useContext(ToastContext);
    if (!ctx) throw new Error("useToast must be used within ToastProvider");
    return ctx;
};

const ICONS = {
    success: CheckCircle2,
    error: XCircle,
    info: Info,
    warning: AlertTriangle,
};

const ICON_COLORS = {
    success: "text-emerald-600",
    error: "text-red-600",
    info: "text-indigo-600",
    warning: "text-amber-600",
};

const BORDER_COLORS = {
    success: "border-l-emerald-500",
    error: "border-l-red-500",
    info: "border-l-indigo-500",
    warning: "border-l-amber-500",
};

function ToastItem({ toast, onRemove }: { toast: Toast; onRemove: (id: string) => void }) {
    const Icon = ICONS[toast.type];
    const iconColor = ICON_COLORS[toast.type];
    const borderLeft = BORDER_COLORS[toast.type];

    return (
        <div className={`bg-white border border-gray-200 border-l-4 ${borderLeft} rounded-xl p-4 flex items-start gap-3 min-w-[300px] max-w-sm shadow-md animate-in slide-in-from-right-5 duration-200`}>
            <Icon className={`w-5 h-5 flex-shrink-0 mt-0.5 ${iconColor}`} />
            <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm text-gray-900 leading-tight">
                    {toast.title}
                </p>
                {toast.message && (
                    <p className="text-xs text-gray-500 mt-1 leading-normal">
                        {toast.message}
                    </p>
                )}
            </div>
            <button
                onClick={() => onRemove(toast.id)}
                className="text-gray-400 hover:text-gray-600 p-0.5 rounded transition-colors flex-shrink-0"
            >
                <X className="w-4 h-4" />
            </button>
        </div>
    );
}

export function ToastProvider({ children }: { children: ReactNode }) {
    const [toasts, setToasts] = useState<Toast[]>([]);
    const timerRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

    const remove = useCallback((id: string) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
        clearTimeout(timerRef.current[id]);
        delete timerRef.current[id];
    }, []);

    const toast = useCallback(
        (type: ToastType, title: string, message?: string) => {
            const id = Math.random().toString(36).slice(2);
            setToasts((prev) => [...prev.slice(-4), { id, type, title, message }]);
            timerRef.current[id] = setTimeout(() => remove(id), 4500);
        },
        [remove]
    );

    return (
        <ToastContext.Provider value={{ toast }}>
            {children}

            {/* Toast Container */}
            <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2.5 items-end pointer-events-none">
                {toasts.map((t) => (
                    <div key={t.id} className="pointer-events-auto">
                        <ToastItem toast={t} onRemove={remove} />
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
}
