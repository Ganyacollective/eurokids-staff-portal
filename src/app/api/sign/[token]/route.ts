import { NextResponse } from "next/server";
import { admin, logEvent } from "@/lib/letters-auth";

export type SignView = {
  ok: boolean; error?: string;
  status?: string; name?: string; designation?: string; school?: string;
  issued_on?: string; starts_on?: string | null;
  email_hint?: string; phone_hint?: string;
  signed_at?: string | null; signer_name?: string | null;
};

// The public face of a letter. Deliberately thin: a name, a role and a status.
// Nobody needs the salary to decide whether to open the PDF, and this endpoint
// is reachable by anyone holding the link.
export async function GET(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const a = admin();
  const { data: l } = await a.from("appointment_letter")
    .select("id, status, employee_name, snapshot, issued_on, starts_on, to_email, to_phone, token_expires_at, signed_at, signer_name")
    .eq("token", token).maybeSingle();

  if (!l) return NextResponse.json({ ok: false, error: "This link is not valid. Ask the school to send it again." }, { status: 404 });
  if (l.token_expires_at && new Date(l.token_expires_at) < new Date()) {
    return NextResponse.json({ ok: false, error: "This link has expired. Ask the school for a fresh one." }, { status: 410 });
  }

  // First open is worth recording — it is the difference between "she never
  // got it" and "she has had it for a week".
  if (l.status === "sent") {
    await a.from("appointment_letter").update({ status: "viewed", viewed_at: new Date().toISOString() }).eq("id", l.id);
    await logEvent(a, l.id, "viewed", {}, req);
  }

  const snap = (l.snapshot || {}) as { data?: { designation?: string; issuedOn?: string } };
  const mask = (s?: string | null) => {
    const v = String(s || "");
    if (!v.includes("@")) return v ? "•••• " + v.slice(-4) : "";
    const [u, d] = v.split("@");
    return `${u.slice(0, 2)}${"•".repeat(Math.max(2, u.length - 2))}@${d}`;
  };

  return NextResponse.json({
    ok: true,
    status: l.status,
    name: l.employee_name,
    designation: snap.data?.designation || "",
    school: "EuroKids JMD Enclave",
    issued_on: snap.data?.issuedOn || l.issued_on,
    starts_on: l.starts_on,
    email_hint: mask(l.to_email),
    phone_hint: mask(l.to_phone),
    signed_at: l.signed_at,
    signer_name: l.signer_name,
  } as SignView);
}
