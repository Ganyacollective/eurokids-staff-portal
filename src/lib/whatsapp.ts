// WhatsApp to parents, through Meta's Cloud API. It only works once the school
// has a WhatsApp Business account with an approved message template; until
// then every call here returns "not_configured" and the hub falls back to a
// one-tap wa.me link the coordinator sends by hand.
//
// Env: WHATSAPP_TOKEN (permanent system-user token), WHATSAPP_PHONE_NUMBER_ID,
//      WHATSAPP_WELCOME_TEMPLATE (default enquiry_welcome), WHATSAPP_LANG (default en).
// Note: WHATSAPP_PHONE / WHATSAPP_API_KEY belong to CallMeBot, the HR
// self-notification used by the leave form. They are not this.

export type WaResult = { status: "sent" | "not_configured" | "failed"; id?: string; error?: string };

export const waNumber = (p: string) => {
  const d = String(p || "").replace(/\D/g, "");
  return d.length === 10 ? "91" + d : d;          // Indian mobiles are the norm here
};

export function waLink(phone: string, text: string) {
  return `https://wa.me/${waNumber(phone)}?text=${encodeURIComponent(text)}`;
}

export async function sendWhatsApp(opts: { to: string; template: string; params?: string[]; lang?: string }): Promise<WaResult> {
  const token = process.env.WHATSAPP_TOKEN, phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneId) return { status: "not_configured" };
  try {
    const r = await fetch(`https://graph.facebook.com/v20.0/${phoneId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        messaging_product: "whatsapp", to: waNumber(opts.to), type: "template",
        template: {
          name: opts.template, language: { code: opts.lang || process.env.WHATSAPP_LANG || "en" },
          components: opts.params?.length ? [{ type: "body", parameters: opts.params.map((p) => ({ type: "text", text: p })) }] : [],
        },
      }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { status: "failed", error: j?.error?.message || `HTTP ${r.status}` };
    return { status: "sent", id: j?.messages?.[0]?.id };
  } catch (e) {
    return { status: "failed", error: (e as Error).message };
  }
}
