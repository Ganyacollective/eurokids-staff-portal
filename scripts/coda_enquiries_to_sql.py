#!/usr/bin/env python3
"""Turn a Coda "Enquiry Database" CSV export into SQL for eurokids.enquiry.
Usage: coda_enquiries_to_sql.py export.csv outdir   → outdir/enq_0..3.sql + enq_notes.sql
(The REST-based importer is scripts/import_coda_enquiries.py; this one is for
running the load through the Supabase SQL console in a few pastes.)"""
import csv, re, hashlib, math, sys
from datetime import datetime

rows = list(csv.DictReader(open(sys.argv[1], newline="", encoding="utf-8-sig")))
outdir = sys.argv[2] if len(sys.argv) > 2 else "."

def g(r, *ns):
    for n in ns:
        for k in r:
            if k.strip().lower() == n.lower():
                v = (r[k] or "").strip()
                if v: return v
    return None

def stamp(v, default_year=None):
    if not v: return None
    v = re.sub(r"\bSept\b", "Sep", re.sub(r"^[A-Za-z]{3},?\s+", "", v.strip()))
    for f in ("%d %b %Y, %I:%M %p", "%d %B %Y, %I:%M %p", "%d %b %Y", "%d %B %Y", "%Y-%m-%d"):
        try: return datetime.strptime(v, f)
        except ValueError: pass
    if default_year:
        for f in ("%d %b", "%d %B", "%d %b, %I:%M %p", "%d %B, %I:%M %p"):
            try: return datetime.strptime(v, f).replace(year=default_year)
            except ValueError: pass
    return None

multi = lambda v: [x.strip() for x in (v or "").split(",") if x.strip()]
q = lambda v: "NULL" if v is None else "'" + str(v).replace("'", "''") + "'"
ts = lambda d: q(d.isoformat() + "+05:30") if d else "NULL"
arr = lambda l: "ARRAY[" + ",".join(q(x) for x in l) + "]::text[]" if l else "'{}'::text[]"

out, notes, unparsed = [], [], set()
for r in rows:
    created = stamp(g(r, "Created on")) or datetime.now()
    st = multi(g(r, "Inquiry Status")); status = "in_progress"
    if "Won" in st and "In progress" in st: status = "form_taken"
    elif "Won" in st: status = "won"
    elif "Almost Lost" in st: status = "almost_lost"
    elif "Lost" in st or "Closed" in st: status = "lost"
    stages = multi(g(r, "Admission Stage")); srcs = multi(g(r, "Lead Source"))
    for col in ("Follow-Up Date", "Call Date", "Vist Schedule"):
        v = g(r, col)
        if v and not stamp(v, created.year): unparsed.add((col, v))
    fu = stamp(g(r, "Follow-Up Date"), created.year); cd = stamp(g(r, "Call Date"), created.year); vs = stamp(g(r, "Vist Schedule"), created.year)
    dob = stamp(g(r, "Date of Birth")); worked = stamp(g(r, "Worked Last On"))
    sent = g(r, "Sentiment Tracker"); sent = int(float(sent)) if sent else None
    child = g(r, "Child's Name"); fphone = g(r, "Father Phone Number"); mphone = g(r, "Mother's Phone Number")
    cid = "coda-" + hashlib.sha1(f"{child}|{fphone}|{created.isoformat()}".encode()).hexdigest()[:16]
    first_visit = created if "1st Premise Visit" in stages else None
    sex = g(r, "Sex"); sex = sex if sex in ("Boy", "Girl") else None
    femail = (g(r, "Father's Email") or "").lower() or None
    memail = (g(r, "Mother's Email") or "").lower() or None
    vals = [q(cid), ts(created), ts(worked or created), q(g(r, "Edited Last By")), q(g(r, "Academic Year") or "26-27"),
            q(child), q(dob.date().isoformat() if dob else None), q(sex), arr(multi(g(r, "Program"))),
            q(g(r, "Father's Name", "Father's Name ")), q(fphone), q(femail), q(g(r, "Mother's Name")), q(mphone), q(memail), q(g(r, "Address")),
            arr(srcs), arr(stages), q(status), q(sent), ts(vs), q(g(r, "Call Status")),
            q(cd.date().isoformat() if cd else None), q(fu.date().isoformat() if fu else None), ts(created), ts(first_visit)]
    out.append("(" + ",".join(vals) + ")")
    for who, coln in (("Neeta", "Neeta Notes"), ("Diya", "Diya's Notes"), ("Sunita", "Sunita's Notes")):
        v = g(r, coln)
        if v: notes.append((cid, v, who, (worked or created).isoformat() + "+05:30"))

head = ("insert into eurokids.enquiry (coda_row_id,created_at,updated_at,updated_by,academic_year,child_name,dob,sex,programs,"
        "father_name,father_phone,father_email,mother_name,mother_phone,mother_email,address,sources,stages,status,sentiment,"
        "visit_at,call_status,call_date,follow_up_on,first_contact_at,first_visit_at) values\n")
n = 4; size = math.ceil(len(out) / n)
for i in range(n):
    open(f"{outdir}/enq_{i}.sql", "w").write(head + ",\n".join(out[i * size:(i + 1) * size]) + "\non conflict (coda_row_id) do nothing;")
notes_sql = ("insert into eurokids.enquiry_note (enquiry_id, body, author, created_at) select e.id, v.body, v.author, v.at::timestamptz from (values "
             + ",".join(f"({q(c)},{q(b)},{q(w)},{q(t)})" for c, b, w, t in notes)
             + ") as v(cid,body,author,at) join eurokids.enquiry e on e.coda_row_id=v.cid where not exists (select 1 from eurokids.enquiry_note n where n.enquiry_id=e.id and n.body=v.body);\n"
             "insert into eurokids.enquiry_event (enquiry_id, at, kind, summary, actor) select id, first_contact_at, 'created', 'Imported from Coda ('||array_to_string(sources,', ')||')', 'coda import' "
             "from eurokids.enquiry e where coda_row_id like 'coda-%' and not exists (select 1 from eurokids.enquiry_event x where x.enquiry_id=e.id and x.kind='created');\n")
open(f"{outdir}/enq_notes.sql", "w").write(notes_sql)
print(len(out), "rows", len(notes), "notes; unparsed dates:", sorted(unparsed)[:12])
