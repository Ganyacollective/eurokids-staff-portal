// A signed-in EPMS session, server-side.
//
// The Edge Function that pulls the Payment Due report already does this, but it
// lives in Deno on Supabase. The hub's own server needs the same thing to reach
// pages the report API does not cover — chiefly Fee Collection, where EuroKids
// generates the HDFC payment link and sends it to the parent itself.
//
// EPMS has no CSRF token and no captcha on the login form: POST the credentials
// to the root and keep the cookies. Everything after that is a normal fetch.
//
// Needs EPMS_USER and EPMS_PASS in the Vercel environment (the same values that
// are already in the Supabase Edge Function secrets), and optionally EPMS_AY_ID.

export const EPMS = "https://epms.eurokidsindia.com";

export type Jar = Map<string, string>;

export function jarAdd(jar: Jar, res: Response) {
  const raw = (res.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
  for (const c of raw) {
    const [pair] = c.split(";");
    const i = pair.indexOf("=");
    if (i > 0) jar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
  }
}
export const jarHeader = (j: Jar) => [...j.entries()].map(([k, v]) => `${k}=${v}`).join("; ");

/** Logs in and selects the academic year. Throws if EPMS refuses. */
export async function epmsLogin(): Promise<Jar> {
  const user = process.env.EPMS_USER, pass = process.env.EPMS_PASS;
  if (!user || !pass) throw new Error("EPMS_USER / EPMS_PASS are not set in this environment.");

  const jar: Jar = new Map();
  const login = await fetch(`${EPMS}/`, {
    method: "POST", redirect: "manual",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ UserName: user, Password: pass }).toString(),
  });
  jarAdd(jar, login);
  if (!jar.size) throw new Error("EPMS login returned no session cookie — check EPMS_USER / EPMS_PASS.");

  const ay = await fetch(`${EPMS}/AcademicYear/AcademicYear`, {
    method: "POST", redirect: "manual",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: jarHeader(jar) },
    body: new URLSearchParams({ ID: process.env.EPMS_AY_ID ?? "100" }).toString(),
  });
  jarAdd(jar, ay);
  return jar;
}

/** GET a page inside the signed-in session. */
export async function epmsGet(jar: Jar, path: string): Promise<string> {
  const res = await fetch(path.startsWith("http") ? path : `${EPMS}${path}`, {
    headers: { Cookie: jarHeader(jar) },
  });
  jarAdd(jar, res);
  const html = await res.text();
  if (/name="UserName"/i.test(html)) throw new Error("EPMS bounced back to the login page.");
  return html;
}

/** POST a form inside the signed-in session. */
export async function epmsPost(jar: Jar, path: string, form: Record<string, string>) {
  const res = await fetch(path.startsWith("http") ? path : `${EPMS}${path}`, {
    method: "POST", redirect: "manual",
    headers: {
      Cookie: jarHeader(jar),
      "Content-Type": "application/x-www-form-urlencoded",
      "X-Requested-With": "XMLHttpRequest",
      Referer: `${EPMS}/`,
    },
    body: new URLSearchParams(form).toString(),
  });
  jarAdd(jar, res);
  return { status: res.status, body: await res.text() };
}
