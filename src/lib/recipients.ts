// Who should receive a given email.
//
// The rules the office actually uses:
//  · anyone already settled is never chased for money;
//  · a due-date reminder goes only to families whose next unpaid instalment
//    falls on or before the cutoff — a family whose money isn't due until the
//    10th must not get the "due on the 5th" letter;
//  · "settled" means our true position, after the discount that comes out of
//    our margin and after cash we hold but haven't posted to EPMS — never
//    EPMS's phantom due.

export type ScheduleRow = {
  uin: string;
  student_name: string;
  father_name: string | null;
  program_name: string | null;
  student_status: string | null;
  batch: string | null;
  parent_email1: string | null;
  parent_email2: string | null;
  final_fee: number | null;
  total_fee: number | null;
  collected: number | null;
  epms_due: number | null;
  our_discount: number | null;
  uncredited_cash: number | null;
  true_due: number | null;
  instalments: number;
  has_schedule: boolean;
  next_seq: number | null;
  next_amount: number | null;
  next_due_date: string | null;
  schedule_flag: string;
  days_overdue: number | null;
};

export type Filters = {
  classes?: string[];          // program names, e.g. ["Play Group","Nursery"]
  batches?: string[];          // e.g. ["Morning","Afternoon"]
  money?: "all" | "owing" | "settled" | "overdue";
  dueOnOrBefore?: string | null;   // YYYY-MM-DD — the exclusion rule
  missingSchedule?: boolean;       // only families with no schedule on file
  uins?: string[];                 // an explicit hand-picked list
};

const norm = (s: unknown) => String(s ?? "").trim().toLowerCase();

export function applyFilters(rows: ScheduleRow[], f: Filters): ScheduleRow[] {
  const classes = (f.classes || []).map(norm).filter(Boolean);
  const batches = (f.batches || []).map(norm).filter(Boolean);
  const pick = new Set((f.uins || []).map((u) => u.trim()).filter(Boolean));

  // A hand-picked list wins outright: if the sender named the children, no
  // other filter should quietly drop one of them.
  if (pick.size) return rows.filter((r) => pick.has(r.uin));

  return rows.filter((r) => {

    if (classes.length && !classes.includes(norm(r.program_name))) return false;
    if (batches.length && !batches.includes(norm(r.batch))) return false;

    const owed = Number(r.true_due || 0);

    if (f.missingSchedule && r.has_schedule) return false;

    switch (f.money) {
      case "owing":    if (owed <= 1) return false; break;
      case "settled":  if (owed > 1) return false; break;
      case "overdue":  if (owed <= 1 || r.schedule_flag !== "OVERDUE") return false; break;
      default: break;
    }

    // The cutoff rule. Anyone whose next unpaid instalment is later than the
    // cutoff is deliberately left out of this send.
    if (f.dueOnOrBefore) {
      if (owed <= 1) return false;
      if (!r.next_due_date) return false;
      if (r.next_due_date > f.dueOnOrBefore) return false;
    }

    return true;
  });
}

// Placeholder addresses that get typed into forms when nobody has a real one.
// Deliberately a short, exact list — a real parent may well be "abc@gmail.com",
// so only the unmistakable stand-ins are rejected.
const PLACEHOLDER_LOCAL = new Set([
  "na", "n/a", "nil", "none", "no", "noemail", "no-email", "nomail",
  "dummy", "test", "xx", "xxx", "-", "_",
]);

export function isRealAddress(raw: string | null | undefined): boolean {
  const e = (raw || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/.test(e)) return false;
  const [local, domain] = e.split("@");
  if (PLACEHOLDER_LOCAL.has(local)) return false;
  if (domain === "example.com" || domain === "test.com") return false;
  return true;
}

export function addressesFor(r: ScheduleRow): string[] {
  return [...new Set(
    [r.parent_email1, r.parent_email2]
      .map((e) => (e || "").trim().toLowerCase())
      .filter(isRealAddress),
  )];
}

export function summarise(rows: ScheduleRow[]) {
  const withEmail = rows.filter((r) => addressesFor(r).length > 0);
  return {
    children: rows.length,
    reachable: withEmail.length,
    unreachable: rows.length - withEmail.length,
    addresses: new Set(withEmail.flatMap(addressesFor)).size,
    owed: Math.round(rows.reduce((s, r) => s + Number(r.true_due || 0), 0)),
  };
}
