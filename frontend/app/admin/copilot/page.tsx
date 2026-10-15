"use client";

import { useState, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import { fetchApi } from "../../lib/api";
import {
    Sparkles,
    Send,
    Bot,
    User,
    CheckCircle2,
    AlertCircle,
    Check,
    X,
    Receipt,
    RefreshCw,
    Wrench,
    FileText,
    TrendingUp,
    ShieldAlert
} from "lucide-react";

interface ToolCallInfo {
    toolName: string;
    summary: string;
    ok?: boolean;
    status?: number;
    errorName?: string;
    message?: string;
    resultCount?: number;
    subtitle?: string;
}

interface ProposedAction {
    id: string;
    toolName: string;
    parameters: any;
    summary: string;
}

interface Message {
    id: string;
    role: "user" | "assistant";
    text: string;
    timestamp: Date;
    toolCalls?: ToolCallInfo[];
    proposedAction?: ProposedAction;
    actionExecuted?: boolean;
    actionResult?: any;
    canSummarize?: boolean;
    summarized?: boolean;
}

const QUICK_CHIPS = [
    { id: "transactions", label: "Recent Transactions", icon: Receipt },
    { id: "insights", label: "Merchant Insights", icon: TrendingUp },
    { id: "disputes", label: "Open Disputes", icon: ShieldAlert },
    { id: "invoices", label: "List Invoices", icon: FileText },
];

export default function AdminCopilotPage() {
    const [messages, setMessages] = useState<Message[]>([
        {
            id: "welcome",
            role: "assistant",
            text: "Hello! I am your **ShopMate AI Copilot**, connected directly to your PayPal account via the official **PayPal Agent Toolkit**.\n\nI can inspect your transactions, pull merchant analytics, check customer disputes, or draft invoices. Write operations will always ask for your explicit confirmation first.",
            timestamp: new Date(),
        },
    ]);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const [executingActionId, setExecutingActionId] = useState<string | null>(null);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, loading]);

    const handleSend = async (textToSend?: string) => {
        const text = (textToSend || input).trim();
        if (!text || loading) return;

        setInput("");
        const userMsg: Message = {
            id: `usr_${Date.now()}`,
            role: "user",
            text,
            timestamp: new Date(),
        };

        setMessages((prev) => [...prev, userMsg]);
        setLoading(true);

        try {
            const token = localStorage.getItem("adminToken");
            const history = messages.slice(-6).map((m) => ({
                role: m.role,
                text: m.text,
            }));

            const response = await fetchApi("/ai/merchant", {
                method: "POST",
                body: JSON.stringify({ message: text, history }),
                token: token || undefined,
            });

            const assistantMsg: Message = {
                id: `ast_${Date.now()}`,
                role: "assistant",
                text: response.text || "I have processed your request.",
                timestamp: new Date(),
                toolCalls: response.toolCalls || [],
                proposedAction: response.proposedAction,
            };

            setMessages((prev) => [...prev, assistantMsg]);
        } catch (err: any) {
            setMessages((prev) => [
                ...prev,
                {
                    id: `err_${Date.now()}`,
                    role: "assistant",
                    text: `Error connecting to Copilot: ${err.message || "Unknown error"}. Please check your network or API keys.`,
                    timestamp: new Date(),
                },
            ]);
        } finally {
            setLoading(false);
            setTimeout(() => inputRef.current?.focus(), 100);
        }
    };

    const handleQuickChip = async (chipId: string, label: string) => {
        if (loading) return;
        setInput("");

        const userMsg: Message = {
            id: `usr_${Date.now()}`,
            role: "user",
            text: `View ${label}`,
            timestamp: new Date(),
        };

        setMessages((prev) => [...prev, userMsg]);
        setLoading(true);

        try {
            const token = localStorage.getItem("adminToken");
            const res = await fetchApi("/ai/merchant/quick-chip", {
                method: "POST",
                body: JSON.stringify({ chipType: chipId }),
                token: token || undefined,
            });

            const assistantMsg: Message = {
                id: `ast_${Date.now()}`,
                role: "assistant",
                text: res.text,
                timestamp: new Date(),
                toolCalls: res.toolCalls || [],
                canSummarize: res.canSummarize !== false,
            };

            setMessages((prev) => [...prev, assistantMsg]);
        } catch (err: any) {
            setMessages((prev) => [
                ...prev,
                {
                    id: `err_${Date.now()}`,
                    role: "assistant",
                    text: `Failed to load ${label}: ${err.message || "Unknown error"}`,
                    timestamp: new Date(),
                },
            ]);
        } finally {
            setLoading(false);
            setTimeout(() => inputRef.current?.focus(), 100);
        }
    };

    const handleSummarize = (msgId: string, text: string) => {
        setMessages((prev) =>
            prev.map((m) => (m.id === msgId ? { ...m, summarized: true } : m))
        );
        handleSend(`Please provide a concise executive summary and key business takeaways for this data:\n\n${text}`);
    };

    const handleConfirmAction = async (msgId: string, action: ProposedAction) => {
        setExecutingActionId(action.id);
        try {
            const token = localStorage.getItem("adminToken");
            const res = await fetchApi("/ai/merchant/action", {
                method: "POST",
                body: JSON.stringify({
                    toolName: action.toolName,
                    parameters: action.parameters,
                }),
                token: token || undefined,
            });

            setMessages((prev) =>
                prev.map((m) => {
                    if (m.id === msgId) {
                        return {
                            ...m,
                            actionExecuted: true,
                            actionResult: res.result,
                            toolCalls: [
                                ...(m.toolCalls || []),
                                {
                                    toolName: action.toolName,
                                    summary: res.summary || `Executed ${action.toolName} successfully`,
                                },
                            ],
                        };
                    }
                    return m;
                })
            );
        } catch (err: any) {
            alert(`Failed to execute action: ${err.message}`);
        } finally {
            setExecutingActionId(null);
        }
    };

    const handleCancelAction = (msgId: string) => {
        setMessages((prev) =>
            prev.map((m) => {
                if (m.id === msgId) {
                    return {
                        ...m,
                        proposedAction: undefined,
                    };
                }
                return m;
            })
        );
    };

    return (
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 bg-white min-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="flex items-start justify-between pb-6 border-b border-gray-200 flex-wrap gap-4">
                <div>
                    <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
                            <Sparkles className="w-4 h-4" />
                        </div>
                        <h1 className="text-2xl font-bold text-gray-900">AI Copilot</h1>
                        <span className="text-xs px-2.5 py-0.5 rounded-full font-medium bg-blue-50 text-blue-700 border border-blue-200">
                            PayPal Agent Toolkit
                        </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                        Ask questions about your transactions, customer disputes, analytics, or draft new invoices with human-in-the-loop confirmation.
                    </p>
                </div>

                {/* Quick actions bar */}
                <div className="flex items-center gap-2 flex-wrap">
                    {QUICK_CHIPS.map(({ id, label, icon: Icon }) => (
                        <button
                            key={id}
                            onClick={() => handleQuickChip(id, label)}
                            disabled={loading}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-xs font-medium text-gray-700 hover:text-indigo-600 hover:border-indigo-200 transition-colors cursor-pointer disabled:opacity-50"
                        >
                            <Icon className="w-3.5 h-3.5 text-indigo-600" />
                            <span>{label}</span>
                        </button>
                    ))}
                </div>
            </div>

            {/* Chat Messages */}
            <div className="flex-1 overflow-y-auto py-6 space-y-4 min-h-[400px]">
                {messages.map((m) => {
                    const isUser = m.role === "user";
                    return (
                        <div key={m.id} className={`flex gap-3 ${isUser ? "justify-end" : "justify-start"}`}>
                            {!isUser && (
                                <div className="w-8 h-8 rounded-full bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0 mt-0.5">
                                    <Bot className="w-4 h-4" />
                                </div>
                            )}

                            <div className={`max-w-2xl ${isUser ? "items-end" : "items-start"} flex flex-col`}>
                                <div
                                    className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                                        isUser
                                            ? "bg-indigo-600 text-white rounded-br-xs"
                                            : "bg-white border border-gray-200 text-gray-900 rounded-bl-xs shadow-xs"
                                    }`}
                                >
                                    {isUser ? (
                                        <div className="whitespace-pre-wrap">{m.text}</div>
                                    ) : (
                                        <div className="prose prose-sm max-w-none text-gray-900 leading-relaxed break-words">
                                            <ReactMarkdown
                                                components={{
                                                    p: ({ node, ...props }) => <p className="mb-2 last:mb-0" {...props} />,
                                                    ul: ({ node, ...props }) => <ul className="list-disc pl-5 my-2 space-y-1 text-gray-800" {...props} />,
                                                    ol: ({ node, ...props }) => <ol className="list-decimal pl-5 my-2 space-y-1 text-gray-800" {...props} />,
                                                    li: ({ node, ...props }) => <li className="my-0.5" {...props} />,
                                                    strong: ({ node, ...props }) => <strong className="font-semibold text-gray-950" {...props} />,
                                                    em: ({ node, ...props }) => <em className="italic text-gray-800" {...props} />,
                                                    code: ({ node, ...props }: any) => {
                                                        const isInline = !String(props.children).includes("\n");
                                                        return isInline ? (
                                                            <code className="px-1.5 py-0.5 rounded bg-gray-100 font-mono text-xs text-indigo-700 font-semibold" {...props} />
                                                        ) : (
                                                            <pre className="p-2.5 rounded-lg bg-gray-900 text-gray-100 font-mono text-xs overflow-x-auto my-2">
                                                                <code {...props} />
                                                            </pre>
                                                        );
                                                    },
                                                    table: ({ node, ...props }) => (
                                                        <div className="overflow-x-auto my-2.5">
                                                            <table className="min-w-full divide-y divide-gray-200 border border-gray-200 text-xs rounded-lg overflow-hidden" {...props} />
                                                        </div>
                                                    ),
                                                    thead: ({ node, ...props }) => <thead className="bg-gray-50" {...props} />,
                                                    th: ({ node, ...props }) => <th className="px-3 py-2 text-left font-semibold text-gray-700 border-b border-gray-200" {...props} />,
                                                    td: ({ node, ...props }) => <td className="px-3 py-2 border-b border-gray-100 text-gray-800" {...props} />,
                                                }}
                                            >
                                                {m.text}
                                            </ReactMarkdown>
                                        </div>
                                    )}

                                    {/* Tool Calls Summary & Subtitle Badges */}
                                    {m.toolCalls && m.toolCalls.length > 0 && (
                                        <div className="mt-3 pt-2.5 border-t border-gray-100 space-y-2">
                                            {m.toolCalls.map((tc, idx) => {
                                                const isFailed = tc.ok === false;
                                                let subtitle = tc.subtitle;
                                                if (!isFailed && !subtitle && tc.resultCount !== undefined) {
                                                    subtitle = `PayPal returned ${tc.resultCount} ${tc.toolName === "list_transactions" ? "transactions" : "items"}`;
                                                }

                                                return (
                                                    <div
                                                        key={idx}
                                                        className={`flex flex-col gap-1 px-3 py-2 rounded-lg text-xs ${
                                                            isFailed
                                                                ? "bg-red-50/70 border border-red-200 text-red-900"
                                                                : "bg-gray-50 border border-gray-200 text-gray-700"
                                                        }`}
                                                    >
                                                        <div className="flex items-center gap-2 flex-wrap">
                                                            <Wrench className={`w-3.5 h-3.5 shrink-0 ${isFailed ? "text-red-600" : "text-indigo-600"}`} />
                                                            <span className="font-mono font-semibold text-gray-900">{tc.toolName}</span>
                                                            <span className="text-gray-400">·</span>
                                                            <span className={isFailed ? "text-red-700 font-medium" : "text-gray-600"}>{tc.summary}</span>
                                                        </div>
                                                        {isFailed ? (
                                                            <div className="flex items-center gap-1.5 text-[11px] font-medium text-red-700 bg-red-100/70 border border-red-200 px-2 py-0.5 rounded w-fit mt-0.5">
                                                                <AlertCircle className="w-3 h-3 text-red-600 shrink-0" />
                                                                <span>{tc.message || tc.summary}</span>
                                                            </div>
                                                        ) : (
                                                            subtitle && (
                                                                <div className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded w-fit mt-0.5">
                                                                    <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
                                                                    <span>{subtitle}</span>
                                                                </div>
                                                            )
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}

                                    {/* Optional Summarize with AI Button */}
                                    {m.canSummarize && !m.summarized && (
                                        <div className="mt-3 pt-2 border-t border-gray-100">
                                            <button
                                                onClick={() => handleSummarize(m.id, m.text)}
                                                disabled={loading}
                                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-indigo-200 bg-indigo-50/80 hover:bg-indigo-100 text-xs font-medium text-indigo-700 transition-colors cursor-pointer disabled:opacity-50"
                                            >
                                                <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                                                <span>Summarize with AI</span>
                                            </button>
                                        </div>
                                    )}

                                    {/* Proposed Action Card (Write Action Human Confirmation) */}
                                    {m.proposedAction && !m.actionExecuted && (
                                        <div className="mt-4 p-4 rounded-xl border border-amber-200 bg-amber-50/50 space-y-3">
                                            <div className="flex items-center gap-2 text-amber-900 font-semibold text-xs">
                                                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                                                <span>Confirmation Required: {m.proposedAction.toolName}</span>
                                            </div>
                                            <p className="text-xs text-amber-800">{m.proposedAction.summary}</p>
                                            <div className="p-2.5 rounded bg-white border border-amber-200 text-[11px] font-mono overflow-x-auto text-gray-700">
                                                {JSON.stringify(m.proposedAction.parameters, null, 2)}
                                            </div>
                                            <div className="flex items-center gap-2 pt-1">
                                                <button
                                                    onClick={() => handleConfirmAction(m.id, m.proposedAction!)}
                                                    disabled={executingActionId === m.proposedAction.id}
                                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                                                >
                                                    {executingActionId === m.proposedAction.id ? (
                                                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                                    ) : (
                                                        <Check className="w-3.5 h-3.5" />
                                                    )}
                                                    <span>Confirm & Execute in PayPal</span>
                                                </button>
                                                <button
                                                    onClick={() => handleCancelAction(m.id)}
                                                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 text-xs font-medium transition-colors cursor-pointer"
                                                >
                                                    <X className="w-3.5 h-3.5" />
                                                    <span>Cancel</span>
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {/* Action Confirmed Success Banner */}
                                    {m.actionExecuted && (
                                        <div className="mt-3 p-3 rounded-lg border border-emerald-200 bg-emerald-50 text-xs text-emerald-800 flex items-center gap-2">
                                            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                                            <span>Action confirmed and executed in PayPal sandbox.</span>
                                        </div>
                                    )}
                                </div>
                                <span className="text-[10px] text-gray-400 mt-1 px-1">
                                    {m.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                </span>
                            </div>

                            {isUser && (
                                <div className="w-8 h-8 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center text-gray-600 shrink-0 mt-0.5">
                                    <User className="w-4 h-4" />
                                </div>
                            )}
                        </div>
                    );
                })}

                {loading && (
                    <div className="flex gap-3 justify-start">
                        <div className="w-8 h-8 rounded-full bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
                            <Bot className="w-4 h-4" />
                        </div>
                        <div className="rounded-2xl px-4 py-3 bg-white border border-gray-200 shadow-xs flex items-center gap-1">
                            <div className="w-2 h-2 rounded-full bg-indigo-600 animate-bounce" style={{ animationDelay: "0ms" }} />
                            <div className="w-2 h-2 rounded-full bg-indigo-600 animate-bounce" style={{ animationDelay: "150ms" }} />
                            <div className="w-2 h-2 rounded-full bg-indigo-600 animate-bounce" style={{ animationDelay: "300ms" }} />
                            <span className="text-xs text-gray-500 ml-2">Calling PayPal API...</span>
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Input Bar */}
            <div className="pt-4 border-t border-gray-200">
                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        handleSend();
                    }}
                    className="flex items-center gap-2"
                >
                    <input
                        ref={inputRef}
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="Ask Copilot (e.g. 'List my invoices', 'What are our recent transactions?')..."
                        disabled={loading}
                        className="flex-1 bg-white border border-gray-300 rounded-xl px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 transition-colors"
                    />
                    <button
                        type="submit"
                        disabled={loading || !input.trim()}
                        className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 shrink-0 shadow-xs"
                    >
                        <Send className="w-4 h-4" />
                        <span>Send</span>
                    </button>
                </form>
            </div>
        </div>
    );
}
