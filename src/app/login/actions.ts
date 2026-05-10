"use server";

import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";

export async function login(formData: FormData) {
  const identifier = String(formData.get("identifier") || "").trim();
  const password = String(formData.get("password") || "");

  if (!identifier || !password) {
    redirect("/login?error=" + encodeURIComponent("Both fields are required."));
  }

  const supabase = await createServerClient();

  // Heuristic: if identifier contains @, treat as email; else treat as phone.
  // Phone is normalized to E.164 by prepending +91 if it's 10 digits.
  let credential;
  if (identifier.includes("@")) {
    credential = { email: identifier, password };
  } else {
    let phone = identifier.replace(/\D/g, "");
    if (phone.length === 10) phone = "+91" + phone;
    else if (!phone.startsWith("+")) phone = "+" + phone;
    credential = { phone, password };
  }

  const { error } = await supabase.auth.signInWithPassword(credential);
  if (error) {
    redirect("/login?error=" + encodeURIComponent(error.message));
  }

  redirect("/");
}

export async function logout() {
  const supabase = await createServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}
