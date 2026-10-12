"use client";

import { useState, useEffect, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import { fetchApi } from "../lib/api";
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
  RotateCcw
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ChatMessage {
  id: string;
  role: "agent" | "user";
  text: string;
  timestamp: Date;
  card?: React.ReactNode;
}

type Order = {
  _id: string;
  status: string;
  payment_status: string;
  total_amount: number;
  order_items: { title: string; quantity: number; image?: string }[];
  createdAt: string;
};

// ─── Quick-reply chips ────────────────────────────────────────────────────────

const QUICK_REPLIES_GUEST = ["Track my order", "Return & refund policy", "Payment issues", "How to sell on ShopMate?", "Contact support"];
const QUICK_REPLIES_LOGGED = ["Where is my order?", "Cancel order", "Return & refund policy", "Payment issues", "Contact support"];

// ─── Static FAQ answers ───────────────────────────────────────────────────────

const STATIC_ANSWERS: Record<string, string> = {
  "return & refund policy":
    "We offer a **7-day return window** from delivery. Items must be unused and in original packaging. Refunds are processed within **3–5 business days** after we receive the item.",
  "payment issues":
    "If your payment failed, please check your card/PayPal details or try a different payment method. For assistance, contact your bank or email **support@shopmate.com**.",
  "how to sell on shopmate?":
    "Click the **Sell** link in the nav bar, fill in your product details, upload photos, and submit. Our team will review and approve your listing within **24 hours**.",
  "contact support":
    "Our human agents are available **Mon–Fri, 9 AM–6 PM IST**.\n📧 **support@shopmate.com**\n📞 **+91-800-SHOP-MATE**",
  "track my order":
    "Please **sign in** to your account and I can show your live order status! Or visit the Orders page directly.",
};

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
                <strong key={i} className="font-semibold">{p.slice(2, -2)}</strong>
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

// ─── Order Card (inline in chat) ──────────────────────────────────────────────

function OrderCard({
  order,
  onCancelRequest,
}: {
  order: Order;
  onCancelRequest: (order: Order) => void;
}) {
  const canCancel = ["pending", "confirmed", "paid"].includes(order.status);

  return (
    <div className="mt-2 rounded-xl p-3 text-xs bg-white border border-gray-200 space-y-2">
      {/* Order ID + status */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="font-mono text-gray-500">
          #{order._id.slice(-8).toUpperCase()}
        </span>
        <span className="px-2 py-0.5 rounded-full font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
          {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
        </span>
      </div>

      {/* Items */}
      <p className="text-gray-600 leading-snug line-clamp-2">
        {order.order_items.map((i) => `${i.title} ×${i.quantity}`).join("  ·  ")}
      </p>

      {/* Footer row */}
      <div className="flex items-center justify-between pt-1 border-t border-gray-100">
        <span className="text-gray-900 font-bold">
          ${order.total_amount.toFixed(2)}
        </span>
        <div className="flex items-center gap-3">
          <Link
            href={`/orders/${order._id}`}
            target="_blank"
            className="text-indigo-600 hover:text-indigo-700 font-medium"
          >
            Details →
          </Link>
          {canCancel && (
            <button
              onClick={() => onCancelRequest(order)}
              className="text-red-600 hover:text-red-700 font-medium"
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function SupportAgent() {
  const { user } = useAuth();

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const [hasGreeted, setHasGreeted] = useState(false);
  const [unread, setUnread] = useState(0);

  const [pendingCancel, setPendingCancel] = useState<Order | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) setUnread(0);
  }, [open]);

  useEffect(() => {
    if (open && !hasGreeted) {
      setHasGreeted(true);
      setTimeout(() => {
        addAgent(
          user
            ? `Hi ${user.name.split(" ")[0]}! I'm ShopMate Assistant. I can check your orders, help with questions, and more. What can I help you with?`
            : "Hi there! I'm ShopMate Assistant. What can I help you with today?"
        );
      }, 300);
    }
  }, [open, hasGreeted, user]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typing, pendingCancel]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 200);
  }, [open]);

  function uid() { return Date.now().toString() + Math.random(); }
  function fmt(d: Date) { return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); }

  function addAgent(text: string, card?: React.ReactNode) {
    setMessages((prev) => [...prev, { id: uid(), role: "agent", text, timestamp: new Date(), card }]);
    if (!open) setUnread((u) => u + 1);
  }

  function addUser(text: string) {
    setMessages((prev) => [...prev, { id: uid(), role: "user", text, timestamp: new Date() }]);
  }

  async function handleWhereIsMyOrder() {
    if (!user) {
      addAgent("Please sign in first so I can pull up your orders.");
      return;
    }
    setTyping(true);
    try {
      const data = await fetchApi("/orders/my?page=1&limit=5");
      const orders: Order[] = data.orders || [];
      setTyping(false);

      if (orders.length === 0) {
        addAgent("You haven't placed any orders yet. Ready to start shopping?");
        return;
      }

      addAgent(`Here are your **${orders.length > 1 ? "recent orders" : "latest order"}**, ${user.name.split(" ")[0]}:`);

      orders.forEach((order) => {
        setMessages((prev) => [
          ...prev,
          {
            id: uid(),
            role: "agent",
            text: "",
            timestamp: new Date(),
            card: (
              <OrderCard
                order={order}
                onCancelRequest={initCancelFlow}
              />
            ),
          },
        ]);
      });

      setTimeout(() => {
        addAgent("Need anything else? You can tap Cancel on any eligible order above or ask another question.");
      }, 300);
    } catch {
      setTyping(false);
      addAgent("I couldn't fetch your orders right now. Please try again shortly or visit the Orders page.");
    }
  }

  async function handleCancelOrderIntent() {
    if (!user) {
      addAgent("Please sign in first so I can check your cancellable orders.");
      return;
    }
    setTyping(true);
    try {
      const data = await fetchApi("/orders/my?page=1&limit=10");
      const orders: Order[] = data.orders || [];
      setTyping(false);

      const cancellable = orders.filter((o) =>
        ["pending", "confirmed", "paid"].includes(o.status)
      );

      if (cancellable.length === 0) {
        addAgent(
          "You have no orders that can be cancelled right now. Orders that have already shipped or been delivered cannot be cancelled.\n\nFor returns, see our Return & Refund Policy."
        );
        return;
      }

      addAgent(
        `Here ${cancellable.length === 1 ? "is" : "are"} your **${cancellable.length} cancellable order${cancellable.length > 1 ? "s" : ""}**. Tap **Cancel** on the one you'd like to cancel:`
      );

      cancellable.forEach((order) => {
        setMessages((prev) => [
          ...prev,
          {
            id: uid(),
            role: "agent",
            text: "",
            timestamp: new Date(),
            card: (
              <OrderCard
                order={order}
                onCancelRequest={initCancelFlow}
              />
            ),
          },
        ]);
      });
    } catch {
      setTyping(false);
      addAgent("I couldn't load your orders right now. Please try again.");
    }
  }

  function initCancelFlow(order: Order) {
    setPendingCancel(order);
    addAgent(
      `Are you sure you want to cancel order **#${order._id.slice(-8).toUpperCase()}**?\n\nTotal: **$${order.total_amount.toFixed(2)}**`
    );
  }

  async function confirmCancel() {
    if (!pendingCancel) return;
    const order = pendingCancel;
    setPendingCancel(null);
    setTyping(true);
    try {
      await fetchApi(`/orders/${order._id}/cancel`, { method: "PUT" });
      setTyping(false);
      addAgent(
        `Order **#${order._id.slice(-8).toUpperCase()}** has been cancelled successfully. Any payment will be refunded within 3–5 business days. Is there anything else I can help you with?`
      );
    } catch (err: any) {
      setTyping(false);
      addAgent(
        `I couldn't cancel that order: **${err.message || "Unknown error"}**. Please try from the Orders page or contact support.`
      );
    }
  }

  function abortCancel() {
    setPendingCancel(null);
    addAgent("No problem — your order is safe! Anything else I can help with?");
  }

  async function handleIntent(text: string) {
    const lower = text.toLowerCase().trim();

    if (lower.includes("where is my order") || lower.includes("track") || lower.includes("my order")) {
      await handleWhereIsMyOrder();
      return;
    }

    if (lower.includes("cancel order") || lower.includes("cancel my order") || lower === "cancel order") {
      await handleCancelOrderIntent();
      return;
    }

    for (const key of Object.keys(STATIC_ANSWERS)) {
      if (lower.includes(key)) {
        addAgent(STATIC_ANSWERS[key]);
        return;
      }
    }

    addAgent(
      "Thanks for reaching out! I've noted your question. A human agent will follow up via email shortly.\n\nOr try asking me:\n• Where is my order?\n• Cancel order\n• Return & refund policy"
    );
  }

  function handleSend(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    setInput("");
    addUser(trimmed);
    setTyping(true);
    setTimeout(async () => {
      setTyping(false);
      await handleIntent(trimmed);
    }, 600);
  }

  function handleQuickReply(label: string) { handleSend(label); }

  const quickReplies = user ? QUICK_REPLIES_LOGGED : QUICK_REPLIES_GUEST;
  const showQuickReplies = messages.length <= 1 && !typing;

  return (
    <>
      {/* Floating Button */}
      <button
        id="support-agent-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-label="Toggle support chat"
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
        className={`fixed bottom-20 right-6 z-50 w-[360px] max-w-[calc(100vw-3rem)] flex flex-col rounded-xl overflow-hidden bg-white border border-gray-200 shadow-xl transition-all duration-200 origin-bottom-right ${
          open ? "scale-100 opacity-100 pointer-events-auto" : "scale-95 opacity-0 pointer-events-none"
        }`}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 bg-white">
          <div className="w-8 h-8 rounded-full bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
            <Bot className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-gray-900 text-sm leading-tight">ShopMate Assistant</p>
            <p className="text-xs text-gray-500">
              {user ? `Logged in as ${user.name.split(" ")[0]}` : "Online · Support"}
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
          className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-white"
          style={{ minHeight: "280px", maxHeight: "340px" }}
        >
          {messages.length === 0 && !typing && (
            <div className="flex flex-col items-center justify-center h-full py-8 text-center text-gray-400">
              <Bot className="w-8 h-8 mb-2 text-indigo-600" />
              <p className="text-xs text-gray-500">How can we help you today?</p>
            </div>
          )}

          {messages.map((msg) => (
            <div key={msg.id} className={`flex gap-2 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
              {msg.role === "agent" && (
                <div className="w-6 h-6 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Bot className="w-3.5 h-3.5" />
                </div>
              )}
              <div className={`flex flex-col gap-1 max-w-[85%] ${msg.role === "user" ? "items-end" : "items-start"}`}>
                {msg.text && (
                  <div
                    className={`px-3.5 py-2 rounded-2xl text-xs leading-relaxed ${
                      msg.role === "user"
                        ? "bg-indigo-600 text-white rounded-br-sm"
                        : "bg-gray-100 text-gray-900 border border-gray-200 rounded-bl-sm"
                    }`}
                  >
                    <RenderText text={msg.text} />
                  </div>
                )}
                {msg.card && <div className="w-full">{msg.card}</div>}
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

        {/* Cancel Confirmation Bar */}
        {pendingCancel && (
          <div className="mx-3 mb-2 rounded-xl p-3 bg-red-50 border border-red-200 flex items-center justify-between gap-3">
            <p className="text-xs text-red-700 leading-snug flex-1 font-medium">
              Confirm cancel <strong>#{pendingCancel._id.slice(-8).toUpperCase()}</strong>?
            </p>
            <div className="flex gap-2 shrink-0">
              <button
                onClick={abortCancel}
                className="text-xs px-2.5 py-1 rounded-md border border-gray-300 text-gray-700 hover:bg-white transition-colors"
              >
                Keep
              </button>
              <button
                onClick={confirmCancel}
                className="text-xs px-2.5 py-1 rounded-md font-semibold bg-red-600 text-white hover:bg-red-700 transition-colors"
              >
                Yes, Cancel
              </button>
            </div>
          </div>
        )}

        {/* Quick Replies */}
        {showQuickReplies && (
          <div className="px-3 pb-2 flex flex-wrap gap-1.5 bg-white">
            {quickReplies.map((label) => (
              <button
                key={label}
                onClick={() => handleQuickReply(label)}
                className="text-[11px] px-2.5 py-1 rounded-full border border-gray-200 text-gray-700 bg-gray-50 hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-200 transition-colors"
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {/* Input */}
        <form
          onSubmit={(e) => { e.preventDefault(); handleSend(input); }}
          className="p-3 border-t border-gray-200 bg-white"
        >
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              id="support-agent-input"
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask anything…"
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
