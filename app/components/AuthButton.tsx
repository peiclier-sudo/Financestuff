"use client";

import { useState } from "react";
import { useAuth } from "@/lib/useAuth";
import AuthModal from "./AuthModal";

export default function AuthButton() {
  const { user, loading, signIn, signUp, signOut, configured } = useAuth();
  const [showModal, setShowModal] = useState(false);

  if (!configured) return null;
  if (loading) return null;

  if (user) {
    const email = user.email ?? "";
    const display = email.length > 16 ? email.slice(0, 14) + "..." : email;
    return (
      <div className="flex items-center gap-2">
        <span className="text-[9px] font-mono" style={{ color: "rgba(255,255,255,0.4)" }}>
          {display}
        </span>
        <button
          onClick={() => signOut()}
          className="text-[9px] font-mono px-2 py-0.5 rounded transition-colors hover:bg-white/10"
          style={{ color: "rgba(255,255,255,0.3)", border: "1px solid rgba(255,255,255,0.08)" }}
        >
          Sign Out
        </button>
      </div>
    );
  }

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="text-[9px] font-mono px-2 py-0.5 rounded transition-colors hover:bg-white/10"
        style={{ color: "rgba(255,255,255,0.4)", border: "1px solid rgba(255,255,255,0.08)" }}
      >
        Sign In
      </button>
      {showModal && (
        <AuthModal
          onClose={() => setShowModal(false)}
          onSignIn={async (email, password) => { await signIn(email, password); setShowModal(false); }}
          onSignUp={signUp}
        />
      )}
    </>
  );
}
