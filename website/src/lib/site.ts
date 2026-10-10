// Reading the website's content.
//
// This runs with the anon key against a row-level-security policy that only
// returns published rows, so an unpublished card cannot leak even if somebody
// guesses its address. Nothing here can write.

import { createClient } from "@supabase/supabase-js";

// Not named URL: that is the global constructor, and shadowing it broke
// embedUrl() below in a way the error message blamed on the wrong line.
const SUPA = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const db = () =>
  createClient(SUPA, ANON, { auth: { persistSession: false }, db: { schema: "eurokids" } });

// The bucket is public, so a file has a plain permanent address. No signing:
// there is no secret in a photograph of a Christmas play, and a signed URL
// would expire in the middle of somebody's visit and break every CDN cache
// on the way.
export const mediaUrl = (path?: string | null) =>
  path ? `${SUPA}/storage/v1/object/public/site/${path}` : null;

// Small knobs the hub can turn without a deploy — the speed of the card row,
// and whatever comes after it.
export async function getSetting(key: string, fallback: string): Promise<string> {
  const { data } = await db().from("site_setting").select("value").eq("key", key).maybeSingle();
  return data?.value ?? fallback;
}

export type Card = {
  id: number;
  slug: string;
  title: string;
  blurb: string | null;
  artwork_path: string | null;
  video_path: string | null;
  video_url: string | null;
};

export type CardMedia = {
  id: number;
  kind: "image" | "video";
  path: string;
  caption: string | null;
};

export async function listCards(): Promise<Card[]> {
  const { data } = await db().from("site_card")
    .select("id, slug, title, blurb, artwork_path, video_path, video_url")
    .eq("published", true)
    .order("sort").order("id");
  return data || [];
}

export async function getCard(slug: string): Promise<{ card: Card; media: CardMedia[] } | null> {
  const a = db();
  const { data: card } = await a.from("site_card")
    .select("id, slug, title, blurb, artwork_path, video_path, video_url")
    .eq("slug", slug).eq("published", true).maybeSingle();
  if (!card) return null;
  const { data: media } = await a.from("site_card_media")
    .select("id, kind, path, caption").eq("card_id", card.id).order("sort").order("id");
  return { card, media: (media || []) as CardMedia[] };
}

// A pasted YouTube or Vimeo address, turned into the one that can be framed.
// Accepts what people actually paste — a watch link, a share link, a youtu.be
// link, or an embed link already.
export function embedUrl(raw?: string | null): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    const host = u.hostname.replace(/^www\./, "");
    if (host === "youtu.be") return `https://www.youtube.com/embed/${u.pathname.slice(1)}`;
    if (host.endsWith("youtube.com")) {
      if (u.pathname.startsWith("/embed/")) return raw;
      if (u.pathname.startsWith("/shorts/")) return `https://www.youtube.com/embed/${u.pathname.split("/")[2]}`;
      const v = u.searchParams.get("v");
      return v ? `https://www.youtube.com/embed/${v}` : raw;
    }
    if (host.endsWith("vimeo.com")) {
      const id = u.pathname.split("/").filter(Boolean)[0];
      return id ? `https://player.vimeo.com/video/${id}` : raw;
    }
    return raw;
  } catch {
    return null;
  }
}
