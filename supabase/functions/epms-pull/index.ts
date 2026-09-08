// epms-pull — one button, everything refreshed.
//
// Pulls from EPMS:
//   • Payment Due report  → epms.children, epms.fee_invoices, epms.programs
//   • diff vs previous    → epms.payment_events  (who paid, how much, when noticed)
//   • Transfer Student    → epms.transfers
//
// EPMS mechanics (mapped 31 Aug 2026):
//   POST /                           UserName + Password   (no CSRF, no captcha)
//   POST /AcademicYear/AcademicYear  ID = academic year id
//   GET  /ReportsPages/<report>.aspx?FID..&FYID..&LoadReport=1
//        → HTML with ReportViewer "ExportUrlBase"; append Format=CSV.
//
// v3 (Sep 2026):
//   • payment_events are written BEFORE fee_invoices is updated, and the run
//     aborts if that write fails. Previously the totals were saved first and
//     the events afterwards unchecked — a failure between the two lost the
//     payment for good, because the next run saw no delta.
//   • duplicate events are ignored via the (uin, term, new_collected_paise)
//     unique index, so two overlapping runs cannot double-count.
//   • a run refuses to start while another is in progress.
//   • the caller must hold the epms_admin or finance module.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const EPMS = 'https://epms.eurokidsindia.com';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type,authorization,apikey',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

function jarAdd(jar: Map<string, string>, res: Response) {
  const raw = (res.headers as any).getSetCookie?.() ?? [];
  for (const c of raw) {
    const [pair] = c.split(';');
    const i = pair.indexOf('=');
    if (i > 0) jar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
  }
}
const jarHeader = (j: Map<string, string>) => [...j.entries()].map(([k, v]) => `${k}=${v}`).join('; ');

function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; } else field += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (ch !== '\r') field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim() !== ''));
}

const paise = (s: string) => {
  const n = Number(String(s ?? '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};
async function sha1(s: string) {
  const b = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
}

async function reportCsv(jar: Map<string, string>, aspx: string, qs: string): Promise<string[][]> {
  const res = await fetch(`${EPMS}/ReportsPages/${aspx}?${qs}`, { headers: { Cookie: jarHeader(jar) } });
  jarAdd(jar, res);
  const html = await res.text();
  if (/name="UserName"/i.test(html)) throw new Error('EPMS bounced to login — credentials rejected.');
  const m = html.match(/"ExportUrlBase"\s*:\s*"([^"]+)"/);
  if (!m) return [];
  const base = m[1].replace(/\\u0026/g, '&').replace(/&amp;/g, '&');
  const url = (base.startsWith('http') ? '' : EPMS) + base + 'CSV';
  const csv = await (await fetch(url, { headers: { Cookie: jarHeader(jar) } })).text();
  return parseCsv(csv);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const url = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

  // ── who is asking? verify_jwt guarantees a valid user; we still need the
  //    RIGHT user. A teacher must not be able to trigger a sync or read the
  //    payment totals it returns.
  const auth = req.headers.get('authorization') || '';
  const asUser = createClient(url, anonKey, { global: { headers: { Authorization: auth } } });
  const { data: who } = await asUser.auth.getUser();
  if (!who?.user) return json({ ok: false, error: 'Not signed in.' }, 401);
  const sbPublic = createClient(url, serviceKey);
  const { data: mods } = await sbPublic.from('module_access').select('module')
    .eq('user_id', who.user.id).in('module', ['epms_admin', 'finance']);
  const ownerEmails = ['abhinav@ganya.in'];
  const allowed = (mods && mods.length) || ownerEmails.includes((who.user.email || '').toLowerCase());

  const sb = createClient(url, serviceKey, { db: { schema: 'epms' } });

  // Every attempt leaves a trace, including the ones that never got started.
  // Otherwise a refusal is invisible: the office presses Sync, nothing appears
  // to happen, and "Last synced" still reads whenever the cron last ran.
  const refuse = async (msg: string, status: number) => {
    const at = new Date().toISOString();
    await sb.from('sync_runs').insert({ report: 'payment_due', route: 'epms-pull',
      triggered_by: who.user.email,
      finished_at: at, status: 'error', error: msg });
    return json({ ok: false, error: msg }, status);
  };

  if (!allowed) return await refuse('You do not have permission to sync from EPMS.', 403);

  const user = Deno.env.get('EPMS_USER'), pass = Deno.env.get('EPMS_PASS');
  if (!user || !pass) return await refuse('EPMS_USER / EPMS_PASS are not set in Edge Function secrets.', 400);

  const fid = Deno.env.get('EPMS_FID') ?? '2077';
  const fyid = Deno.env.get('EPMS_FYID') ?? '25';
  const ayId = Deno.env.get('EPMS_AY_ID') ?? '100';

  // ── one at a time. Two overlapping runs computed the same delta twice.
  const { data: inflight } = await sb.from('sync_runs').select('id, started_at')
    .eq('route', 'epms-pull').is('finished_at', null)
    .gte('started_at', new Date(Date.now() - 3 * 60 * 1000).toISOString()).limit(1);
  if (inflight && inflight.length) {
    return json({ ok: false, error: 'A sync is already running. Give it a minute and try again.' }, 409);
  }

  // triggered_by used to be a uuid with a foreign key to auth.users while this
  // line wrote an email address into it, so every insert failed on the type and
  // no run was ever recorded. The sync itself worked, which is why "Last synced"
  // stayed frozen at the last scheduled run and a colleague's manual sync looked
  // as though it had done nothing. The column is now text (migration
  // sync_runs_triggered_by_is_text), and a failed insert stops the run instead
  // of letting it succeed invisibly.
  const run = await sb.from('sync_runs').insert({ report: 'payment_due', route: 'epms-pull',
      triggered_by: who.user.email })
    .select('id').single();
  const runId = run.data?.id;
  if (!runId) return json({ ok: false, error: 'Could not open a sync log entry: ' + (run.error?.message || 'unknown') }, 500);
  const fail = async (msg: string, status = 500) => {
    await sb.from('sync_runs').update({ finished_at: new Date().toISOString(), status: 'error', error: msg }).eq('id', runId);
    return json({ ok: false, error: msg }, status);
  };

  try {
    const jar = new Map<string, string>();
    const login = await fetch(`${EPMS}/`, {
      method: 'POST', redirect: 'manual',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ UserName: user, Password: pass }).toString(),
    });
    jarAdd(jar, login);
    if (!jar.size) return await fail('EPMS login returned no session cookie — check EPMS_USER / EPMS_PASS.');

    const ay = await fetch(`${EPMS}/AcademicYear/AcademicYear`, {
      method: 'POST', redirect: 'manual',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: jarHeader(jar) },
      body: new URLSearchParams({ ID: ayId }).toString(),
    });
    jarAdd(jar, ay);

    const rows = await reportCsv(jar, 'rptInvoiceReceiptView.aspx',
      `FID=${fid}&FYID=${fyid}&ProgramID=0&AdmissionID=null&ProgramName=All&IsDetail=1&LoadReport=1`);
    if (rows.length < 3) return await fail('Payment Due report came back empty.');

    const hIdx = rows.findIndex(r => r.some(c => /StudentName/i.test(c)));
    if (hIdx < 0) return await fail('No StudentName column in the Payment Due export.');
    const head = rows[hIdx].map(h => h.trim());
    const col = (re: RegExp) => head.findIndex(h => re.test(h));
    const C = {
      student: col(/^StudentName/i), father: col(/^FatherName/i),
      program: col(/^ProgramName_Term/i), status: col(/^StudentStatus/i),
      discount: col(/^Discount_applicable/i), uin: col(/^InvoiceNumber/i),
      admitted: col(/^AdmissionDate/i),
      t1inv: col(/^InvoiceAmount_Term1/i), t1col: col(/^CollectionAmount_Term1/i),
      t2inv: col(/^InvoiceAmount_Term2/i), t2col: col(/^CollectionAmount_Term2/i),
    };
    if (C.student < 0 || C.uin < 0) return await fail('Payment Due export missing StudentName / InvoiceNumber.');

    const { data: prevRows } = await sb.from('fee_invoices').select('uin,term1_collected_paise,term2_collected_paise');
    const prev = new Map((prevRows || []).map((r: any) => [r.uin, r]));

    const PROGRAM_ID: Record<string, number> = {
      'play group': 24, nursery: 25, 'euro junior': 26, 'euro senior': 27, eurotots: 39,
    };
    const kids: any[] = [], fees: any[] = [], events: any[] = [], progs = new Map<number, any>();
    const now = new Date().toISOString();

    for (const r of rows.slice(hIdx + 1)) {
      const uin = (r[C.uin] || '').trim();
      const name = (r[C.student] || '').trim();
      if (!uin || !name || !/^EK\//i.test(uin)) continue;

      const programName = (r[C.program] || '').trim();
      const pid = PROGRAM_ID[programName.toLowerCase()] ?? null;
      if (pid && !progs.has(pid)) progs.set(pid, { epms_program_id: pid, name: programName, seen_in_payment_due: true });

      const t1i = paise(r[C.t1inv]), t1c = paise(r[C.t1col]);
      const t2i = paise(r[C.t2inv]), t2c = paise(r[C.t2col]);
      const t1d = Math.max(0, t1i - t1c), t2d = Math.max(0, t2i - t2c);
      const ti = t1i + t2i, tc = t1c + t2c, td = t1d + t2d;
      const pay = td === 0 ? 'Paid' : tc > 0 ? 'Partial' : 'Pending';
      const status = (r[C.status] || '').trim();

      const p = prev.get(uin);
      if (p) {
        const d1 = t1c - (p.term1_collected_paise ?? 0);
        const d2 = t2c - (p.term2_collected_paise ?? 0);
        if (d1 > 0) events.push({ uin, student_name: name, term: 1, amount_paise: d1,
          sync_run_id: runId, prev_collected_paise: p.term1_collected_paise, new_collected_paise: t1c });
        if (d2 > 0) events.push({ uin, student_name: name, term: 2, amount_paise: d2,
          sync_run_id: runId, prev_collected_paise: p.term2_collected_paise, new_collected_paise: t2c });
      }

      fees.push({ invoice_number: uin, uin, student_name: name, father_name: (r[C.father] || '').trim(),
        program_name: programName, epms_program_id: pid, student_status: status,
        discount_applicable: (r[C.discount] || '').trim(), admission_date: (r[C.admitted] || '').trim() || null,
        term1_invoiced_paise: t1i, term1_collected_paise: t1c, term1_due_paise: t1d,
        term2_invoiced_paise: t2i, term2_collected_paise: t2c, term2_due_paise: t2d,
        total_invoiced_paise: ti, total_collected_paise: tc, total_due_paise: td,
        payment_status: pay, row_hash: await sha1(`${uin}|${td}|${pay}`), last_seen_at: now });

      kids.push({ uin, student_name: name, father_name: (r[C.father] || '').trim(),
        program_name: programName, epms_program_id: pid, student_status: status,
        admission_month: (r[C.admitted] || '').trim() || null,
        row_hash: await sha1(`${name}|${status}|${programName}`), last_seen_at: now });
    }

    if (!fees.length) return await fail('Parsed the Payment Due export but found no child rows.');

    // ── events FIRST. If this fails nothing else is touched, so the next run
    //    still sees the delta and the payment is not lost.
    if (events.length) {
      const ev = await sb.from('payment_events')
        .upsert(events, { onConflict: 'uin,term,new_collected_paise', ignoreDuplicates: true });
      if (ev.error) return await fail('payment_events: ' + ev.error.message);
    }

    if (progs.size) {
      const p = await sb.from('programs').upsert([...progs.values()], { onConflict: 'epms_program_id' });
      if (p.error) return await fail('programs: ' + p.error.message);
    }
    const c1 = await sb.from('children').upsert(kids, { onConflict: 'uin' });
    if (c1.error) return await fail('children: ' + c1.error.message);
    const f1 = await sb.from('fee_invoices').upsert(fees, { onConflict: 'invoice_number' });
    if (f1.error) return await fail('fee_invoices: ' + f1.error.message);

    // ── Transfers (best effort)
    let transfers = 0;
    try {
      const tr = await reportCsv(jar, 'rptTransferStudent.aspx', `FID=${fid}&FYID=${fyid}`);
      const th = tr.findIndex(r => r.some(c => /StudentName|UIN|Invoice/i.test(c)));
      if (th >= 0) {
        const H = tr[th].map(x => x.trim());
        const ci = (re: RegExp) => H.findIndex(h => re.test(h));
        const cu = ci(/UIN|InvoiceNumber/i), cn = ci(/StudentName/i),
              cp = ci(/ProgramName/i), ct = ci(/Type|Status/i), cd = ci(/Date/i);
        const list: any[] = [];
        for (const r of tr.slice(th + 1)) {
          const uin = (r[cu] || '').trim();
          if (!uin || !/^EK\//i.test(uin)) continue;
          list.push({ uin, student_name: (r[cn] || '').trim(), program_name: cp >= 0 ? (r[cp] || '').trim() : null,
            transfer_type: ct >= 0 ? (r[ct] || '').trim() : null,
            transfer_date: cd >= 0 && r[cd] ? (r[cd] || '').trim() : null,
            detail: { row: r }, last_seen_at: now });
        }
        if (list.length) {
          const t = await sb.from('transfers').upsert(list, { onConflict: 'uin' });
          if (!t.error) transfers = list.length;
        }
      }
    } catch (_) { /* transfers are optional */ }

    await sb.from('sync_runs').update({ finished_at: now, rows_fetched: fees.length,
      rows_changed: fees.length, status: 'ok' }).eq('id', runId);

    const active = fees.filter(x => !/quit|transferout/i.test(x.student_status)).length;
    const paymentsTotal = events.reduce((s, e) => s + e.amount_paise, 0);
    return json({ ok: true, children: kids.length, invoices: fees.length,
      active, programs: progs.size, transfers, new_payments: events.length,
      new_payments_rupees: Math.round(paymentsTotal / 100), at: now });

  } catch (e) { return await fail(String(e)); }
});
