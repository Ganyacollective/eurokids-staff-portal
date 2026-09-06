import { type NextRequest, NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

type CookieToSet = { name: string; value: string; options: CookieOptions };

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  const { data: { user } } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isPublic =
    path === "/" ||
    path === "/portal.html" ||
    path === "/teacher.html" ||
    path === "/hub.html" ||
    path.startsWith("/portal") ||
    path.startsWith("/staff") ||
    path.startsWith("/hub") ||
    path.startsWith("/teacher") ||
    path.startsWith("/login") ||
    path.startsWith("/reset-password") ||
    path.startsWith("/_next") ||
    path === "/favicon.ico";
  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    // Static assets must never touch the auth check: it costs a Supabase round
    // trip per request, and a stylesheet redirected to /login silently breaks
    // the page it was meant to style.
    "/((?!api|_next/static|_next/image|brand/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|woff|woff2|ttf|webmanifest)$).*)",
  ],
};
