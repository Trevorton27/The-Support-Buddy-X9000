"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Bot, Send, Loader2, User, RefreshCw, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface DevinMessage {
  type: string;
  message: string;
  timestamp?: string;
  username?: string | null;
}

interface DevinChatProps {
  taskId: string;
  taskStatus: string;
  sessionUrl: string | null;
}

const TERMINAL = ["finished", "failed", "expired", "cancelled"];
const POLL_INTERVAL = 8000;

export function DevinChat({ taskId, taskStatus, sessionUrl }: DevinChatProps) {
  const [messages, setMessages] = useState<DevinMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [liveStatus, setLiveStatus] = useState(taskStatus);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isTerminal = TERMINAL.includes(liveStatus);

  const fetchMessages = useCallback(async () => {
    try {
      const res = await fetch(`/api/devin/tasks/${taskId}/messages`);
      if (!res.ok) {
        if (res.status === 502) {
          setError("Could not reach Devin API");
          return;
        }
        return;
      }
      const data = await res.json();
      setMessages(data.messages ?? []);
      if (data.status) setLiveStatus(data.status);
      setError(null);
    } catch {
      setError("Failed to load messages");
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  // Initial fetch + polling
  useEffect(() => {
    fetchMessages();

    if (!TERMINAL.includes(taskStatus)) {
      pollRef.current = setInterval(fetchMessages, POLL_INTERVAL);
    }

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [fetchMessages, taskStatus]);

  // Stop polling when terminal
  useEffect(() => {
    if (isTerminal && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, [isTerminal]);

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || sending) return;

    setSending(true);
    // Optimistic update
    setMessages((prev) => [...prev, { type: "user_message", message: text }]);
    setInput("");

    try {
      const res = await fetch(`/api/devin/tasks/${taskId}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Failed to send message");
      } else {
        // Fetch fresh messages after a short delay to get Devin's acknowledgement
        setTimeout(fetchMessages, 2000);
      }
    } catch {
      setError("Failed to send message");
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-sm text-slate-500">
        <Loader2 className="w-4 h-4 animate-spin mr-2" />
        Loading conversation...
      </div>
    );
  }

  return (
    <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden bg-white dark:bg-slate-900">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
        <div className="flex items-center gap-2">
          <Bot className="w-4 h-4 text-slate-500" />
          <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
            Devin Conversation
          </span>
          {!isTerminal && (
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
          )}
          <Badge
            variant="outline"
            className="text-[10px] px-1.5 py-0"
          >
            {liveStatus === "blocked" ? "waiting" : liveStatus}
          </Badge>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" className="h-6 px-1.5" onClick={fetchMessages}>
            <RefreshCw className="w-3 h-3" />
          </Button>
          {sessionUrl && (
            <a
              href={sessionUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] text-blue-600 dark:text-blue-400 hover:underline px-1"
            >
              View Chat On Devin
            </a>
          )}
        </div>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="max-h-[400px] overflow-y-auto p-3 space-y-3"
      >
        {messages.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-4">
            No messages yet. Devin is working...
          </p>
        ) : (
          messages.map((msg, i) => {
            const isUser = msg.type.includes("user");
            return (
              <div
                key={i}
                className={`flex gap-2 ${isUser ? "justify-end" : "justify-start"}`}
              >
                {!isUser && (
                  <Bot className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
                )}
                <div
                  className={`max-w-[85%] rounded-lg px-3 py-2 text-xs leading-relaxed ${
                    isUser
                      ? "bg-blue-600 text-white"
                      : "bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200"
                  }`}
                >
                  {isUser && msg.username && (
                    <div className={`text-[10px] font-medium mb-0.5 ${isUser ? "text-blue-200" : "text-slate-400"}`}>
                      {msg.username}
                    </div>
                  )}
                  <div className="whitespace-pre-wrap break-words">{msg.message}</div>
                  {msg.timestamp && (
                    <div
                      className={`text-[10px] mt-1 ${
                        isUser ? "text-blue-200" : "text-slate-400"
                      }`}
                    >
                      {new Date(msg.timestamp).toLocaleTimeString()}
                    </div>
                  )}
                </div>
                {isUser && (
                  <User className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="px-3 py-1.5 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-xs flex items-center gap-1">
          <AlertCircle className="w-3 h-3" />
          {error}
        </div>
      )}

      {/* Input */}
      <div className="border-t border-slate-200 dark:border-slate-700 p-2">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
            placeholder="Message Devin..."
            className="flex-1 text-xs border border-slate-200 dark:border-slate-700 rounded-md px-3 py-2 bg-white dark:bg-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
            disabled={sending}
          />
          <Button
            size="sm"
            className="h-8 px-3"
            onClick={handleSend}
            disabled={sending || !input.trim()}
          >
            {sending ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Send className="w-3 h-3" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
