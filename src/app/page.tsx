import { redirect } from "next/navigation";

// Vestigial route — the next.config.ts `beforeFiles` rewrite resolves "/" to
// the static cloud portal at /portal.html before this file is ever consulted.
// This redirect is a belt-and-braces fallback in case the rewrite is bypassed.
export default function Home() {
  redirect("/portal.html");
}
