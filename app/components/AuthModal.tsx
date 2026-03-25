"use client";

import { useState } from "react";

interface Props {
  onClose: () => void;
  onSignIn: (email: string, password: string) => Promise<void>;
  onSignUp: (email: string, password: string) => Promise<void>;
}

export default function AuthModal({ onClose, onSignIn, onSignUp }: Props) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);
    try {
      if (mode === "signin") {
        await onSignIn(email, password);
        onClose();
      } else {
        await onSignUp(email, password);
        setSuccess("Check your email to confirm your account.");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center" style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)" }}>
      <div className="w-full max-w-sm rounded-xl overflow-hidden" style={{
        background: "rgba(18,22,30,0.98)",
        border: "1px solid rgba(255,255,255,0.08)",
        boxShadow: "0 24px 48px rgba(0,0,0,0.5)",
      }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <h2 className="text-sm font-display font-bold" style={{ color: "rgba(255,255,255,0.9)" }}>
            {mode === "signin" ? "Sign In" : "Create Account"}
          </h2>
          <button onClick={onClose} className="text-[var(--text-dim)] hover:text-white transition-colors text-lg leading-none">&times;</button>
        </div>

        {/* Tabs */}
        <div className="flex px-5 pt-3 gap-4">
          <button
            onClick={() => { setMode("signin"); setError(null); setSuccess(null); }}
            className="text-[11px] font-mono pb-2 transition-colors"
            style={{
              color: mode === "signin" ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.35)",
              borderBottom: mode === "signin" ? "1px solid rgba(255,255,255,0.5)" : "1px solid transparent",
            }}
          >
            Sign In
          </button>
          <button
            onClick={() => { setMode("signup"); setError(null); setSuccess(null); }}
            className="text-[11px] font-mono pb-2 transition-colors"
            style={{
              color: mode === "signup" ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.35)",
              borderBottom: mode === "signup" ? "1px solid rgba(255,255,255,0.5)" : "1px solid transparent",
            }}
          >
            Sign Up
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-3">
          <div>
            <label className="text-[9px] uppercase tracking-wider block mb-1" style={{ color: "rgba(255,255,255,0.35)" }}>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full text-[12px] font-mono px-3 py-2 rounded-lg outline-none transition-colors"
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.1)",
                color: "rgba(255,255,255,0.9)",
              }}
              placeholder="you@email.com"
            />
          </div>
          <div>
            <label className="text-[9px] uppercase tracking-wider block mb-1" style={{ color: "rgba(255,255,255,0.35)" }}>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="w-full text-[12px] font-mono px-3 py-2 rounded-lg outline-none transition-colors"
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.1)",
                color: "rgba(255,255,255,0.9)",
              }}
              placeholder="Min 6 characters"
            />
          </div>

          {error && (
            <div className="text-[11px] px-3 py-2 rounded-lg" style={{ background: "rgba(248,81,73,0.1)", color: "#f85149", border: "1px solid rgba(248,81,73,0.2)" }}>
              {error}
            </div>
          )}

          {success && (
            <div className="text-[11px] px-3 py-2 rounded-lg" style={{ background: "rgba(63,185,80,0.1)", color: "#3fb950", border: "1px solid rgba(63,185,80,0.2)" }}>
              {success}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full text-[12px] font-mono font-semibold py-2.5 rounded-lg transition-all hover:brightness-110 disabled:opacity-50"
            style={{
              background: "rgba(255,255,255,0.12)",
              border: "1px solid rgba(255,255,255,0.25)",
              color: "rgba(255,255,255,0.95)",
            }}
          >
            {loading ? "..." : mode === "signin" ? "Sign In" : "Create Account"}
          </button>
        </form>
      </div>
    </div>
  );
}
