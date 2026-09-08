#!/usr/bin/env python3
"""
Bring the Coda "Enquiry Database" into the hub.

  1. In Coda: open the Enquiry Database table → ⋯ → Download as CSV.
  2. Run:  SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… python3 scripts/import_coda_enquiries.py "Enquiry Database.csv"

Every row keeps its Coda row id (or, failing that, a hash of name+phone), so
running the script again updates rather than duplicates. Notes from Neeta,
Diya and Sunita become timeline notes under their own names. Coda's
"Sentiment Tracker" slider (0–4) becomes heat.
"""
import csv, hashlib, json, os, re, sys, urllib.request
from datetime import datetime

URL = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
if not URL or not KEY:
    sys.exit("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (from Vercel → Environment Variables).")
if len(sys.argv) < 2:
    sys.exit("Usage: import_coda_enquiries.py <coda-export.csv>")

def rest(method, path, body=None, prefer=None):
    req = urllib.request.Request(f"{URL}/rest/v1/{path}", method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={"apikey": KEY, "Authorization": f"Bearer {KEY}", "Content-Type": "application/json",
                 "Accept-Profile": "eurokids", "Content-Profile": "eurokids", **({"Prefer": prefer} if prefer else {})})
    with urllib.request.urlopen(req) as r:
        t = r.read().decode()
        return json.loads(t) if t else None

def col(row, *names):
    for n in names:
        for k in row:
            if k.strip().lower() == n.lower():
                v = (row[k] or "").strip()
                if v: return v
    return None

def phone(v):
    d = re.sub(r"\D", "", v or "")
    return d[-10:] if len(d) >= 10 else None

def date(v):
    if not v: return None
    for f in ("%Y-%m-%dT%H:%M:%S.%fZ", "%Y-%m-%d", "%d %b %Y", "%d/%m/%Y", "%m/%d/%Y", "%d %B %Y"):
        try: return datetime.strptime(v.strip(), f).date().isoformat()
        except ValueError: pass
    return None

def stamp(v):
    if not v: return None
    for f in ("%Y-%m-%dT%H:%M:%S.%fZ", "%Y-%m-%dT%H:%M:%SZ", "%Y-%m-%d %H:%M", "%d %b %Y %H:%M", "%Y-%m-%d"):
        try: return datetime.strptime(v.strip(), f).isoformat()
        except ValueError: pass
    return None

SOURCE = {"walk in": "walk_in", "walk-in": "walk_in", "walkin": "walk_in", "call": "call", "phone": "call", "ivr": "call",
          "website": "website", "web": "website", "instagram": "instagram", "insta": "instagram", "referral": "referral",
          "reference": "referral", "just dial": "just_dial", "justdial": "just_dial", "whatsapp": "whatsapp"}
def source(v):
    v = (v or "").strip().lower()
    for k, s in SOURCE.items():
        if k in v: return s
    return "other"

def stage(status, admission_stage, visit):
    s = (status or "").lower(); a = (admission_stage or "").lower()
    if "admit" in a or "admission done" in a or "enrolled" in a: return "admitted"
    if "closed" in s or "lost" in s or "not interested" in s or "dropped" in a: return "lost"
    if "visit" in a and ("done" in a or "1st" in a or "premise" in a): return "visited"
    if visit: return "visit_scheduled"
    if "follow" in s or "follow" in a: return "follow_up"
    if "contact" in a or "call" in a: return "contacted"
    return "new"

rows = list(csv.DictReader(open(sys.argv[1], newline="", encoding="utf-8-sig")))
print(f"{len(rows)} rows in the export")
made = updated = 0
for r in rows:
    child = col(r, "Child's Name", "Child Name", "Childs Name")
    fphone = col(r, "Father Phone Number", "Father's Phone", "Phone")
    mphone = col(r, "Mother's Phone Number", "Mother Phone")
    key = phone(fphone) or phone(mphone)
    if not (child or key):
        continue
    coda_id = col(r, "Row ID", "RowId", "rowId") or ("csv-" + hashlib.sha1(f"{child}|{key}|{col(r,'Created on')}".encode()).hexdigest()[:16])
    heat = col(r, "Sentiment Tracker")
    try: heat = max(0, min(4, int(float(heat)))) if heat else 2
    except ValueError: heat = 2
    visit = stamp(col(r, "Vist Schedule", "Visit Schedule"))
    st = stage(col(r, "Inquiry Status"), col(r, "Admission Stage"), visit)
    rec = {
        "coda_row_id": coda_id, "academic_year": col(r, "Academic Year") or "26-27",
        "child_name": child, "dob": date(col(r, "Date of Birth")), "sex": (col(r, "Sex") or None) if col(r, "Sex") in ("Boy", "Girl") else None,
        "program": col(r, "Program"),
        "father_name": col(r, "Father's Name", "Father's Name "), "father_phone": fphone, "father_email": (col(r, "Father's Email") or "").lower() or None,
        "mother_name": col(r, "Mother's Name"), "mother_phone": mphone, "mother_email": (col(r, "Mother's Email") or "").lower() or None,
        "address": col(r, "Address"),
        "source": source(col(r, "Lead Source")), "stage": st, "heat": heat,
        "first_contact_at": stamp(col(r, "Created on")) or datetime.now().isoformat(),
        "visit_scheduled_at": visit,
        "first_visit_at": visit if st in ("visited", "admitted") else None,
        "follow_up_on": date(col(r, "Follow-Up Date")),
        "admitted_at": stamp(col(r, "Worked Last On")) if st == "admitted" else None,
        "next_action": col(r, "Call Status"),
    }
    existing = rest("GET", f"enquiry?coda_row_id=eq.{coda_id}&select=id")
    if existing:
        rest("PATCH", f"enquiry?id=eq.{existing[0]['id']}", rec, prefer="return=minimal"); eid = existing[0]["id"]; updated += 1
    else:
        out = rest("POST", "enquiry", rec, prefer="return=representation"); eid = out[0]["id"]; made += 1
        rest("POST", "enquiry_event", {"enquiry_id": eid, "kind": "created", "summary": f"Imported from Coda ({col(r,'Lead Source') or 'unknown source'})",
                                        "at": rec["first_contact_at"], "actor": "coda import"}, prefer="return=minimal")
        notes = []
        for who, colname in (("Neeta", "Neeta Notes"), ("Diya", "Diya's Notes"), ("Sunita", "Sunita's Notes")):
            v = col(r, colname)
            if v: notes.append({"enquiry_id": eid, "body": v, "author": who, "created_at": rec["first_contact_at"]})
        if notes: rest("POST", "enquiry_note", notes, prefer="return=minimal")
print(f"done: {made} created, {updated} updated")
