"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function UpdatePasswordForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [recoveryReady, setRecoveryReady] = useState(false);

  // Listen for the PASSWORD_RECOVERY auth event so we know the user landed via a recovery link.
  useEffect(() => {
    const supabase = createClient();
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
        setRecoveryReady(true);
      }
    });
    // Also: if there's already a session (Supabase auto-processes the URL hash on load), allow it.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setRecoveryReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const formData = new FormData(e.currentTarget);
    const password = String(formData.get("password") || "");
    const confirm = String(formData.get("confirm") || "");
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      setPending(false);
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      setPending(false);
      return;
    }
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setError(error.message);
      setPending(false);
      return;
    }
    setSuccess(true);
    setPending(false);
    setTimeout(() => router.push("/dashboard"), 1200);
  }

  if (success) {
    return (
      <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg p-3 text-center">
        Password updated. Taking you to your dashboard…
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label className="text-sm font-medium text-gray-700 block mb-1">New password</label>
        <input
          name="password"
          type="password"
          required
          minLength={8}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-eurokids-blue/40 focus:border-eurokids-blue text-sm"
        />
        <div className="text-xs text-gray-400 mt-1">At least 8 characters.</div>
      </div>
      <div>
        <label className="text-sm font-medium text-gray-700 block mb-1">Confirm new password</label>
        <input
          name="confirm"
          type="password"
          required
          minLength={8}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-eurokids-blue/40 focus:border-eurokids-blue text-sm"
        />
      </div>

      {!recoveryReady && (
        <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">
          Waiting for the recovery link to be processed… If this persists, click the email link again.
        </div>
      )}
      {error && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">{error}</div>
      )}

      <button
        type="submit"
        disabled={pending || !recoveryReady}
        className="w-full bg-eurokids-orange hover:bg-eurokids-orange/90 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg transition-colors"
      >
        {pending ? "Updating…" : "Set new password"}
      </button>
    </form>
  );
}
