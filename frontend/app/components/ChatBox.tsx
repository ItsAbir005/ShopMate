"use client";

import { useState, useEffect, useRef } from "react";
import { io, Socket } from "socket.io-client";
import { User, Truck, X, Send } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:4000";

interface Message {
    _id: string;
    shipmentId: string;
    senderMode: "customer" | "driver";
    senderId: string;
    text: string;
    createdAt: string;
}

interface ChatBoxProps {
    shipmentId: string;
    userMode: "customer" | "driver";
    userId?: string; 
    token?: string;
    recipientName: string;
    onClose: () => void;
}

export default function ChatBox({ shipmentId, userMode, userId = "anonymous", token, recipientName, onClose }: ChatBoxProps) {
    const [messages, setMessages] = useState<Message[]>([]);
    const [newMessage, setNewMessage] = useState("");
    const [socket, setSocket] = useState<Socket | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const fetchHistory = async () => {
            try {
                const headers: any = { "Content-Type": "application/json" };
                if (token) headers["Authorization"] = `Bearer ${token}`;
                
                const res = await fetch(`${API}/chat/${shipmentId}`, { headers });
                if (res.ok) {
                    const data = await res.json();
                    setMessages(data);
                }
            } catch (err) {
                console.error("Failed to load chat history:", err);
            }
        };
        fetchHistory();
    }, [shipmentId, token]);

    useEffect(() => {
        const s = io(SOCKET_URL, { auth: token ? { token } : {} });
        
        s.on("connect", () => {
            s.emit("join:chat", { shipmentId });
        });

        s.on("receive:message", (msg: Message) => {
            setMessages((prev) => [...prev, msg]);
        });

        setSocket(s);

        return () => {
            s.disconnect();
        };
    }, [shipmentId, token]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    const handleSend = (e: React.FormEvent) => {
        e.preventDefault();
        if (!newMessage.trim() || !socket) return;

        socket.emit("send:message", {
            shipmentId,
            senderMode: userMode,
            senderId: userId,
            text: newMessage.trim(),
        });
        
        setNewMessage("");
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 animate-in fade-in duration-200">
            <div className="w-full max-w-md bg-white border border-gray-200 rounded-2xl shadow-xl overflow-hidden flex flex-col h-[500px] max-h-[85vh]">
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-200 bg-white">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
                            {userMode === "customer" ? <Truck className="w-4 h-4" /> : <User className="w-4 h-4" />}
                        </div>
                        <div>
                            <h3 className="font-bold text-gray-900 text-sm">Chat with {recipientName}</h3>
                            <p className="text-[11px] text-emerald-600 font-medium flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block"></span> Online
                            </p>
                        </div>
                    </div>
                    <button 
                        onClick={onClose}
                        className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Messages Area */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-white">
                    {messages.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-gray-400 text-xs">
                            <p>Send a message to start chatting.</p>
                        </div>
                    ) : (
                        messages.map((msg, idx) => {
                            const isMe = msg.senderMode === userMode;
                            return (
                                <div key={msg._id || idx} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                                    <div 
                                        className={`max-w-[80%] px-3.5 py-2 rounded-2xl text-xs ${
                                            isMe 
                                                ? 'bg-indigo-600 text-white rounded-br-sm' 
                                                : 'bg-gray-100 text-gray-900 rounded-bl-sm border border-gray-200'
                                        }`}
                                    >
                                        {msg.text}
                                    </div>
                                    <span className="text-[10px] text-gray-400 mt-0.5 px-1">
                                        {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                </div>
                            );
                        })
                    )}
                    <div ref={messagesEndRef} />
                </div>

                {/* Input Area */}
                <form onSubmit={handleSend} className="p-3 border-t border-gray-200 bg-white">
                    <div className="flex items-center gap-2">
                        <input
                            type="text"
                            value={newMessage}
                            onChange={(e) => setNewMessage(e.target.value)}
                            placeholder="Type a message..."
                            className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-indigo-600 transition-colors"
                        />
                        <button 
                            type="submit"
                            disabled={!newMessage.trim()}
                            className="p-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                            <Send className="w-3.5 h-3.5" />
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
