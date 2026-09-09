// Read-only reconnaissance on an EPMS page.
//
// EuroKids' "Generate Link" button sends the HDFC payment link to the parent
// itself, by email and SMS. To fire the same thing from the hub we need to know
// exactly what that button posts — and the one thing we must NOT do to find out
// is press it, because that would put a real payment link in front of a real
// family.
//
// So this fetches the page and reports its plumbing: form actions, field names,
// and any script that mentions a link or a payment. Nothing is submitted.
//
//   GET /api/epms/probe?path=/FeeCollection/ViewReceipt?ID=123
//
// Owner only. Requires EPMS_USER / EPMS_PASS in the Vercel environment.
import { NextRequest, NextResponse } from "next/server";
import { epmsLogin, epmsGet } from "@/lib/epms-session";
import { createClient } from "@supabase/supabase-js";

export const maxDuration = 60;

const OWNERS = new Set(["abhinav@ganya.in"]);

export async function GET(req: NextRequest) {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data } = await sb.auth.getUser(token);
  if (!data?.user || !OWNERS.has((data.user.email || "").toLowerCase())) {
    return NextResponse.json({ error: "Owner only." }, { status: 403 });
  }

  const path = req.nextUrl.searchParams.get("path");
  if (!path) return NextResponse.json({ error: "Give me ?path= — paste the URL from your EPMS address bar." }, { status: 400 });

  try {
    const jar = await epmsLogin();
    const html = await epmsGet(jar, path);

    // Forms: where they post to, and every field they carry.
    const forms = [...html.matchAll(/<form\b[^>]*>([\s\S]*?)<\/form>/gi)].map((m) => {
      const tag = m[0].slice(0, m[0].indexOf(">") + 1);
      const inner = m[1];
      return {
        action: (tag.match(/action\s*=\s*["']([^"']+)/i) || [])[1] || null,
        method: (tag.match(/method\s*=\s*["']([^"']+)/i) || [])[1] || "get",
        id: (tag.match(/\bid\s*=\s*["']([^"']+)/i) || [])[1] || null,
        fields: [...inner.matchAll(/<(?:input|select|textarea)\b[^>]*>/gi)]
          .map((f) => ({
            name: (f[0].match(/\bname\s*=\s*["']([^"']+)/i) || [])[1] || null,
            id: (f[0].match(/\bid\s*=\s*["']([^"']+)/i) || [])[1] || null,
            type: (f[0].match(/\btype\s*=\s*["']([^"']+)/i) || [])[1] || null,
            value: (f[0].match(/\bvalue\s*=\s*["']([^"']*)/i) || [])[1] ?? null,
          }))
          .filter((f) => f.name || f.id),
      };
    });

    // Any ajax URL the page knows about — this is usually where the answer is.
    const urls = [...new Set(
      [...html.matchAll(/url\s*:\s*["']([^"']+)["']|\$\.(?:post|get|ajax)\(\s*["']([^"']+)["']|action\s*=\s*["'](\/[^"']+)["']/gi)]
        .map((m) => m[1] || m[2] || m[3]).filter(Boolean),
    )];

    // Scripts that talk about links or payments, trimmed to something readable.
    const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)]
      .map((m) => m[1])
      .filter((s) => /generate\s*link|GenerateLink|PaymentLink|Paytm|POS|OnlineAmount/i.test(s))
      .map((s) => s.replace(/\s+/g, " ").trim().slice(0, 3000));

    return NextResponse.json({ ok: true, path, bytes: html.length, forms, urls, scripts });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
