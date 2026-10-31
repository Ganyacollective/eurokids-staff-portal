// The website, editable from the hub.
//
// Until now the only way to change a card was somebody running SQL, which is
// not a system — it means the website can only be changed by me, and only
// while I am here. This is the screen that ends that.
//
// Uploads do not pass through this route. A serverless function has a body
// limit of a few megabytes and a video of the annual function is two hundred,
// so the browser is handed a signed URL and puts the file straight into
// storage. This route decides whether somebody may upload and where the file
// goes; it never carries the bytes.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET = "site";

// What the bucket itself will accept, repeated here so a wrong file is refused
// before an upload URL is issued rather than after the upload fails.
const IMAGE = ["image/jpeg", "image/png", "image/webp", "image/avif", "image/gif"];
const VIDEO = ["video/mp4", "video/webm", "video/quicktime"];

const EXT: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/avif": "avif",
  "image/gif": "gif", "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov",
};

// A slug becomes a public URL, so it may hold only what is safe in one.
const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);


// Telling the website that something changed.
//
// Its pages are cached at the edge, so an edit used to appear up to ten
// minutes later — long after the person who made it had decided the feature
// did not work. Fire-and-forget: a card is saved whether or not the website
// answers, and the ten-minute expiry still catches anything this misses.
async function nudgeSite(slug?: string | null) {
  const base = process.env.NEXT_PUBLIC_WEBSITE_URL || "https://eurokids-website.vercel.app";
  const secret = process.env.SITE_REVALIDATE_SECRET;
  if (!secret) return { ok: false, why: "SITE_REVALIDATE_SECRET is not set on this deployment." };
  try {
    const r = await fetch(`${base}/api/revalidate`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${secret}` },
      body: JSON.stringify({ slug: slug || null }),
      signal: AbortSignal.timeout(8000),
    });
    return r.ok ? { ok: true } : { ok: false, why: `the website answered ${r.status}` };
  } catch (e) {
    return { ok: false, why: (e as Error).message };
  }
}

async function gate(req: NextRequest) {
  const auth = req.headers.get("authorization") || "";
  if (!auth.toLowerCase().startsWith("bearer ")) return { error: "Not signed in.", status: 401 as const };

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const asUser = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { global: { headers: { Authorization: auth } } });
  const { data: who } = await asUser.auth.getUser();
  if (!who?.user) return { error: "Not signed in.", status: 401 as const };

  const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  // Its own permission, not Admission's and not admin's.
  //
  // Working the enquiry book and changing what every prospective parent sees
  // are different jobs, and the person with the Canva files is not
  // necessarily an admin. Checked here and not only in the page, because a
  // hidden tab is not a permission.
  const [{ data: mods }, { data: prof }] = await Promise.all([
    admin.from("module_access").select("module").eq("user_id", who.user.id).eq("module", "website"),
    admin.from("profiles").select("role, full_name").eq("id", who.user.id).maybeSingle(),
  ]);
  if (!((mods && mods.length) || prof?.role === "admin")) {
    return { error: "You need the Website permission.", status: 403 as const };
  }

  return { admin, user: who.user, name: prof?.full_name || who.user.email || "someone" };
}

export async function GET(req: NextRequest) {
  const g = await gate(req);
  if ("error" in g) return NextResponse.json({ ok: false, error: g.error }, { status: g.status });

  const tbl = g.admin.schema("eurokids");
  const [{ data: cards }, { data: media }, { data: settings }] = await Promise.all([
    tbl.from("site_card").select("*").order("sort").order("id"),
    tbl.from("site_card_media").select("*").order("card_id").order("sort").order("id"),
    tbl.from("site_setting").select("*").order("key"),
  ]);

  return NextResponse.json({
    ok: true,
    base: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET}/`,
    site: process.env.NEXT_PUBLIC_WEBSITE_URL || "https://eurokids-website.vercel.app",
    cards: cards || [], media: media || [], settings: settings || [],
  });
}

export async function POST(req: NextRequest) {
  const g = await gate(req);
  if ("error" in g) return NextResponse.json({ ok: false, error: g.error }, { status: g.status });
  const { admin, name } = g;
  const tbl = admin.schema("eurokids");

  const b = await req.json().catch(() => ({}));
  const action = String(b.action || "");

  // ── a place to put a file ────────────────────────────────────────────────
  //
  // The browser uploads to this URL itself. The path is decided here, never
  // sent by the client: a client-chosen path is a client-chosen place to
  // overwrite, and this bucket is served to the public.
  if (action === "upload_url") {
    const type = String(b.content_type || "");
    const kind = String(b.kind || "");             // artwork | gallery | video
    const allowed = kind === "video" ? VIDEO : IMAGE;
    if (!allowed.includes(type)) {
      return NextResponse.json({ ok: false,
        error: kind === "video" ? "That is not a video file we can show (mp4, webm or mov)."
                                : "That is not an image we can show (jpg, png, webp, avif or gif)." }, { status: 400 });
    }
    const slug = slugify(String(b.slug || "card")) || "card";
    // The timestamp means re-uploading never overwrites the file a cached page
    // is still pointing at, and never needs a cache purge to take effect.
    const path = `${kind === "gallery" ? "gallery" : kind === "video" ? "video" : "cards"}/${slug}-${Date.now()}.${EXT[type]}`;

    const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, path, token: data.token, bucket: BUCKET });
  }

  // ── a card ───────────────────────────────────────────────────────────────
  if (action === "save_card") {
    const id = Number(b.id) || null;
    const title = String(b.title || "").trim();
    if (!title) return NextResponse.json({ ok: false, error: "A card needs a title." }, { status: 400 });

    const patch: Record<string, unknown> = {
      title,
      slug: slugify(String(b.slug || title)),
      blurb: String(b.blurb || "").trim() || null,
      video_url: String(b.video_url || "").trim() || null,
      published: !!b.published,
      // Whether the site draws its own WATCH NOW circle. Most of the artwork
      // already has one painted in, so the default for an existing card is
      // whatever it is set to; a card arriving without the field is a new one
      // and gets the badge, because artwork with no badge and no circle drawn
      // has no call to action at all.
      show_badge: b.show_badge === undefined ? true : !!b.show_badge,
      sort: Number(b.sort) || 0,
      updated_at: new Date().toISOString(),
    };
    // Only overwrite a file path when a new file was actually uploaded —
    // otherwise saving a title would quietly remove the artwork.
    if (b.artwork_path !== undefined) patch.artwork_path = b.artwork_path || null;
    if (b.video_path !== undefined) patch.video_path = b.video_path || null;

    if (id) {
      const { error } = await tbl.from("site_card").update(patch).eq("id", id);
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, id, site: await nudgeSite(patch.slug as string) });
    }
    patch.created_by = name;
    const { data, error } = await tbl.from("site_card").insert(patch).select("id").maybeSingle();
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, id: data?.id, site: await nudgeSite(patch.slug as string) });
  }

  if (action === "delete_card") {
    const id = Number(b.id);
    if (!id) return NextResponse.json({ ok: false, error: "Which card?" }, { status: 400 });

    // The files first, then the rows — the same order as everywhere else, so a
    // failure leaves files with rows pointing at them rather than orphans in a
    // bucket nobody can find.
    const [{ data: card }, { data: media }] = await Promise.all([
      tbl.from("site_card").select("artwork_path, video_path").eq("id", id).maybeSingle(),
      tbl.from("site_card_media").select("path").eq("card_id", id),
    ]);
    const paths = [card?.artwork_path, card?.video_path, ...(media || []).map(m => m.path)].filter(Boolean) as string[];
    if (paths.length) await admin.storage.from(BUCKET).remove(paths);

    await tbl.from("site_card_media").delete().eq("card_id", id);
    const { error } = await tbl.from("site_card").delete().eq("id", id);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, site: await nudgeSite() });
  }

  if (action === "reorder") {
    const ids: number[] = Array.isArray(b.ids) ? b.ids.map(Number).filter(Boolean) : [];
    for (let i = 0; i < ids.length; i++) await tbl.from("site_card").update({ sort: i + 1 }).eq("id", ids[i]);
    return NextResponse.json({ ok: true, count: ids.length, site: await nudgeSite() });
  }

  // ── photos and videos on a card ──────────────────────────────────────────
  if (action === "add_media") {
    const card_id = Number(b.card_id);
    const path = String(b.path || "");
    if (!card_id || !path) return NextResponse.json({ ok: false, error: "Which card, and which file?" }, { status: 400 });
    const kind = b.kind === "video" ? "video" : "image";
    const { data: last } = await tbl.from("site_card_media").select("sort").eq("card_id", card_id)
      .order("sort", { ascending: false }).limit(1).maybeSingle();
    const { error } = await tbl.from("site_card_media").insert({
      card_id, kind, path, caption: String(b.caption || "").trim() || null, sort: (last?.sort ?? 0) + 1,
    });
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, site: await nudgeSite() });
  }

  if (action === "delete_media") {
    const id = Number(b.id);
    if (!id) return NextResponse.json({ ok: false, error: "Which one?" }, { status: 400 });
    const { data: m } = await tbl.from("site_card_media").select("path").eq("id", id).maybeSingle();
    if (m?.path) await admin.storage.from(BUCKET).remove([m.path]);
    const { error } = await tbl.from("site_card_media").delete().eq("id", id);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, site: await nudgeSite() });
  }

  // ── the knobs ────────────────────────────────────────────────────────────
  if (action === "set_setting") {
    const key = String(b.key || "").trim();
    const value = String(b.value ?? "").trim();
    if (!key) return NextResponse.json({ ok: false, error: "Which setting?" }, { status: 400 });
    const { error } = await tbl.from("site_setting").upsert({
      key, value, updated_by: name, updated_at: new Date().toISOString(),
    }, { onConflict: "key" });
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, site: await nudgeSite() });
  }

  return NextResponse.json({ ok: false, error: "Unknown action." }, { status: 400 });
}
