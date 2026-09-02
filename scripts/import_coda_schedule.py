#!/usr/bin/env python3
"""
Import the Coda "26-27" payment-schedule export into Supabase.

Reads the CSV, matches each row to an EPMS child by name, and upserts
eurokids.payment_plan + eurokids.payment_plan_item. Parent emails are
backfilled into eurokids.child_contact only where we have nothing already —
a human-entered address is never overwritten.

Run with --apply to write; the default is a dry run that only reports.
"""
import csv, os, re, sys, json, difflib, datetime, urllib.request, urllib.parse

CSV_PATH = sys.argv[1] if len(sys.argv) > 1 and not sys.argv[1].startswith("-") else "26-27.csv"
APPLY = "--apply" in sys.argv

ENV = "/sessions/gifted-affectionate-thompson/mnt/Eurokids/payroll-app/.env.local"
env = {}
for line in open(ENV):
    line = line.strip()
    if line and not line.startswith("#") and "=" in line:
        k, v = line.split("=", 1)
        env[k.strip()] = v.strip().strip('"').strip("'")
URL = env["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/")
KEY = env["SUPABASE_SERVICE_ROLE_KEY"]

DEFAULT_DUE = "2026-09-05"   # the term-3 date the school uses when nothing else is known

# Coda spellings that no automatic rule can reach, confirmed against EPMS by hand.
ALIASES = {
    "duha kounsar sheikh": "Duha Sheikh",
    "zayn": "Zaynulabedin Tatiwala",
}


def api(method, path, body=None, profile=None, prefer=None):
    req = urllib.request.Request(f"{URL}/rest/v1/{path}", method=method)
    req.add_header("apikey", KEY)
    req.add_header("Authorization", f"Bearer {KEY}")
    req.add_header("Content-Type", "application/json")
    if profile:
        req.add_header("Accept-Profile" if method == "GET" else "Content-Profile", profile)
    if prefer:
        req.add_header("Prefer", prefer)
    data = json.dumps(body).encode() if body is not None else None
    try:
        with urllib.request.urlopen(req, data) as r:
            raw = r.read().decode()
            return json.loads(raw) if raw.strip() else []
    except urllib.error.HTTPError as e:
        print(f"  ! {method} {path} -> {e.code}: {e.read().decode()[:400]}")
        raise


# ── helpers ─────────────────────────────────────────────────────────────────
def norm(name):
    """Lower-case, drop punctuation, collapse whitespace, sort nothing."""
    s = re.sub(r"[^a-z ]", " ", (name or "").lower())
    return " ".join(s.split())


def key_set(name):
    return frozenset(norm(name).split())


def money(s):
    s = (s or "").strip()
    if not s:
        return None
    s = re.sub(r"[^\d.]", "", s)
    if not s:
        return None
    try:
        v = float(s)
    except ValueError:
        return None
    return v if v > 0 else None


MONTHS = {"jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
          "jul": 7, "aug": 8, "sep": 9, "sept": 9, "oct": 10, "nov": 11, "dec": 12}


def date(s):
    s = (s or "").strip()
    if not s:
        return None
    m = re.match(r"(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})", s)
    if not m:
        return None
    d, mon, y = m.groups()
    mo = MONTHS.get(mon[:4].lower()) or MONTHS.get(mon[:3].lower())
    if not mo:
        return None
    try:
        return datetime.date(int(y), mo, int(d)).isoformat()
    except ValueError:
        return None


# ── load EPMS children ──────────────────────────────────────────────────────
print("Fetching EPMS children…")
epms = api("GET", "fee_invoices?select=uin,student_name,program_name,admission_date,"
                  "total_invoiced_paise,total_collected_paise&limit=2000", profile="epms")
print(f"  {len(epms)} children in EPMS")

by_norm, by_keys = {}, {}
for c in epms:
    by_norm.setdefault(norm(c["student_name"]), []).append(c)
    by_keys.setdefault(key_set(c["student_name"]), []).append(c)
all_norms = list(by_norm)

existing_contacts = {r["uin"]: r for r in api(
    "GET", "child_contact?select=uin,parent_email1,parent_email2&limit=2000", profile="eurokids")}

# ── read the CSV ────────────────────────────────────────────────────────────
rows = list(csv.DictReader(open(CSV_PATH, encoding="utf-8-sig")))
print(f"\n{len(rows)} rows in {os.path.basename(CSV_PATH)}\n")

plans, items, contacts = [], [], []
unmatched, fuzzy, mismatch, no_items = [], [], [], []
seen = set()

for r in rows:
    name = (r["Childs Name"] or "").strip()
    if not name:
        continue

    # match: exact normalised, then same word-set, then a unique name that
    # contains every word given (handles "Moiz" → "Moiz Abbas Rangwala"),
    # then a close fuzzy match for spelling drift
    cands, how = by_norm.get(norm(name)), "exact"
    if not cands and norm(name) in ALIASES:
        cands, how = by_norm.get(norm(ALIASES[norm(name)])), f"alias→{ALIASES[norm(name)]}"
    if not cands:
        cands, how = by_keys.get(key_set(name)), "reordered"
    if not cands:
        want = key_set(name)
        subset = [c for c in epms if want and want <= key_set(c["student_name"])]
        if len(subset) == 1:
            cands, how = subset, f"partial name→{subset[0]['student_name']}"
        elif len(subset) > 1:
            prog = (r["Program"] or "").strip().lower().replace(".", "")
            narrowed = [c for c in subset
                        if prog[:2] and prog[:2] in (c["program_name"] or "").lower().replace(".", "")]
            if len(narrowed) == 1:
                cands, how = narrowed, f"partial name+class→{narrowed[0]['student_name']}"
    if not cands:
        close = difflib.get_close_matches(norm(name), all_norms, n=1, cutoff=0.88)
        if close:
            cands, how = by_norm[close[0]], f"fuzzy→{close[0]}"
    if not cands:
        unmatched.append(f"{name} ({r['Program'] or '?'})")
        continue
    if len(cands) > 1:
        prog = (r["Program"] or "").strip().lower().replace(".", "")
        narrowed = [c for c in cands
                    if prog[:2] and prog[:2] in (c["program_name"] or "").lower().replace(".", "")]
        cands = narrowed or cands
    child = cands[0]
    uin = child["uin"]
    if uin in seen:
        continue
    seen.add(uin)
    if how != "exact":
        fuzzy.append(f"{name}  →  {child['student_name']}  ({how})")

    total = money(r["Total Fee"])
    final = money(r["Final Fee"]) or money(r["Discounted Fees"]) or total
    if final is None:
        final = total
    disc = round(total - final, 2) if (total and final and total > final) else 0

    # instalments: pre-term first, then the three terms
    sched = []
    pre = money(r["Pre Term"])
    if pre:
        sched.append((pre, child.get("admission_date") or date(r["Due 1"]) or DEFAULT_DUE))
    for amt_col, due_col in (("Payment 1", "Due 1"), ("Payment 2", "Due 2"), ("Payment 3", "Due 3")):
        a = money(r[amt_col])
        if a:
            sched.append((a, date(r[due_col]) or DEFAULT_DUE))

    if not sched:
        no_items.append(f"{name} ({r['Program']})")
    else:
        # A schedule summing to LESS than the final fee is normal: the blank
        # cells are terms already settled. Summing to MORE is a data error in
        # the source sheet and needs a human.
        s = round(sum(a for a, _ in sched), 2)
        if final and s - final > 1:
            mismatch.append(f"{name}: instalments {s:,.0f} exceed final fee {final:,.0f}"
                            f"  (over by {s - final:,.0f})")

    plans.append({
        "uin": uin,
        "total_fee": total or final or 0,
        "our_discount": disc,
        "final_fee": final or 0,
        "note": (r["Notes"] or "").strip()[:500] or None,
    })
    for i, (amt, due) in enumerate(sched, start=1):
        items.append({"uin": uin, "seq": i, "amount": amt, "due_date": due})

    # backfill parent emails only where we hold none
    f_mail = (r["Fathers Email"] or "").strip().lower()
    m_mail = (r["Mother Email"] or "").strip().lower()
    have = existing_contacts.get(uin) or {}
    if (f_mail or m_mail) and not (have.get("parent_email1") or "").strip():
        contacts.append({"uin": uin,
                         "parent_email1": f_mail or m_mail or None,
                         "parent_email2": (m_mail if f_mail else None) or None,
                         "source": "coda_26_27"})

# ── report ──────────────────────────────────────────────────────────────────
print(f"matched          : {len(plans)}")
print(f"instalment rows  : {len(items)}")
print(f"email backfills  : {len(contacts)}")
print(f"unmatched        : {len(unmatched)}")
if unmatched:
    for n in unmatched:
        print(f"    · {n}")
if fuzzy:
    print(f"\nnon-exact matches ({len(fuzzy)}) — check these:")
    for f in fuzzy:
        print(f"    · {f}")
if no_items:
    print(f"\nno instalment amounts ({len(no_items)}) — coordinator must fill:")
    for n in no_items[:40]:
        print(f"    · {n}")
    if len(no_items) > 40:
        print(f"    … and {len(no_items) - 40} more")
if mismatch:
    print(f"\nOVER-SCHEDULED — source sheet looks wrong ({len(mismatch)}):")
    for m in mismatch:
        print(f"    · {m}")

if not APPLY:
    print("\nDRY RUN — nothing written. Re-run with --apply to commit.")
    sys.exit(0)

# ── write ───────────────────────────────────────────────────────────────────
print("\nWriting…")
for i in range(0, len(plans), 100):
    api("POST", "payment_plan", plans[i:i + 100], profile="eurokids",
        prefer="resolution=merge-duplicates,return=minimal")
print(f"  payment_plan: {len(plans)}")

uins = sorted(seen)
for i in range(0, len(uins), 50):
    chunk = ",".join(f'"{u}"' for u in uins[i:i + 50])
    api("DELETE", f"payment_plan_item?uin=in.({urllib.parse.quote(chunk)})",
        profile="eurokids", prefer="return=minimal")
for i in range(0, len(items), 200):
    api("POST", "payment_plan_item", items[i:i + 200], profile="eurokids",
        prefer="return=minimal")
print(f"  payment_plan_item: {len(items)}")

if contacts:
    for i in range(0, len(contacts), 100):
        api("POST", "child_contact", contacts[i:i + 100], profile="eurokids",
            prefer="resolution=merge-duplicates,return=minimal")
    print(f"  child_contact backfilled: {len(contacts)}")

print("\nDone.")
