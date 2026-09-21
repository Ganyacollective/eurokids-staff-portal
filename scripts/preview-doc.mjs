// Render a parent declaration to a PDF, straight from the live template, so a
// wording change can be looked at before anyone is asked to sign it.
//
//   node --experimental-strip-types scripts/preview-doc.mjs daycare-pickup out.pdf
//
// Reads the same template row the send route reads and runs it through the
// same buildDoc / renderDocumentPdf, so what comes out is what a parent gets.

import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { buildDoc } from "../src/lib/docs-auth.ts";
import { renderDocumentPdf } from "../src/lib/doc-pdf.ts";

for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m) process.env[m[1]] ??= m[2].replace(/^["']|["']$/g, "").trim();
}

const slug = process.argv[2] || "daycare-pickup";
const out = process.argv[3] || "declaration.pdf";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } });
const { data: tpl, error } = await db.from("document_template").select("*").eq("slug", slug).single();
if (error) throw error;

const sample = {
  pickup_point: "the gate of Euro Kids GMB School, Mohammadwadi",
  pickup_time: "12:30 pm",
  pickup_days: "Monday to Friday",
  drop_point: "Bungalow 1, JMD Enclave",
  drop_time: "6:30 pm",
  authorised_persons: "Mr Rohan Deshmukh (father), Mrs Sneha Deshmukh (mother)",
  parent_phone: "+91 98220 11223",
  emergency_contact: "+91 98220 44556",
};

const doc = buildDoc(tpl, {
  childName: "Aarav Deshmukh",
  childUin: "EK/1769/0142",
  partyName: "Mrs Sneha Deshmukh",
  email: "sneha.deshmukh@example.com",
  phone: sample.parent_phone,
  values: sample,
}, { signUrl: "https://admin.eurokidsjmdenclave.org/declare#SAMPLE" });

fs.writeFileSync(path.resolve(out), await renderDocumentPdf(doc));
console.log("wrote", out);
