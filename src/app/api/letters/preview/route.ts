import { NextResponse } from "next/server";
import { requireLetters, admin, findStaff, salaryOf, currentTemplate } from "@/lib/letters-auth";
import { mergeLetter, LetterTemplate, StaffRecord } from "@/lib/letter-merge";
import { renderLetterPdf } from "@/lib/letter-pdf";

// POST /api/letters/preview — the letter as it would go out, nothing saved.
// The editor calls this on every change, so it must be fast and must never
// touch a row.
export async function POST(req: Request) {
  const who = await requireLetters(req);
  if (!who.ok) return NextResponse.json({ ok: false, error: who.error }, { status: who.status });

  const body = await req.json().catch(() => ({}));
  const a = admin();
  const emp = await findStaff(a, String(body.employee_id || ""));
  if (!emp) return NextResponse.json({ ok: false, error: "That person is not on the roster." }, { status: 404 });

  const tpl = (body.template as LetterTemplate) || (await currentTemplate(a));
  if (!tpl) return NextResponse.json({ ok: false, error: "No letter template has been set up yet." }, { status: 400 });

  // The salary comes from the pay book unless the letter is being written for
  // a figure that has not been entered there yet — a new joiner, usually.
  const salary = Number(body.salary ?? 0) > 0 ? Number(body.salary) : await salaryOf(a, emp.id);
  // Overrides from the editor, so a correction can be seen before it is saved
  // back to the employee record.
  const merged: StaffRecord = { ...emp, ...(body.overrides || {}) };

  const pdf = await renderLetterPdf(mergeLetter({
    employee: merged, template: tpl, salary,
    issuedOn: new Date(), startsOn: body.starts_on || merged.joining_date,
    signedByName: body.signed_by_name, signedByRole: body.signed_by_role,
    signUrl: null,
  }));

  return new NextResponse(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="preview.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
