"use client";

import { useEffect, useRef, useState } from "react";
import { useKiosk, useIntakeCamera } from "./useKiosk";

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
// Each dial code with the country it belongs to and how long a mobile number
// is there, because "at least seven digits" is not a check.
//
// It let fifteen 8s through, and it let "888ggg88888" through, on the one
// field the whole enquiry is useless without: a wrong number is a family
// nobody can ring back. An Indian mobile is exactly ten digits and starts
// 6, 7, 8 or 9 — that last part is what catches a landline typed in from
// habit, which is the realistic mistake here.
//
// Lengths are national-significant digits, trunk '0' excluded. Where a
// country genuinely varies (the UAE, Germany) the range is the range; only
// No leading-digit rule. Indian mobiles are allocated 6-9 today, but a rule
// that refuses a number outright has to be right about every case forever —
// an older series, a number ported from somewhere, a parent typing the one
// landline they actually answer. Being clever about the first digit buys a
// little data hygiene and risks turning away a real family, which is the
// wrong side of that trade. Length is enough.
type Dial = { code: string; name: string; min: number; max: number; hint: string };
const DIAL: Dial[] = [
  { code: "+91",  name: "India",        min: 10, max: 10, hint: "98200 12345" },
  { code: "+971", name: "UAE",          min: 8,  max: 9,  hint: "50 123 4567" },
  { code: "+966", name: "Saudi Arabia", min: 9,  max: 9,  hint: "51 234 5678" },
  { code: "+974", name: "Qatar",        min: 8,  max: 8,  hint: "3312 3456" },
  { code: "+968", name: "Oman",         min: 8,  max: 8,  hint: "9212 3456" },
  { code: "+65",  name: "Singapore",    min: 8,  max: 8,  hint: "8123 4567" },
  { code: "+1",   name: "USA / Canada", min: 10, max: 10, hint: "201 555 0123" },
  { code: "+44",  name: "UK",           min: 10, max: 10, hint: "7400 123456" },
  { code: "+61",  name: "Australia",    min: 9,  max: 9,  hint: "412 345 678" },
  { code: "+49",  name: "Germany",      min: 10, max: 11, hint: "1512 3456789" },
  { code: "+33",  name: "France",       min: 9,  max: 9,  hint: "6 12 34 56 78" },
  { code: "+81",  name: "Japan",        min: 10, max: 10, hint: "90 1234 5678" },
];
const dialOf = (code: string) => DIAL.find((d) => d.code === code) || DIAL[0];

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
  // No hint. It used to say "Roughly is fine", which is wrong — the date of
  // birth decides the group a child is placed in and goes on the admission
  // record, so it has to be the real one. Inviting an approximation on the
  // one field that cannot be approximate.
  { key: "dob",          label: "When were they born?", kind: "dob", required: true },
  { key: "sex",          label: "Boy or girl?", kind: "choice", required: true, options: [["Boy", "Boy"], ["Girl", "Girl"]] },
  { key: "programs",     label: "Which programmes interest you?", hint: "Choose as many as you like.", kind: "multi", required: true, options: PROGRAMMES },
  { key: "father_name",  label: "Father's name", kind: "text", required: true },
  { key: "father_phone", label: "Father's mobile number", kind: "phone", required: true },
  { key: "father_email", label: "Father's email", hint: "Optional. We send the brochure and the fee note here.", kind: "email" },
  { key: "mother_name",  label: "Mother's name", hint: "Optional.", kind: "text" },
  { key: "mother_phone", label: "Mother's mobile number", hint: "Optional.", kind: "phone" },
  { key: "mother_email", label: "Mother's email", hint: "Optional.", kind: "email" },
  { key: "address",      label: "Where do you live?", kind: "address", required: true },
];

type Answers = Record<string, string | string[]>;

export default function EnquiryForm({ onDone }: { onDone?: () => void }) {
  const { key: kioskKey } = useKiosk();
  const kiosk = !!kioskKey;
  const cam = useIntakeCamera(kiosk);
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
    if (q.kind === "phone" && v) {
      const d = dialOf(get(q.key === "father_phone" ? "father_cc" : "mother_cc"));
      const n = digits(v);
      // "in India" rather than "an India mobile number" — phrasing it as a
      // place avoids needing an adjective for every country in the list.
      if (d.min === d.max) {
        if (n.length !== d.min) return fail(`A mobile number in ${d.name} is ${d.min} digits. You have typed ${n.length}.`);
      } else if (n.length < d.min || n.length > d.max) {
        return fail(`A mobile number in ${d.name} is ${d.min} to ${d.max} digits. You have typed ${n.length}.`);
      }
    }
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
    // Up, and submitted, the instant the button is pressed.
    //
    // The request takes a second or two and the family is standing at the
    // counter — making them watch a spinner for it is the thing that felt
    // broken. So the page moves first and the save happens behind it. If it
    // fails we come back and say so, which is the only case where the delay
    // was ever worth waiting for.
    // The photograph is chosen first, before anything on screen moves.
    //
    // Not taken — chosen. The camera has been sampling into a rolling buffer
    // the whole time the form was being filled in, and this picks the best
    // frame from the seconds before this tap. Taking one here instead would
    // photograph the hand coming off the button and the tablet already being
    // turned back towards the desk, which is a picture of a ceiling.
    //
    // It is read before setDone so the "seconds before the tap" are measured
    // from the tap, not from whenever React got round to re-rendering.
    const photo = kiosk ? cam.best() : null;

    // Up, and submitted, the instant the button is pressed.
    //
    // The request takes a second or two and the family is standing at the
    // counter — making them watch a spinner for it is the thing that felt
    // broken. So the page moves first and the save happens behind it. If it
    // fails we come back and say so, which is the only case where the delay
    // was ever worth waiting for.
    setBusy(true);
    setErr(null);
    setDone(true);
    window.scrollTo({ top: 0, behavior: "smooth" });

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
          source: kiosk ? "Walk In" : "Website",
          kiosk_key: kioskKey || undefined,
          photo: photo || undefined,
          page: typeof window !== "undefined" ? window.location.pathname : "",
          company: get("company"),
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) throw new Error(j.error || "We could not send that just now.");
      onDone?.();
    } catch (e) {
      // It did not save. Put them back on the last question with every answer
      // still in place, so it can be sent again rather than typed again.
      setDone(false);
      setErr(`${(e as Error).message} Please tell the coordinator.`);
      document.getElementById("enquire")?.scrollIntoView({ behavior: "smooth", block: "start" });
    } finally {
      setBusy(false);
    }
  }

  // A clean form for the next family. The tablet is handed over all morning,
  // so it also resets itself if it is simply left sitting there.
  const startAgain = () => {
    // Drop the held frames with the answers. The tablet goes from family to
    // family, and one family's photograph must never be able to end up on
    // the next family's enquiry.
    cam.forget();
    setA({ father_cc: "+91", mother_cc: "+91" });
    setStep(0);
    setDone(false);
    setErr(null);
    started.current = false;
  };
  useEffect(() => {
    if (!done || !kiosk) return;
    const id = window.setTimeout(startAgain, 4 * 60 * 1000);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done, kiosk]);

  // And an abandoned form clears itself too.
  //
  // The reset above only fires after a successful submit. The commoner thing
  // at a counter is a family who starts, gets called in to see the school,
  // and never comes back — leaving somebody else's child's name and date of
  // birth on question four for the next family to walk up to and type over.
  // Five minutes of nobody touching it and the tablet goes back to the first
  // question. Only on the tablet: a parent at home who wanders off to find
  // their child's birth certificate should find their answers where they
  // left them.
  useEffect(() => {
    if (!kiosk || done) return;
    if (step === 0 && !started.current) return;
    let id = 0;
    const arm = () => {
      window.clearTimeout(id);
      id = window.setTimeout(startAgain, 5 * 60 * 1000);
    };
    const events: (keyof WindowEventMap)[] = ["pointerdown", "keydown", "touchstart"];
    events.forEach((e) => window.addEventListener(e, arm, { passive: true }));
    arm();
    return () => {
      window.clearTimeout(id);
      events.forEach((e) => window.removeEventListener(e, arm));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kiosk, done, step]);

  if (done) {
    return (
      <div className="tf">
        <div className="tf-done">
          <div className="tf-tick" aria-hidden>&#10003;</div>
          <h2>Submitted</h2>
          <button className="tf-again" onClick={startAgain}>Start a new form</button>
        </div>
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
            <Tel
              ccKey={q.key === "father_phone" ? "father_cc" : "mother_cc"}
              numKey={q.key}
              get={get}
              set={set}
              inputRef={inputRef as React.Ref<HTMLInputElement>}
            />
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

function Tel({
  ccKey, numKey, get, set, inputRef,
}: {
  ccKey: string;
  numKey: string;
  get: (k: string) => string;
  set: (k: string, v: string | string[]) => void;
  inputRef: React.Ref<HTMLInputElement>;
}) {
  const d = dialOf(get(ccKey));
  const val = get(numKey);
  const n = val.replace(/\D/g, "");

  return (
    <div className="tf-tel">
      <div className="tf-tel-row">
        <span className="tf-tel-cc">
          {/* No flag emoji. They render as empty boxes wherever an emoji font
              is missing, and Windows has no flag glyphs at all — it draws the
              two letters instead. The dial code is the thing being chosen
              anyway, and it looks the same on every device. */}
          <span className="tf-tel-code">{d.code}</span>
          <svg className="tf-tel-caret" viewBox="0 0 10 6" aria-hidden>
            <path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          <select
            aria-label="Country"
            value={d.code}
            onChange={(e) => {
              const next = dialOf(e.target.value);
              set(ccKey, next.code);
              // A number already typed is trimmed to the new country's length
              // rather than silently left too long for it.
              if (n) set(numKey, n.slice(0, next.max));
            }}
          >
            {DIAL.map((o) => (
              <option key={o.code} value={o.code}>{o.name} ({o.code})</option>
            ))}
          </select>
        </span>

        <input
          ref={inputRef}
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          placeholder={d.hint}
          value={val}
          maxLength={d.max}
          onChange={(e) => set(numKey, e.target.value.replace(/\D/g, "").slice(0, d.max))}
        />
      </div>
      <span className="tf-tel-count" aria-hidden>
        {n.length}/{d.max}
      </span>
    </div>
  );
}

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
