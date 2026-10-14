"use client";

import { useState, useEffect, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import Link from "next/link";
import {
  MessageCircle,
  X,
  Send,
  Bot,
  Package,
  Truck,
  Clock,
  CheckCircle,
  CreditCard,
  AlertCircle,
  ShoppingCart,
  ExternalLink,
  Plus,
  Sparkles,
  ArrowRight,
  ShieldCheck
} from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AssistantProduct {
  id: string;
  title: string;
  description?: string;
  price: number;
  stock: number;
  category: string;
  image?: string;
}

interface AssistantOrderStatus {
  order?: {
    id: string;
    status: string;
    paymentStatus: string;
    total: number;
    items: { title: string; quantity: number; price: number }[];
    trackingCode?: string;
    estimatedDelivery?: string;
  };
  recentOrders?: {
    id: string;
    status: string;
    paymentStatus: string;
    total: number;
    itemsCount: number;
  }[];
}

interface AssistantToolCall {
  toolName: string;
  summary: string;
  result?: any;
}

interface ChatMessage {
  id: string;
  role: "agent" | "user";
  text: string;
  timestamp: Date;
  toolCalls?: AssistantToolCall[];
  products?: AssistantProduct[];
  orderStatus?: AssistantOrderStatus;
  cartUpdated?: boolean;
}

// ─── Quick-reply suggestions ──────────────────────────────────────────────────

const QUICK_REPLIES_GUEST = [
  "Search wireless headphones",
  "Find products under $50",
  "How does PayPal checkout work?",
  "What is your return policy?"
];

const QUICK_REPLIES_LOGGED = [
  "Where is my latest order?",
  "Search laptop accessories",
  "Find smart watches",
  "I'm ready to checkout"
];

// ─── Typing indicator ─────────────────────────────────────────────────────────

function TypingDots() {
  return (
    <div className="flex items-center gap-1 px-3 py-2">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-indigo-600 animate-bounce"
          style={{ animationDelay: `${i * 0.15}s`, animationDuration: "0.9s" }}
        />
      ))}
    </div>
  );
}

// ─── Mini-markdown renderer ───────────────────────────────────────────────────

function RenderText({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <>
      {lines.map((line, li) => {
        const parts = line.split(/(\*\*[^*]+\*\*)/g);
        return (
          <span key={li}>
            {parts.map((p, i) =>
              p.startsWith("**") && p.endsWith("**") ? (
                <strong key={i} className="font-semibold text-gray-900">{p.slice(2, -2)}</strong>
              ) : (
                <span key={i}>{p}</span>
              )
            )}
            {li < lines.length - 1 && <br />}
          </span>
        );
      })}
    </>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function SupportAgent() {
  const { user } = useAuth();
  const { refreshCart } = useCart();

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const [hasGreeted, setHasGreeted] = useState(false);
  const [unread, setUnread] = useState(0);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) setUnread(0);
  }, [open]);

  useEffect(() => {
    if (open && !hasGreeted) {
      setHasGreeted(true);
      setTimeout(() => {
        const greeting = user
          ? `Hi ${user.name.split(" ")[0]}! I'm your ShopMate AI Shopping Assistant. I can search our catalog, check your order status, add products to your cart, and guide you to secure PayPal checkout. What can I find for you?`
          : "Hi there! I'm your ShopMate AI Shopping Assistant. I can help you discover products, check specs, and guide you to standard PayPal checkout. How can I assist you today?";
        addAgentMessage(greeting);
      }, 300);
    }
  }, [open, hasGreeted, user]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typing]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 200);
  }, [open]);

  function uid() {
    return Date.now().toString() + Math.random().toString().slice(2, 6);
  }

  function fmt(d: Date) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  function addAgentMessage(
    text: string,
    toolCalls?: AssistantToolCall[],
    products?: AssistantProduct[],
    orderStatus?: AssistantOrderStatus,
    cartUpdated?: boolean
  ) {
    setMessages((prev) => [
      ...prev,
      {
        id: uid(),
        role: "agent",
        text,
        timestamp: new Date(),
        toolCalls,
        products,
        orderStatus,
        cartUpdated,
      },
    ]);
    if (!open) setUnread((u) => u + 1);
  }

  function addUserMessage(text: string) {
    setMessages((prev) => [
      ...prev,
      { id: uid(), role: "user", text, timestamp: new Date() },
    ]);
  }

  async function handleSend(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    setInput("");
    addUserMessage(trimmed);
    setTyping(true);

    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      const history = messages.slice(-6).map((m) => ({
        role: (m.role === "user" ? "user" : "model") as "user" | "model",
        content: m.text,
      }));

      const res = await fetch(`${API}/ai/assistant`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          message: trimmed,
          history,
        }),
      });

      if (!res.ok) {
        throw new Error(`Server returned ${res.status}`);
      }

      const data = await res.json();
      setTyping(false);

      addAgentMessage(
        data.text || "I processed your request.",
        data.toolCalls,
        data.products,
        data.orderStatus,
        data.cartUpdated
      );

      if (data.cartUpdated) {
        refreshCart?.();
      }
    } catch (err: any) {
      setTyping(false);
      addAgentMessage(
        "I'm temporarily having trouble reaching our AI services. You can browse our products directly or proceed to standard checkout."
      );
    }
  }

  const handleAddToCart = (product: AssistantProduct) => {
    if (!user) {
      addAgentMessage("Please sign in first so I can add this item to your personal cart.");
      return;
    }
    handleSend(`Add 1 of ${product.title} to my cart (Product ID: ${product.id})`);
  };

  const quickReplies = user ? QUICK_REPLIES_LOGGED : QUICK_REPLIES_GUEST;
  const showQuickReplies = messages.length <= 1 && !typing;

  return (
    <>
      {/* Floating Button */}
      <button
        id="support-agent-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-label="Toggle AI shopping assistant"
        className="fixed bottom-6 right-6 z-50 w-12 h-12 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white flex items-center justify-center transition-colors shadow-md border border-indigo-700"
      >
        {open ? <X className="w-5 h-5" /> : <MessageCircle className="w-5 h-5" />}
        {unread > 0 && !open && (
          <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center border-2 border-white">
            {unread}
          </span>
        )}
      </button>

      {/* Chat Panel */}
      <div
        id="support-agent-panel"
        className={`fixed bottom-20 right-6 z-50 w-[380px] max-w-[calc(100vw-2.5rem)] flex flex-col rounded-2xl overflow-hidden bg-white border border-gray-200 shadow-2xl transition-all duration-200 origin-bottom-right ${
          open ? "scale-100 opacity-100 pointer-events-auto" : "scale-95 opacity-0 pointer-events-none"
        }`}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-gray-200 bg-white">
          <div className="w-8 h-8 rounded-full bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
            <Sparkles className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="font-bold text-gray-900 text-sm leading-tight">ShopMate Assistant</p>
              <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                AI
              </span>
            </div>
            <p className="text-[11px] text-gray-500 truncate">
              {user ? `Signed in as ${user.name.split(" ")[0]}` : "PayPal AI Powered · Online"}
            </p>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Messages */}
        <div
          className="flex-1 overflow-y-auto px-4 py-4 space-y-3.5 bg-white"
          style={{ minHeight: "300px", maxHeight: "380px" }}
        >
          {messages.length === 0 && !typing && (
            <div className="flex flex-col items-center justify-center h-full py-8 text-center text-gray-400">
              <Bot className="w-8 h-8 mb-2 text-indigo-600" />
              <p className="text-xs text-gray-500 font-medium">How can I help you shop today?</p>
              <p className="text-[11px] text-gray-400 mt-1 max-w-[220px]">
                Ask me to search products, check order status, or help you checkout.
              </p>
            </div>
          )}

          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex gap-2 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}
            >
              {msg.role === "agent" && (
                <div className="w-6 h-6 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Bot className="w-3.5 h-3.5" />
                </div>
              )}
              <div className={`flex flex-col gap-1.5 max-w-[88%] ${msg.role === "user" ? "items-end" : "items-start"}`}>
                {/* Main text message */}
                {msg.text && (
                  <div
                    className={`px-3.5 py-2.5 rounded-2xl text-xs leading-relaxed ${
                      msg.role === "user"
                        ? "bg-indigo-600 text-white rounded-br-sm"
                        : "bg-gray-100 text-gray-900 border border-gray-200 rounded-bl-sm"
                    }`}
                  >
                    <RenderText text={msg.text} />
                  </div>
                )}

                {/* Tool execution badge */}
                {msg.toolCalls && msg.toolCalls.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-0.5">
                    {msg.toolCalls.map((tc, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-50 text-gray-600 border border-gray-200"
                        title={tc.summary}
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
                        <span className="font-mono">{tc.toolName}</span>
                      </span>
                    ))}
                  </div>
                )}

                {/* Product Search Results Cards */}
                {msg.products && msg.products.length > 0 && (
                  <div className="w-full space-y-2 mt-1">
                    <p className="text-[11px] font-semibold text-gray-700">Catalog Matches:</p>
                    <div className="space-y-1.5">
                      {msg.products.map((p) => (
                        <div
                          key={p.id}
                          className="p-2.5 bg-white border border-gray-200 rounded-xl hover:border-indigo-300 transition-colors flex items-center justify-between gap-3"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-gray-900 text-xs truncate">{p.title}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="font-bold text-xs text-gray-900">${p.price.toFixed(2)}</span>
                              <span className="text-[10px] text-gray-500 font-medium">· {p.category}</span>
                              <span className={`text-[10px] font-medium ${p.stock > 0 ? "text-emerald-600" : "text-rose-600"}`}>
                                {p.stock > 0 ? `${p.stock} in stock` : "Out of stock"}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            {p.stock > 0 && (
                              <button
                                onClick={() => handleAddToCart(p)}
                                className="px-2 py-1 rounded-md text-[11px] font-medium bg-indigo-50 text-indigo-600 hover:bg-indigo-600 hover:text-white transition-colors"
                              >
                                + Add
                              </button>
                            )}
                            <Link
                              href={`/products/${p.id}`}
                              target="_blank"
                              className="p-1 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                              title="View details"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </Link>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Order Status Cards */}
                {msg.orderStatus && (
                  <div className="w-full space-y-2 mt-1">
                    {msg.orderStatus.order && (
                      <div className="p-3 bg-white border border-gray-200 rounded-xl text-xs space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="font-mono font-semibold text-gray-900">
                            #{msg.orderStatus.order.id.slice(-8).toUpperCase()}
                          </span>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                            {msg.orderStatus.order.status}
                          </span>
                        </div>
                        <div className="text-gray-600 text-[11px]">
                          {msg.orderStatus.order.items?.map((it) => `${it.title} ×${it.quantity}`).join(" · ")}
                        </div>
                        {msg.orderStatus.order.trackingCode && (
                          <div className="flex items-center gap-1 text-[11px] text-indigo-600 font-medium">
                            <Truck className="w-3 h-3" />
                            <span>Tracking: {msg.orderStatus.order.trackingCode}</span>
                          </div>
                        )}
                        <div className="flex items-center justify-between pt-1 border-t border-gray-100">
                          <span className="font-bold text-gray-900">${msg.orderStatus.order.total.toFixed(2)}</span>
                          <Link
                            href={`/orders/${msg.orderStatus.order.id}`}
                            target="_blank"
                            className="text-indigo-600 hover:text-indigo-700 font-semibold text-[11px] flex items-center gap-1"
                          >
                            <span>Order details</span>
                            <ArrowRight className="w-3 h-3" />
                          </Link>
                        </div>
                      </div>
                    )}

                    {msg.orderStatus.recentOrders && msg.orderStatus.recentOrders.length > 0 && (
                      <div className="space-y-1.5">
                        <p className="text-[11px] font-semibold text-gray-700">Recent Orders:</p>
                        {msg.orderStatus.recentOrders.map((o) => (
                          <div
                            key={o.id}
                            className="p-2.5 bg-white border border-gray-200 rounded-xl flex items-center justify-between text-xs"
                          >
                            <div>
                              <p className="font-mono font-semibold text-gray-900">
                                #{o.id.slice(-8).toUpperCase()}
                              </p>
                              <p className="text-[10px] text-gray-500 mt-0.5">
                                {o.status} · ${o.total.toFixed(2)} · {o.itemsCount} item{o.itemsCount !== 1 ? "s" : ""}
                              </p>
                            </div>
                            <Link
                              href={`/orders/${o.id}`}
                              target="_blank"
                              className="text-xs text-indigo-600 hover:text-indigo-700 font-medium flex items-center gap-0.5"
                            >
                              <span>View</span>
                              <ExternalLink className="w-3 h-3" />
                            </Link>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Cart updated notification / Checkout redirect card */}
                {msg.cartUpdated && (
                  <div className="w-full p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs">
                    <div className="flex items-center gap-1.5 text-emerald-800 font-semibold mb-1">
                      <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Cart Updated</span>
                    </div>
                    <p className="text-[11px] text-emerald-700 mb-2">
                      Your item was added. Ready to complete payment via PayPal?
                    </p>
                    <div className="flex items-center gap-2">
                      <Link
                        href="/cart"
                        className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-white text-gray-800 border border-gray-200 hover:bg-gray-50 transition-colors"
                      >
                        View Cart
                      </Link>
                      <Link
                        href="/orders/checkout"
                        className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors flex items-center gap-1"
                      >
                        <span>Checkout with PayPal</span>
                        <ArrowRight className="w-3 h-3" />
                      </Link>
                    </div>
                  </div>
                )}

                {/* Ready to checkout direct prompt */}
                {(msg.text?.toLowerCase().includes("checkout") || msg.text?.toLowerCase().includes("paypal")) && !msg.cartUpdated && (
                  <div className="w-full p-2.5 rounded-xl bg-gray-50 border border-gray-200 flex items-center justify-between gap-2 mt-0.5">
                    <div className="flex items-center gap-1.5 text-xs text-gray-700 font-medium">
                      <ShieldCheck className="w-4 h-4 text-indigo-600" />
                      <span>Standard PayPal Checkout</span>
                    </div>
                    <Link
                      href="/orders/checkout"
                      className="px-2.5 py-1 text-[11px] font-semibold text-white bg-indigo-600 rounded-md hover:bg-indigo-700 transition-colors flex items-center gap-1"
                    >
                      <span>Checkout</span>
                      <ArrowRight className="w-3 h-3" />
                    </Link>
                  </div>
                )}

                <span className="text-[10px] text-gray-400 px-1">{fmt(msg.timestamp)}</span>
              </div>
            </div>
          ))}

          {typing && (
            <div className="flex gap-2 items-center">
              <div className="w-6 h-6 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center flex-shrink-0">
                <Bot className="w-3.5 h-3.5" />
              </div>
              <div className="rounded-2xl rounded-bl-sm bg-gray-100 border border-gray-200">
                <TypingDots />
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Quick Replies */}
        {showQuickReplies && (
          <div className="px-3 pb-2 flex flex-wrap gap-1.5 bg-white border-t border-gray-100 pt-2">
            {quickReplies.map((label) => (
              <button
                key={label}
                onClick={() => handleSend(label)}
                className="text-[11px] px-2.5 py-1 rounded-full border border-gray-200 text-gray-700 bg-gray-50 hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-200 transition-colors"
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {/* Input */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend(input);
          }}
          className="p-3 border-t border-gray-200 bg-white"
        >
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              id="support-agent-input"
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Search items, check orders, ask anything…"
              className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-900 placeholder:text-gray-400 outline-none focus:border-indigo-600"
            />
            <button
              type="submit"
              disabled={!input.trim() || typing}
              id="support-agent-send"
              className="p-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
