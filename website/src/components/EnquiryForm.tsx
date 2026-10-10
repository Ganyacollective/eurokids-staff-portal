"use client";

import { useEffect, useRef, useState } from "react";

// A Typeform, properly.
//
// What makes one is not the styling, it is that the question owns the whole
// screen. One thing is asked, it is large, Enter answers it, and the next
// one slides up. Nothing else is visible to deliberate over. The previous
// version put the same questions in a small panel beside a photograph, which
// is a web form with a progress bar on it.
//
// Everything lands in the school's own enquiries table through an API that
// already exists, so a parent who finishes this is in Enquiries before they
// have closed the tab.

const API = process.env.NEXT_PUBLIC_ENQUIRY_API
  || "https://admin.eurokidsjmdenclave.org/api/public/enquiry";

// What the parent reads, and what the roster calls it. The two have never
// matched: the database says "P.G." and no parent has ever said that aloud.
const PROGRAMMES: [label: string, db: string][] = [
  ["Playgroup", "P.G."],
  ["Nursery", "Nursery"],
  ["Junior KG", "Euro Junior"],
  ["Senior KG", "Euro Senior"],
  ["Day care", "Daycare"],
  ["Summer / Evening club", "Summer Club"],
];

// India first and selected, because almost everybody here is in India — but
// changeable, because some parents are posted abroad and enquiring ahead of
// a move, and a locked +91 makes their number unenterable.
const DIAL = ["+91", "+1", "+44", "+61", "+65", "+971", "+966", "+974", "+968", "+49", "+33", "+81"];

const MONTHS = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];

type Kind = "text" | "email" | "phone" | "dob" | "choice" | "multi" | "address";
type Q = {
  key: string;
  label: string;
  hint?: string;
  kind: Kind;
  required?: boolean;
  placeholder?: string;
  options?: [string, string][];
};

const QUESTIONS: Q[] = [
  { key: "child_name",   label: "What is your child's name?", kind: "text", required: true, placeholder: "First and last name" },
  { key: "dob",          label: "When were they born?", hint: "Roughly is fine — it tells us which group they would join.", kind: "dob", required: true },
  { key: "sex",          label: "Boy or girl?", kind: "choice", required: true, options: [["Boy", "Boy"], ["Girl", "Girl"]] },
  { key: "programs",     label: "Which programmes interest you?", hint: "Choose as many as you like.", kind: "multi", required: true, options: PROGRAMMES },
  { key: "father_name",  label: "Father's name", kind: "text", required: true },
  { key: "father_phone", label: "Father's mobile number", hint: "So we can call you back about a visit.", kind: "phone", required: true },
  { key: "father_email", label: "Father's email", hint: "Optional. We send the brochure and the fee note here.", kind: "email" },
  { key: "mother_name",  label: "Mother's name", hint: "Optional.", kind: "text" },
  { key: "mother_phone", label: "Mother's mobile number", hint: "Optional.", kind: "phone" },
  { key: "mother_email", label: "Mother's email", hint: "Optional.", kind: "email" },
  { key: "address",      label: "Where do you live?", hint: "Just the area and society is enough — it tells us how far you would be travelling.", kind: "address", required: true },
];

type Answers = Record<string, string | string[]>;

export default function EnquiryForm({ onDone }: { onDone?: () => void }) {
  const [step, setStep] = useState(0);
  const [a, setA] = useState<Answers>({ father_cc: "+91", mother_cc: "+91" });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [dir, setDir] = useState<1 | -1>(1);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const started = useRef(false);

  const q = QUESTIONS[step];
  const last = step === QUESTIONS.length - 1;
  const get = (k: string) => (a[k] ?? "") as string;
  const picked = (a.programs ?? []) as string[];

  // Put the caret on the new question — but never on first paint, or the
  // phone scrolls itself down to the form before the visitor has seen the
  // cards above it.
  useEffect(() => {
    if (!started.current) return;
    if (q.kind === "text" || q.kind === "email" || q.kind === "phone" || q.kind === "address") {
      inputRef.current?.focus();
    } else {
      panelRef.current?.focus();
    }
  }, [step, q.kind]);

  const fail = (m: string) => { setErr(m); return false; };
  const digits = (s: string) => s.replace(/\D/g, "");

  function valid(): boolean {
    setErr(null);
    if (q.kind === "multi") {
      if (q.required && picked.length === 0) return fail("Pick at least one — you can choose several.");
      return true;
    }
    if (q.kind === "dob") {
      const { d, m, y } = { d: get("dob_d"), m: get("dob_m"), y: get("dob_y") };
      if (!d || !m || !y) return q.required ? fail("Pick the day, month and year.") : true;
      const dt = new Date(Number(y), Number(m) - 1, Number(d));
      if (dt.getDate() !== Number(d)) return fail("That day does not exist in that month.");
      if (dt > new Date()) return fail("That is in the future.");
      return true;
    }
    const v = get(q.key).trim();
    if (q.required && !v) return fail("We do need this one.");
    if (q.kind === "phone" && v && digits(v).length < 7) return fail("That number looks too short.");
    if (q.kind === "email" && v && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) return fail("That email looks incomplete.");
    return true;
  }

  const go = (n: number) => { setDir(n > step ? 1 : -1); setStep(n); };
  const next = () => {
    started.current = true;
    if (!valid()) return;
    if (last) { void submit(); return; }
    go(step + 1);
  };

  const set = (k: string, v: string | string[]) => {
    started.current = true;
    setA((prev) => ({ ...prev, [k]: v }));
    setErr(null);
  };

  const toggle = (db: string) => {
    const now = picked.includes(db) ? picked.filter((p) => p !== db) : [...picked, db];
    set("programs", now);
  };

  async function submit() {
    setBusy(true);
    setErr(null);
    const dob = get("dob_y") && get("dob_m") && get("dob_d")
      ? `${get("dob_y")}-${String(get("dob_m")).padStart(2, "0")}-${String(get("dob_d")).padStart(2, "0")}`
      : "";
    const withCode = (cc: string, n: string) => (n.trim() ? `${cc} ${n.trim()}` : "");
    try {
      const r = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          child_name: get("child_name"),
          dob,
          sex: get("sex"),
          programs: picked,
          parent_name: get("father_name"),
          phone: withCode(get("father_cc"), get("father_phone")),
          email: get("father_email"),
          mother_name: get("mother_name"),
          mother_phone: withCode(get("mother_cc"), get("mother_phone")),
          mother_email: get("mother_email"),
          address: get("address"),
          source: "Website",
          page: typeof window !== "undefined" ? window.location.pathname : "",
          company: get("company"),       // the honeypot; a human never sees it
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) throw new Error(j.error || "We could not send that just now.");
      setDone(true);
      onDone?.();
    } catch (e) {
      // Never swallowed. A parent who believes they have enquired and has not
      // is worse off than one who knows to ring us.
      setErr(`${(e as Error).message} Please call us on 020 6962 2686 and we will take the details down.`);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="tf-done">
        <div className="tf-tick" aria-hidden>✓</div>
        <h2>Thank you — that is everything we need.</h2>
        <p>
          Someone from the centre will call you shortly to arrange a visit. If it is urgent,
          ring us on <a href="tel:+912069622686">020 6962 2686</a>.
        </p>
        <a className="tf-cta" href="#cards">
          Now watch our beautiful videos
          <span className="arr" aria-hidden>→</span>
        </a>
      </div>
    );
  }

  const pct = Math.round((step / QUESTIONS.length) * 100);

  return (
    <div className="tf">
      <div className="tf-bar" aria-hidden><i style={{ width: `${pct}%` }} /></div>

      <div
        className="tf-stage"
        onKeyDown={(e) => {
          // Enter answers. Shift+Enter is a newline in the address box, which
          // is the one question where somebody will want two lines.
          if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); next(); }
        }}
      >
        <div
          key={step}
          ref={panelRef}
          tabIndex={-1}
          className={`tf-panel ${dir === 1 ? "in-up" : "in-down"}`}
          role="group"
          aria-label={`Question ${step + 1} of ${QUESTIONS.length}`}
        >
          <p className="tf-num">
            {step + 1} <span aria-hidden>→</span>
          </p>

          <h2 className="tf-q">
            {q.label}
            {q.required && <span className="tf-req" aria-hidden>*</span>}
          </h2>
          {q.hint && <p className="tf-hint">{q.hint}</p>}

          {/* ── one question, in whichever shape it needs ───────────── */}
          {(q.kind === "text" || q.kind === "email") && (
            <input
              ref={inputRef as React.Ref<HTMLInputElement>}
              className="tf-field"
              type={q.kind === "email" ? "email" : "text"}
              autoComplete={
                q.key === "father_name" || q.key === "mother_name" ? "name"
                : q.key.endsWith("email") ? "email" : "off"
              }
              placeholder={q.placeholder || "Type your answer…"}
              value={get(q.key)}
              onChange={(e) => set(q.key, e.target.value)}
            />
          )}

          {q.kind === "address" && (
            <textarea
              ref={inputRef as React.Ref<HTMLTextAreaElement>}
              className="tf-field tf-area"
              rows={3}
              placeholder="Flat, society, area"
              value={get(q.key)}
              onChange={(e) => set(q.key, e.target.value)}
            />
          )}

          {q.kind === "phone" && (
            <div className="tf-phone">
              <select
                className="tf-cc"
                aria-label="Country code"
                value={get(q.key === "father_phone" ? "father_cc" : "mother_cc")}
                onChange={(e) => set(q.key === "father_phone" ? "father_cc" : "mother_cc", e.target.value)}
              >
                {DIAL.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
              <input
                ref={inputRef as React.Ref<HTMLInputElement>}
                className="tf-field"
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                placeholder="98200 12345"
                value={get(q.key)}
                onChange={(e) => set(q.key, e.target.value)}
              />
            </div>
          )}

          {q.kind === "dob" && <Dob get={get} set={set} />}

          {q.kind === "choice" && (
            <div className="tf-opts">
              {q.options!.map(([label, v], i) => (
                <button
                  key={v}
                  type="button"
                  className="tf-opt"
                  aria-pressed={get(q.key) === v}
                  onClick={() => {
                    set(q.key, v);
                    // One answer means one answer: move on rather than making
                    // them confirm a thing they have just told us.
                    setTimeout(() => { setDir(1); setStep((s) => Math.min(s + 1, QUESTIONS.length - 1)); }, 170);
                  }}
                >
                  <kbd aria-hidden>{String.fromCharCode(65 + i)}</kbd>
                  <span>{label}</span>
                </button>
              ))}
            </div>
          )}

          {q.kind === "multi" && (
            <>
              <div className="tf-opts">
                {q.options!.map(([label, v], i) => (
                  <button
                    key={v}
                    type="button"
                    className="tf-opt"
                    aria-pressed={picked.includes(v)}
                    onClick={() => toggle(v)}
                  >
                    <kbd aria-hidden>{String.fromCharCode(65 + i)}</kbd>
                    <span>{label}</span>
                    {picked.includes(v) && <span className="tf-check" aria-hidden>✓</span>}
                  </button>
                ))}
              </div>
              {/* Several answers cannot auto-advance: the tap that chooses the
                  second programme would be the tap that left the question. */}
              <p className="tf-multi-note">
                {picked.length === 0 ? "Choose as many as apply." :
                 `${picked.length} chosen — press OK when you are done.`}
              </p>
            </>
          )}

          <input
            tabIndex={-1} autoComplete="off" aria-hidden
            style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }}
            value={get("company")}
            onChange={(e) => set("company", e.target.value)}
          />

          {err && <p className="tf-err" role="alert">{err}</p>}

          <div className="tf-actions">
            <button className="tf-ok" onClick={next} disabled={busy}>
              {busy ? "Sending…" : last ? "Submit" : "OK"}
              {!busy && <span className="arr" aria-hidden>✓</span>}
            </button>
            <span className="tf-enter">
              press <strong>Enter</strong> ↵
            </span>
          </div>
        </div>

        <div className="tf-steps">
          <button
            aria-label="Previous question"
            disabled={step === 0}
            onClick={() => go(Math.max(0, step - 1))}
          >↑</button>
          <button
            aria-label="Next question"
            disabled={last}
            onClick={next}
          >↓</button>
        </div>
      </div>
    </div>
  );
}

// Day, month and year as three plain selects.
//
// A date picker is the wrong control here: a calendar opens on this month and
// the answer is two or three years back, which is a lot of tapping backwards.
// Three lists put the year one scroll away, and the year list only offers
// years a preschooler could actually have been born in.
function Dob({ get, set }: { get: (k: string) => string; set: (k: string, v: string) => void }) {
  const thisYear = new Date().getFullYear();
  const years = Array.from({ length: 9 }, (_, i) => thisYear - i);
  const m = Number(get("dob_m") || 0);
  const y = Number(get("dob_y") || thisYear);
  const daysIn = m ? new Date(y, m, 0).getDate() : 31;

  return (
    <div className="tf-dob">
      <select className="tf-sel" aria-label="Day" value={get("dob_d")} onChange={(e) => set("dob_d", e.target.value)}>
        <option value="">Day</option>
        {Array.from({ length: daysIn }, (_, i) => i + 1).map((d) => (
          <option key={d} value={d}>{d}</option>
        ))}
      </select>
      <select className="tf-sel" aria-label="Month" value={get("dob_m")} onChange={(e) => set("dob_m", e.target.value)}>
        <option value="">Month</option>
        {MONTHS.map((name, i) => <option key={name} value={i + 1}>{name}</option>)}
      </select>
      <select className="tf-sel" aria-label="Year" value={get("dob_y")} onChange={(e) => set("dob_y", e.target.value)}>
        <option value="">Year</option>
        {years.map((yr) => <option key={yr} value={yr}>{yr}</option>)}
      </select>
    </div>
  );
}
