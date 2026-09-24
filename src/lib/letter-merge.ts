// Turning an employee record into a letter.
//
// Nothing here is typed twice. The name, address, designation, timings and
// bank details already live on the employee in the staff portal; the salary
// lives in the pay book behind its own grant. A letter is those two things
// merged into a template — which is why generating one should be a button,
// not an afternoon.

import { type LetterData, rupeesInWords, rs } from "./letter-pdf";

// The roster as the staff portal stores it, in portal_state.data.employees.
export type StaffRecord = {
  id: string;
  display_name: string;
  department?: string | null;
  designation?: string | null;
  reporting_minutes?: number | null;
  punch_out_minutes?: number | null;
  joining_date?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  bank_name?: string | null;
  bank_account?: string | null;
  bank_ifsc?: string | null;
  bank_account_name?: string | null;
  schedule_type?: string | null;     // teaching | day_care | admin | support
  reports_to?: string | null;
  works_through_vacations?: boolean;
  is_active?: boolean;
};

export type LetterTemplate = {
  id?: number;
  title: string;
  page1_body: string;
  terms: { heading: string; body: string }[];
  closing?: string | null;
  quote?: string | null;
  quote_by?: string | null;
};

export const SCHEDULE_LABEL: Record<string, string> = {
  teaching: "Teacher — Monday to Saturday, two Saturdays off",
  day_care: "Day care — Monday to Saturday, every Saturday",
  admin: "Office — Monday to Saturday, two Saturdays off",
  support: "Support staff — Monday to Saturday",
};

// The long version, for the terms page. The short version, for the panel on
// page one. A teacher cares about exactly one thing here: am I working this
// Saturday or not.
const WORKING_DAYS: Record<string, string> = {
  teaching: "You work Monday to Saturday. Two Saturdays in every month are off, and the school tells you which two at the start of the month.",
  day_care: "You work Monday to Saturday, including every Saturday — the day-care wing does not close on Saturdays. It also runs through the school vacations, so your calendar is not the same as a classroom teacher's.",
  admin: "You work Monday to Saturday. Two Saturdays in every month are off, and the school tells you which two at the start of the month.",
  support: "You work Monday to Saturday.",
};
const WORKING_DAYS_SHORT: Record<string, string> = {
  teaching: "Monday to Saturday · two Saturdays off",
  day_care: "Monday to Saturday · every Saturday worked",
  admin: "Monday to Saturday · two Saturdays off",
  support: "Monday to Saturday",
};

export const scheduleOf = (e: StaffRecord) =>
  e.schedule_type
  || (/day\s*care|daycare/i.test(e.designation || "") ? "day_care"
    : e.department === "Teacher" ? "teaching"
    : e.department === "Support Staff" ? "support" : "admin");

// 495 → "8:15 am". The portal stores minutes past midnight, which is right
// for arithmetic and unreadable in a letter.
export function clock(min?: number | null): string {
  if (min == null || !Number.isFinite(Number(min))) return "";
  const m = ((Math.round(Number(min)) % 1440) + 1440) % 1440;
  const h24 = Math.floor(m / 60), mm = m % 60;
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h}:${String(mm).padStart(2, "0")} ${h24 < 12 ? "am" : "pm"}`;
}

export const longDate = (d?: string | null) =>
  d ? new Date(String(d).slice(0, 10) + "T00:00:00Z").toLocaleDateString("en-IN",
    { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }) : "";

// Only the last four. A full account number on a letter that travels by email
// is a liability, and she knows which account it is from four digits.
const maskAccount = (a?: string | null) => {
  const s = String(a || "").replace(/\s+/g, "");
  return s.length > 4 ? `account ending ${s.slice(-4)}` : "";
};

export function fill(tpl: string, vars: Record<string, string>) {
  return String(tpl || "").replace(/\{\{(\w+)\}\}/g, (_m, k) => vars[k] ?? "");
}

// The school's own people, in one place rather than scattered through the
// template. Overridable per letter from the editor.
export const PRINCIPAL = "Neeta Saxena";
// As the agreement itself signs off: "Name: Neeta Saxena / Designation:
// Owner and Director".
export const SIGNATORY = { name: PRINCIPAL, role: "Owner and Director" };

export type MergeInput = {
  employee: StaffRecord;
  template: LetterTemplate;
  salary: number;
  issuedOn: Date;
  startsOn?: string | null;
  signedByName?: string;
  signedByRole?: string;
  schoolSignaturePng?: string | null;
  signature?: LetterData["signature"];
  signUrl?: string | null;
};

export function mergeLetter(inp: MergeInput): LetterData {
  const e = inp.employee;
  const issued = inp.issuedOn.toLocaleDateString("en-IN",
    { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" });
  const sched = scheduleOf(e);
  const start = inp.startsOn || e.joining_date || null;
  const bank = maskAccount(e.bank_account);

  const vars: Record<string, string> = {
    name: e.display_name || "",
    first_name: (e.display_name || "").trim().split(/\s+/)[0] || "",
    designation: e.designation || "Teacher",
    department: e.department || "",
    start_date: longDate(start) || "your date of joining",
    working_days: WORKING_DAYS[sched] || WORKING_DAYS.teaching,
    working_days_short: WORKING_DAYS_SHORT[sched] || WORKING_DAYS_SHORT.teaching,
    start_time: clock(e.reporting_minutes) || "the time agreed with you",
    end_time: clock(e.punch_out_minutes) || "the end of your shift",
    salary_figure: rs(inp.salary),
    salary_words: rupeesInWords(inp.salary),
    // Reads as " (…) " only when we actually hold the details.
    bank_tail: bank ? ` — ${e.bank_name ? e.bank_name + ", " : ""}${bank}` : "",
    bank_name: e.bank_name || "",
    reports_to: e.reports_to || `the Principal, ${PRINCIPAL}`,
    school: "EuroKids JMD Enclave",
    issue_date: issued,
  };

  // Four lines at most, and the tail is joined rather than dropped: a letter
  // that loses "Pune 411060" off the bottom of the address is not a letter.
  const bits = String(e.address || "")
    .split(/\n|,\s*/).map((x) => x.trim()).filter(Boolean);
  const address = bits.length > 4
    ? [...bits.slice(0, 3), bits.slice(3).join(", ")]
    : bits;

  return {
    name: e.display_name,
    address,
    designation: vars.designation,
    issuedOn: issued,
    title: inp.template.title || "Letter of Appointment",
    page1Body: fill(inp.template.page1_body, vars),
    terms: (inp.template.terms || []).map((t) => ({
      heading: t.heading, body: fill(t.body, vars),
    })),
    closing: inp.template.closing ? fill(inp.template.closing, vars) : null,
    signedByName: inp.signedByName || SIGNATORY.name,
    signedByRole: inp.signedByRole || SIGNATORY.role,
    schoolSignaturePng: inp.schoolSignaturePng,
    signature: inp.signature,
    signUrl: inp.signUrl,
  };
}

// What the letter needs before it can go out. Said plainly, so the screen can
// list what is missing instead of producing a letter with gaps in it.
export function missingFor(e: StaffRecord, salary: number): string[] {
  const gaps: string[] = [];
  if (!e.display_name) gaps.push("a name");
  if (!e.designation) gaps.push("a designation");
  if (!e.joining_date) gaps.push("a joining date");
  if (!(salary > 0)) gaps.push("a salary in the pay book");
  if (!e.address) gaps.push("a home address");
  if (!e.email) gaps.push("an email address to send it to");
  if (!e.phone) gaps.push("a mobile number to check at signing");
  if (e.reporting_minutes == null) gaps.push("a reporting time");
  return gaps;
}
