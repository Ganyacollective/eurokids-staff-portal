// The photograph the reception tablet took when an enquiry was submitted.
//
// The bucket it lives in is private and has no read policy at all, so there
// is no browser path to these files. This route is the only way in, and it
// checks the caller may already see the enquiry itself before handing one
// over. The image is streamed rather than signed: a signed URL would be
// shareable by anyone who saw it, and these are pictures of people's faces.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") || "";
  if (!auth.toLowerCase().startsWith("bearer ")) {
    return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const asUser = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: auth } },
  });
  const { data: who } = await asUser.auth.getUser();
  if (!who?.user) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });

  const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

  // A permission of its own.
  //
  // This used to accept Admission or Finance — the same tick that lets someone
  // work the enquiry list. But reading a family's phone number and looking at
  // a photograph of them are not the same act, and most of the people who need
  // the first have no reason for the second. So "Enquiry photos" is granted
  // deliberately, to named people, and is checked here rather than merely
  // hidden in the page: a hidden button is not a permission, and this URL is
  // guessable.
  const [{ data: mods }, { data: prof }] = await Promise.all([
    admin.from("module_access").select("module").eq("user_id", who.user.id)
      .eq("module", "enquiry_photos"),
    admin.from("profiles").select("role").eq("id", who.user.id).maybeSingle(),
  ]);
  if (!((mods && mods.length) || prof?.role === "admin")) {
    return NextResponse.json({ ok: false, error: "You do not have access to enquiry photos." }, { status: 403 });
  }

  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!id) return NextResponse.json({ ok: false, error: "Which enquiry?" }, { status: 400 });

  const { data: row } = await admin.schema("eurokids").from("enquiry")
    .select("intake_photo").eq("id", id).maybeSingle();
  if (!row?.intake_photo) {
    return NextResponse.json({ ok: false, error: "No photo for that enquiry." }, { status: 404 });
  }

  const { data: file, error } = await admin.storage.from("intake").download(row.intake_photo);
  if (error || !file) {
    return NextResponse.json({ ok: false, error: error?.message || "Could not read it." }, { status: 500 });
  }

  return new NextResponse(Buffer.from(await file.arrayBuffer()), {
    headers: {
      "Content-Type": row.intake_photo.endsWith(".webp") ? "image/webp" : "image/jpeg",
      // Private, and never by a shared cache: this is one person's face shown
      // to one member of staff.
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
