/* ============================================================
   Enquiries & Admissions — the front of the funnel.
   Loaded after hub.html's script and shares its globals (el, esc, getSb,
   openDrawer, head, has, session, profile, debounce, cached, longDate…).

   The vocabulary is Coda's, so nobody has to relearn their own database:
   multi-select programme / lead source / admission stage, the two-part
   status where "In progress + Won" means the form is taken but the fee is
   not paid, and a 0–10 sentiment slider. The table is editable in place and
   filters stack the way Coda's do.
   ============================================================ */

// Colour means "look at this". "In progress" is where 175 of 198 enquiries
// sit, so colouring it says nothing and competes with the one blue thing on
// the screen that is actually a button. Grey is the right answer for the
// ordinary case.
const ENQ_STATUSES = [
  ['in_progress', 'In progress',             'c-mute'],
  ['form_taken',  'Form taken · fee pending','c-warn'],
  ['won',         'Won',                     'c-good'],
  ['almost_lost', 'Almost lost',             'c-warn'],
  ['lost',        'Lost',                    'c-crit'],
];
const ENQ_STATUS = Object.fromEntries(ENQ_STATUSES.map(([k, l, c]) => [k, { l, c }]));
const ENQ_SOURCES = ['Walk In', 'Call', 'Website', 'Leadsquare', 'Instagram', 'Referral', 'Just Dial', 'WhatsApp', 'Others'];
const ENQ_STAGES = ['1st Call Contact', '1st Whatsapp Contact', '1st Premise Visit', '2nd Premise Visit', '1st Follow-up', '2nd Follow-up', 'Confirmed | Not Paid', 'Leadsquare'];
const ENQ_PROGRAMS = ['P.G.', 'Nursery', 'Euro Junior', 'Euro Senior', 'Daycare', 'Summercamp', 'Evening Club', 'Bridge', 'Settler'];
const ENQ_CALLS = ['Call Made', 'Tried Calling', 'Positive', 'Invalid Number', 'Not Reachable', 'Follow-up Call'];
const EVENT_ICON = { call_in: '📞', call_out: '📲', missed_call: '📵', walk_in: '🚶', website: '🌐', form: '📝', visit: '🏫', stage: '➡️', status: '➡️', sentiment: '🌡', note: '🗒', email: '✉️', whatsapp: '💬', sms: '💬', won: '🎉', lost: '⏹', created: '✨', edit: '✏️', reminder: '⏰' };

const enqName = e => e.child_name || (e.father_name ? `${e.father_name}’s child` : null) || (e.phone ? `Unknown · ${e.phone}` : 'Unknown caller');
// 0–10, as a bar: a glance sorts hot from cold without reading a number.
const heatBar = h => (h === null || h === undefined) ? '<span class="hint">—</span>'
  : `<span class="heat" title="${h} / 10"><i style="width:${h * 10}%;background:${h >= 7 ? 'var(--green)' : h >= 4 ? 'var(--orange)' : 'var(--red)'}"></i></span><b class="heatn">${h}</b>`;
const statusChip = s => `<span class="chip ${ENQ_STATUS[s]?.c || 'c-mute'}">${ENQ_STATUS[s]?.l || s}</span>`;
// hub.html calls this money(); portal.html and teacher.html call it inr().
// The fees block on Reports was written against the name the portal uses, and
// the hub does not load the portal — so the whole screen threw a
// ReferenceError mid-template, the assignment aborted, and Reports sat on
// "Counting…" for ever. One alias, rather than a rename that would drift
// again the next time something is moved between the two.
const inr = n => money(n);
const chipList = (a, cls = 'c-mute') => (a || []).map(x => `<span class="chip ${cls}">${esc(x)}</span>`).join(' ') || '<span class="hint">—</span>';
const whenAgo = iso => {
  if (!iso) return '—';
  const d = (Date.now() - new Date(iso).getTime()) / 864e5;
  if (d < 1) return 'today'; if (d < 2) return 'yesterday'; if (d < 30) return `${Math.floor(d)} d ago`;
  return longDate(iso.slice(0, 10));
};
const dtLocal = iso => iso ? new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
const toInputDT = iso => iso ? new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '';
const waHref = (phone, text) => `https://wa.me/${String(phone || '').replace(/\D/g, '').replace(/^(\d{10})$/, '91$1')}?text=${encodeURIComponent(text || '')}`;
const acadYear = (d = new Date()) => { const y = d.getFullYear(), m = d.getMonth() + 1; const a = m >= 4 ? y : y - 1; return `${String(a).slice(2)}-${String(a + 1).slice(2)}`; };

async function enqApi(path, body){
  const { data: { session: s } } = await getSb().auth.getSession();
  if (!s) return { ok: false, error: 'Your session has expired — please sign in again.' };
  const r = await fetch(path, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s.access_token}` }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); try { return JSON.parse(t); } catch { return { ok: false, error: `The server returned ${r.status}.` }; }
}
const enqRows = () => cached('enq:rows', async () => {
  const { data, error } = await getSb().schema('eurokids').from('v_enquiry').select('*').order('created_at', { ascending: false }).limit(5000);
  if (error) throw error; return data || [];
});
// Clearing the cache is not refreshing the screen.
//
// This only emptied the cache, and twelve call sites assumed that was enough.
// It is not: the list is already rendered from rows held in memory, so
// deleting a family cleared the cache, left the row sitting on screen, and
// the next load — minutes later, or when somebody pressed reload — was the
// first time the screen agreed with the database. "Why do I have to keep
// reloading it" is this, and it was never one bug in one button.
//
// So refreshing now means both. The repaint is deferred to the end of the
// current handler, because the callers do things in different orders —
// close the drawer then refresh, refresh then reopen — and a repaint in the
// middle of that fights whatever they do next. A drawer that is open is left
// alone: the person is reading it, and pulling the page out from under them
// is worse than a stale row behind it. It repaints when they close it.
let _enqPaint = 0;
const enqRefresh = () => {
  invalidate('enq');
  clearTimeout(_enqPaint);
  _enqPaint = setTimeout(() => {
    if (typeof app !== 'undefined' && app !== 'enquiries') return;
    if (document.getElementById('drawer')?.classList.contains('on')) return;
    if (typeof renderApp === 'function') renderApp();
  }, 0);
};
const who = () => (profile?.full_name || session?.user?.email || '').split('@')[0];

// Save one field and leave a trail, so "who changed this, and when" is answerable.
async function enqPatch(id, patch, note){
  const { error } = await getSb().schema('eurokids').from('enquiry')
    // Who and when, on every edit, without anybody having to type it.
    .update({ ...patch, updated_by: who(), updated_at: new Date().toISOString() }).eq('id', id);
  if (error) { alert('Could not save: ' + error.message); return false; }
  if (note) await getSb().schema('eurokids').from('enquiry_event').insert({ enquiry_id: id, kind: note.kind || 'edit', summary: note.summary, actor: who() });
  enqRefresh(); return true;
}

/* ── Today ───────────────────────────────────────────────────── */
async function tabEnqToday(){
  const b = el('body');
  b.innerHTML = head('Today', '', `<button class="btn" id="enq-new">New Enquiry…</button>`) + '<div class="loading">Loading…</div>';
  el('enq-new').onclick = () => openNewEnquiry();
  let rows; try { rows = await enqRows(); } catch (e) { return b.innerHTML = fail(e); }
  const today = new Date().toISOString().slice(0, 10), monthStart = today.slice(0, 7) + '-01';
  const open = rows.filter(r => !r.closed);
  const due = open.filter(r => r.follow_up_on && r.follow_up_on <= today).sort((a, z) => (a.follow_up_on || '').localeCompare(z.follow_up_on || ''));
  const fresh = open.filter(r => !(r.stages || []).length || (r.stages || []).every(s => s === 'Leadsquare')).slice(0, 30);
  const visits = open.filter(r => r.visit_at && r.visit_at.slice(0, 10) === today);
  const thisMonth = rows.filter(r => r.created_at >= monthStart);
  const visitedMonth = rows.filter(r => r.first_visit_at && r.first_visit_at >= monthStart);
  const wonMonth = rows.filter(r => r.won_at && r.won_at >= monthStart);
  const { data: calls } = await getSb().schema('eurokids').from('call_log').select('id,caller,started_at,status,enquiry_id,agent')
    .gte('started_at', today + 'T00:00:00').order('started_at', { ascending: false }).limit(50);

  const list = (title, items, empty, render) => `
    <div class="panel"><div class="ptop"><h2>${title}</h2><span class="hint">${items.length}</span></div>
      ${items.length ? `<div class="box" style="box-shadow:none;border-radius:0">${items.map(render).join('')}</div>` : `<div class="pbody hint">${empty}</div>`}</div>`;
  const item = r => `<button class="linkrow enq-row" data-id="${r.id}" style="display:flex;justify-content:space-between;gap:12px;align-items:center;color:var(--label)">
      <span><strong>${esc(enqName(r))}</strong><span class="hint" style="margin-left:8px">${esc((r.programs || []).join(', '))}${r.phone ? ' · ' + esc(r.phone) : ''}</span>
        ${r.latest_note ? `<div class="hint">🗒 ${esc(String(r.latest_note).slice(0, 80))}${r.latest_note_by ? ' — ' + esc(r.latest_note_by) : ''}</div>` : ''}</span>
      <span style="display:flex;gap:8px;align-items:center;flex:none">${heatBar(r.sentiment)}${statusChip(r.status)}<span style="color:var(--label-3)">›</span></span></button>`;

  b.innerHTML = head('Today', new Date().toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'long' }), `<button class="btn" id="enq-new">New Enquiry…</button>`)
    + `<div class="stats">
        <div class="stat"><div class="k">Open enquiries</div><div class="v">${open.length}</div><div class="m">${due.length} need a follow-up</div></div>
        <div class="stat"><div class="k">This month</div><div class="v">${thisMonth.length}</div><div class="m">new enquiries</div></div>
        <div class="stat"><div class="k">Visited</div><div class="v">${visitedMonth.length}</div><div class="m">this month</div></div>
        <div class="stat good"><div class="k">Won</div><div class="v">${wonMonth.length}</div><div class="m">${thisMonth.length ? Math.round(100 * wonMonth.length / thisMonth.length) + '% of this month’s' : 'this month'}</div></div>
      </div>
      <div class="grp"><h3>The morning</h3><div class="box" id="brief-box"></div></div>
      ${list('Follow-ups due', due, 'Nothing due today.', item)}
      ${list('Visits today', visits, 'No visits booked for today.', item)}
      ${list('Nobody has spoken to them yet', fresh, 'Every enquiry has been contacted.', item)}
      ${(calls || []).length ? list('Calls today', calls, '', c => `<button class="linkrow enq-row" data-id="${c.enquiry_id || ''}" style="display:flex;justify-content:space-between;gap:12px;color:var(--label)">
          <span><strong>${esc(c.caller || '')}</strong><span class="hint" style="margin-left:8px">${dtLocal(c.started_at)}${c.agent ? ' · ' + esc(c.agent) : ''}</span></span>
          <span class="chip ${c.status === 'missed' ? 'c-crit' : 'c-good'}">${esc(c.status || '')}</span></button>`) : ''}`;
  el('enq-new').onclick = () => openNewEnquiry();
  b.querySelectorAll('.enq-row').forEach(x => x.onclick = () => x.dataset.id && openEnquiry(Number(x.dataset.id)));
  if (window._openNewEnquiry) { window._openNewEnquiry = false; openNewEnquiry(); }
  renderBrief();
}

/* ── the morning brief ─────────────────────────────────────────
   Everything in it is already on a screen somewhere — follow-ups in the list,
   money in Fees, absences in the portal. Nobody opens five screens before the
   first parent arrives, so the thing that needed attention today gets found on
   Thursday. Every figure is counted in SQL; Claude only decides how to say it.

   Kept for the day in this browser, because the counts barely move between
   nine and ten and nobody should pay for the same brief twice. */
async function renderBrief(){
  const box = el('brief-box'); if (!box) return;
  const today = new Date().toISOString().slice(0, 10);
  const stash = `ek-brief-${today}`;
  let cached = null;
  try { cached = JSON.parse(sessionStorage.getItem(stash) || 'null'); } catch (_) {}
  if (cached) return paintBrief(cached);

  box.innerHTML = '<div class="rowx hint">Reading the morning…</div>';
  const j = await enqApi('/api/brief');
  if (!j.ok) return box.innerHTML = `<div class="rowx"><div class="err">${esc(j.error)}</div></div>`;
  try { sessionStorage.setItem(stash, JSON.stringify(j)); } catch (_) {}
  paintBrief(j);

  function paintBrief(d){
    // A deliberately small Markdown reader: headings, list items, bold. The
    // model is told to use nothing else, and anything it sends beyond that is
    // shown as the plain text it is rather than as raw symbols.
    const md = s => esc(s)
      .replace(/^## (.+)$/gm, '<h4 style="margin:14px 0 4px;font-size:var(--fs-hd)">$1</h4>')
      .replace(/^- (.+)$/gm, '<li>$1</li>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/(<li>[\s\S]*?<\/li>)(?!\s*<li>)/g, '<ul style="margin:4px 0 0 18px">$1</ul>')
      .replace(/\n{2,}/g, '<p style="margin:8px 0 0"></p>');
    box.innerHTML = `<div class="rowx" style="padding-top:4px">${md(d.brief)}</div>`
      + (d.written ? '' : `<div class="foot">${d.error ? esc(d.error) + ' — ' : ''}Showing the plain counts; Claude did not write this one.</div>`);
  }
}

/* ── Enquiries: the editable table with stacking filters ─────── */
// Every column can be filtered, the way Coda does it.
const EQ_FIELDS = [
  { k: 'child_name',    l: "Child's Name",   t: 'text' },
  { k: 'programs',      l: 'Program',        t: 'multi', opts: () => ENQ_PROGRAMS },
  { k: 'sources',       l: 'Lead Source',    t: 'multi', opts: () => ENQ_SOURCES },
  { k: 'stages',        l: 'Admission Stage',t: 'multi', opts: () => ENQ_STAGES },
  { k: 'status',        l: 'Inquiry Status', t: 'enum',  opts: () => ENQ_STATUSES.map(s => s[0]), label: v => ENQ_STATUS[v]?.l || v },
  { k: 'academic_year', l: 'Academic Year',  t: 'enum',  opts: rows => [...new Set(rows.map(r => r.academic_year))].sort() },
  { k: 'sentiment',     l: 'Sentiment',      t: 'num' },
  { k: 'sex',           l: 'Sex',            t: 'enum',  opts: () => ['Boy', 'Girl'] },
  { k: 'father_name',   l: "Father's Name",  t: 'text' },
  { k: 'father_phone',  l: 'Father Phone',   t: 'text' },
  { k: 'father_email',  l: "Father's Email", t: 'text' },
  { k: 'mother_name',   l: "Mother's Name",  t: 'text' },
  { k: 'mother_phone',  l: "Mother's Phone", t: 'text' },
  { k: 'address',       l: 'Address',        t: 'text' },
  { k: 'call_status',   l: 'Call Status',    t: 'enum',  opts: () => ENQ_CALLS },
  { k: 'call_date',     l: 'Call Date',      t: 'date' },
  { k: 'visit_at',      l: 'Visit Schedule', t: 'date' },
  { k: 'follow_up_on',  l: 'Follow-Up Date', t: 'date' },
  { k: 'dob',           l: 'Date of Birth',  t: 'date' },
  { k: 'created_at',    l: 'Created on',     t: 'date' },
  { k: 'updated_at',    l: 'Worked Last On', t: 'date' },
  { k: 'updated_by',    l: 'Edited Last By', t: 'text' },
  { k: 'latest_note',   l: 'Latest note',    t: 'text' },
];
const EQ_OPS = {
  text:  [['contains', 'contains'], ['=', 'is equal to'], ['!=', 'is not equal to'], ['startswith', 'starts with'], ['empty', 'is blank'], ['notempty', 'is not blank']],
  enum:  [['=', 'is equal to'], ['!=', 'is not equal to'], ['empty', 'is blank'], ['notempty', 'is not blank']],
  multi: [['has', 'contains any of'], ['hasnot', 'does not contain'], ['empty', 'is blank'], ['notempty', 'is not blank']],
  num:   [['=', 'is equal to'], ['>', 'is greater than'], ['<', 'is less than'], ['>=', 'is at least'], ['<=', 'is at most'], ['empty', 'is blank'], ['notempty', 'is not blank']],
  date:  [['=', 'is on'], ['<', 'is before'], ['>', 'is after'], ['today', 'is today or earlier'], ['empty', 'is blank'], ['notempty', 'is not blank']],
};
// The school's own default: this academic year, still in play.
const EQ_DEFAULT = [
  { field: 'academic_year', op: '=', value: acadYear() },
  { field: 'status', op: '!=', value: 'lost' },
];
let _eq = { conds: null, q: '', sort: { field: 'created_at', dir: 'desc' }, rows: [], last: [] };
const eqLoadConds = () => { if (_eq.conds) return; try { _eq.conds = JSON.parse(localStorage.getItem('ek-enq-filter')) || JSON.parse(JSON.stringify(EQ_DEFAULT)); } catch { _eq.conds = JSON.parse(JSON.stringify(EQ_DEFAULT)); } };
const eqSaveConds = () => { try { localStorage.setItem('ek-enq-filter', JSON.stringify(_eq.conds)); } catch (_) {} };

function eqEval(r, c){
  const f = EQ_FIELDS.find(x => x.k === c.field); if (!f) return true;
  const raw = r[c.field];
  const arr = Array.isArray(raw) ? raw : null;
  const empty = arr ? !arr.length : (raw === null || raw === undefined || raw === '');
  if (c.op === 'empty') return empty;
  if (c.op === 'notempty') return !empty;
  if (f.t === 'multi') { const v = (c.value || '').toLowerCase(); return c.op === 'has' ? (arr || []).some(x => x.toLowerCase() === v) : !(arr || []).some(x => x.toLowerCase() === v); }
  if (f.t === 'num') { const v = Number(raw), a = Number(c.value); if (raw === null) return false;
    return c.op === '=' ? v === a : c.op === '>' ? v > a : c.op === '<' ? v < a : c.op === '>=' ? v >= a : v <= a; }
  if (f.t === 'date') { const v = String(raw || '').slice(0, 10), a = String(c.value || '').slice(0, 10);
    if (c.op === 'today') return !!v && v <= new Date().toISOString().slice(0, 10);
    if (!v) return false; return c.op === '=' ? v === a : c.op === '<' ? v < a : v > a; }
  const v = String(raw ?? '').toLowerCase(), a = String(c.value ?? '').toLowerCase();
  return c.op === 'contains' ? v.includes(a) : c.op === 'startswith' ? v.startsWith(a) : c.op === '=' ? v === a : v !== a;
}
const eqDescribe = c => {
  const f = EQ_FIELDS.find(x => x.k === c.field); if (!f) return '';
  const op = (EQ_OPS[f.t] || []).find(o => o[0] === c.op)?.[1] || c.op;
  const val = ['empty', 'notempty', 'today'].includes(c.op) ? '' : ' ' + (f.label ? f.label(c.value) : c.value);
  return `${f.l} ${op}${val}`;
};

async function tabEnqList(){
  const b = el('body'); eqLoadConds();
  b.innerHTML = head('Enquiries', '', `<button class="btn" id="enq-new">New Enquiry…</button>`) + '<div class="loading">Loading…</div>';
  el('enq-new').onclick = () => openNewEnquiry();
  let rows; try { rows = await enqRows(); } catch (e) { return b.innerHTML = fail(e); }
  _eq.rows = rows;

  b.innerHTML = head('Enquiries', '', `
      <button class="btn line sm" id="eq-filter">Filter<b id="eq-fcount" style="margin-left:5px"></b></button>
      <div class="more"><button class="btn line sm" id="eq-sortbtn">Sort</button><div class="menu" id="eq-sortmenu"></div></div>
      <div class="more"><button class="btn line sm" id="eq-morebtn">•••</button><div class="menu" id="eq-moremenu">
        <button id="eq-csv">Download CSV</button><button id="eq-mail">Email these families</button>
        <div class="msep"></div><button id="eq-reset">Reset filter to this year</button></div></div>
      <button class="btn" id="enq-new">New Enquiry…</button>`)
    + `<div class="tools"><div class="search"><input class="in" id="eq-q" type="search" placeholder="Search child, parent, phone or note" value="${esc(_eq.q)}"></div>
        <span class="hint" id="eq-meta"></span></div>
      <div class="fdesc" id="eq-fdesc"></div>
      <div id="dupe-bar"></div>
      <div class="panel"><div class="tw"><table id="eq-table"><thead><tr>
        <th scope="col">Child</th><th scope="col" class="eq-hv">Heat</th><th scope="col">Programme</th>
        <th scope="col">Status</th><th scope="col">Follow-up</th><th scope="col">Phone</th>
        <th scope="col">Latest note</th><th scope="col" class="eq-r">Last worked</th></tr></thead>
        <tbody id="eq-rows"></tbody></table></div></div>`;
  el('enq-new').onclick = () => openNewEnquiry();
  el('eq-filter').onclick = openEnqFilter;
  const wire = (btn, menu) => { el(btn).onclick = e => { e.stopPropagation(); document.querySelectorAll('.menu.open').forEach(m => m !== el(menu) && m.classList.remove('open')); el(menu).classList.toggle('open'); }; el(menu).onclick = e => { e.stopPropagation(); if (e.target.closest('button')) el(menu).classList.remove('open'); }; };
  wire('eq-sortbtn', 'eq-sortmenu'); wire('eq-morebtn', 'eq-moremenu');
  if (!window._eqMenuBound) { window._eqMenuBound = true; document.addEventListener('click', () => document.querySelectorAll('#eq-sortmenu.open,#eq-moremenu.open').forEach(m => m.classList.remove('open'))); }
  el('eq-reset').onclick = () => { _eq.conds = JSON.parse(JSON.stringify(EQ_DEFAULT)); eqSaveConds(); eqRun(); };
  el('eq-csv').onclick = () => {
    const cols = ['child_name', 'sentiment', 'programs', 'academic_year', 'created_at', 'dob', 'sex', 'father_name', 'father_phone', 'father_email', 'mother_name', 'mother_phone', 'mother_email', 'address', 'sources', 'stages', 'status', 'visit_at', 'call_status', 'call_date', 'follow_up_on', 'latest_note', 'updated_at', 'updated_by'];
    const csv = [cols.join(',')].concat(_eq.last.map(r => cols.map(c => `"${String(Array.isArray(r[c]) ? r[c].join(', ') : (r[c] ?? '')).replace(/"/g, '""')}"`).join(','))).join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = 'enquiries.csv'; a.click();
  };
  el('eq-mail').onclick = () => {
    const to = _eq.last.map(r => r.father_email || r.mother_email).filter(Boolean);
    if (!to.length) return alert('Nobody in this list has an email address.');
    tab = 'compose'; app = 'admissions'; renderApp();
    setTimeout(() => { const x = el('cmp-extra'); if (x) { x.value = [...new Set(to)].join(', '); x.dispatchEvent(new Event('input')); } }, 500);
  };
  el('eq-q').oninput = debounce(() => { _eq.q = el('eq-q').value; eqRun(); }, 160);
  eqRun();
  // Arrived from the "a family just walked in" email. The card is opened over
  // the list rather than instead of it, so closing it leaves you somewhere
  // useful instead of on a blank screen.
  if (window._openEnquiryId) { const id = window._openEnquiryId; window._openEnquiryId = 0; openEnquiry(id); }
  renderDupeBanner();
}

function eqRun(){
  const rows = _eq.rows, q = (_eq.q || '').trim().toLowerCase();
  let list = rows.filter(r => _eq.conds.every(c => eqEval(r, c)) &&
    (!q || [r.child_name, r.father_name, r.mother_name, r.father_phone, r.mother_phone, r.father_email, r.address, r.latest_note].some(v => (v || '').toLowerCase().includes(q))));
  const { field, dir } = _eq.sort, f = EQ_FIELDS.find(x => x.k === field);
  list.sort((a, z) => { let x = a[field], y = z[field];
    if (f?.t === 'num') { x = Number(x ?? -1); y = Number(y ?? -1); } else { x = String(Array.isArray(x) ? x.join() : x ?? ''); y = String(Array.isArray(y) ? y.join() : y ?? ''); }
    return (x < y ? -1 : x > y ? 1 : 0) * (dir === 'desc' ? -1 : 1); });
  _eq.last = list;
  el('eq-fcount').textContent = _eq.conds.length ? String(_eq.conds.length) : '';
  el('eq-meta').innerHTML = `<strong>${list.length}</strong> of ${rows.length} · ${list.filter(r => !r.closed).length} open`;
  el('eq-fdesc').textContent = _eq.conds.length ? 'Where ' + _eq.conds.map(eqDescribe).join(', and ') : '';
  el('eq-sortmenu').innerHTML = EQ_FIELDS.map(x => `<button data-k="${x.k}"><span class="chk">${_eq.sort.field === x.k ? '✓' : ''}</span>${x.l}${_eq.sort.field === x.k ? `<span class="sub">${_eq.sort.dir === 'asc' ? '↑' : '↓'}</span>` : ''}</button>`).join('');
  el('eq-sortmenu').querySelectorAll('button').forEach(x => x.onclick = () => {
    if (_eq.sort.field === x.dataset.k) _eq.sort.dir = _eq.sort.dir === 'asc' ? 'desc' : 'asc';
    else _eq.sort = { field: x.dataset.k, dir: 'asc' };
    eqRun();
  });

  // Editable where it saves a trip into the record: status, sentiment, call
  // status, and the two dates the coordinator lives by.
  const sel = (id, v, opts, label) => `<select class="in eq-edit" data-f="${id}" style="width:auto;max-width:160px"><option value=""></option>${opts.map(o => `<option value="${esc(o)}" ${v === o ? 'selected' : ''}>${esc(label ? label(o) : o)}</option>`).join('')}</select>`;
  el('eq-rows').innerHTML = list.map(r => {
    // Heat is a number, not a slider.
    //
    // Eight draggable range inputs down a column competed with the data they
    // were annotating, and an enquiry nobody has judged drew its bar at five
    // of ten — a value nobody had entered. The number says it in one glyph
    // and a dash says "not set" without pretending otherwise. Dragging it
    // lives in the drawer, where there is room.
    //
    // Class .hv, not .heat: hub.css already owns .heat as a 64x7px pill with
    // overflow hidden, which clipped the digit to seven pixels and made the
    // number look like it simply was not there.
    const unset = r.sentiment === null || r.sentiment === undefined;
    const hc = unset ? '' : r.sentiment >= 7 ? 'var(--green)' : r.sentiment >= 4 ? 'var(--orange)' : 'var(--red)';
    const heat = unset
      ? '<span class="hv none">&mdash;</span>'
      : `<span class="hv" style="color:${hc}">${r.sentiment}</span>`;

    // One axis of row colour. Green is won, red is lost, and that is all it
    // ever means now — "a follow-up is overdue" used to borrow the same
    // stripe in orange, which is a different question wearing the same
    // clothes. Overdue says the word instead.
    const k = r.status === 'won' ? 'won' : r.status === 'lost' ? 'lost' : '';
    const due = r.follow_up_due ? ' <span class="eq-flag">OVERDUE</span>' : '';

    return `<tr data-id="${r.id}" class="${k}">
      <td class="eq-open" style="cursor:pointer"><strong>${esc(enqName(r))}</strong>${r.on_roster ? ' <span class="chip c-good">on roll</span>' : ''}<div class="hint">${esc(r.academic_year)} &middot; ${whenAgo(r.created_at)}</div></td>
      <td class="eq-hv">${heat}</td>
      <td class="hint">${esc((r.programs || []).join(', ') || '—')}</td>
      <td class="eq-st ${k}">${sel('status', r.status, ENQ_STATUSES.map(x => x[0]), v => ENQ_STATUS[v]?.l || v)}</td>
      <td class="eq-fu${r.follow_up_due ? ' is-due' : ''}"><input type="date" class="in eq-edit${r.follow_up_on ? '' : ' is-empty'}" data-f="follow_up_on" value="${r.follow_up_on || ''}">${due}</td>
      <td>${r.phone ? `<a href="tel:${esc(r.phone)}">${esc(r.phone)}</a>` : '<span class="hint">—</span>'}</td>
      <td class="eq-open eq-note" style="cursor:pointer">${r.latest_note ? `<div class="eq-note-t">${esc(String(r.latest_note).slice(0, 120))}</div><div class="hint">${esc(r.latest_note_by || '')} &middot; ${r.note_count} note${r.note_count === 1 ? '' : 's'}</div>` : '<span class="hint">add a note &rsaquo;</span>'}</td>
      <td class="hint eq-trail eq-r" title="Who worked on this, and when">
        <span class="eq-trail-when">${whenAgo(r.updated_at)}</span>
        <div class="hint">${esc(r.updated_by || '')}</div></td>
    </tr>`;
  }).join('') || `<tr><td colspan="8"><div class="empty"><div class="ic">📭</div><h3>Nothing matches</h3><div>Change the filter, or reset it to this academic year.</div></div></td></tr>`;

  el('eq-rows').querySelectorAll('.eq-open').forEach(td => td.onclick = () => openEnquiry(Number(td.closest('tr').dataset.id)));

  // "Last worked" was a dead label saying "16 d ago · EPMS sync", which
  // raises the question it does not answer: worked on by whom, doing what.
  // Every edit already writes an enquiry_event with an actor and a time, and
  // the drawer already renders that trail — it was just three clicks away.
  // Clicking the cell opens the family and goes straight to the history.
  el('eq-rows').querySelectorAll('.eq-trail').forEach(td => td.onclick = () => {
    openEnquiry(Number(td.closest('tr').dataset.id), { trail: true });
  });
  el('eq-rows').querySelectorAll('.eq-edit').forEach(x => x.onchange = async () => {
    const id = Number(x.closest('tr').dataset.id), f = x.dataset.f;
    let v = x.value || null;
    if (f === 'visit_at' && v) v = new Date(v).toISOString();
    const patch = { [f]: v };
    if (f === 'call_status' && v) patch.call_date = new Date().toISOString().slice(0, 10);   // the date fills itself
    if (f === 'status' && v === 'won') patch.won_at = new Date().toISOString();
    x.style.boxShadow = '0 0 0 3px rgba(52,199,89,.4)';
    const ok = await enqPatch(id, patch, { kind: f === 'status' ? 'status' : 'edit', summary: `${EQ_FIELDS.find(z => z.k === f)?.l || f} → ${v || '—'}` });
    setTimeout(() => { x.style.boxShadow = ''; if (ok) { const row = _eq.rows.find(z => z.id === id); if (row) Object.assign(row, patch); } }, 700);
  });
  // Adding a stage from the table itself. Opening a family's whole record to
  // tick "1st Premise Visit" was the commonest reason anybody opened it.
  el('eq-rows').querySelectorAll('.eq-stage').forEach(x => x.onchange = async () => {
    const tr = x.closest('tr'), id = Number(tr.dataset.id);
    const st = x.value; if (!st) return;
    const row = _eq.rows.find(z => z.id === id);
    const stages = [...new Set([...(row?.stages || []), st])];
    x.style.boxShadow = '0 0 0 3px rgba(52,199,89,.4)';
    const ok = await enqPatch(id, { stages }, { kind: 'stage', summary: `Stage → ${st}` });
    setTimeout(() => { x.style.boxShadow = ''; if (ok && row) row.stages = stages; }, 700);
  });

  el('eq-rows').querySelectorAll('.eq-heat').forEach(x => {
    const n = x.nextElementSibling;
    const paint = () => {
      const v = Number(x.value), c = v >= 7 ? 'var(--green)' : v >= 4 ? 'var(--orange)' : 'var(--red)';
      x.style.setProperty('--kc', c); x.style.setProperty('--kp', v * 10 + '%');
      n.textContent = v; n.style.setProperty('--kc', c);
    };
    x.oninput = paint;
    x.onchange = async () => { const id = Number(x.closest('tr').dataset.id);
      await enqPatch(id, { sentiment: Number(x.value) }, { kind: 'sentiment', summary: `Sentiment → ${x.value}/10` });
      const row = _eq.rows.find(z => z.id === id); if (row) row.sentiment = Number(x.value); };
  });
}

// The filter panel: one card per condition, add as many as you like.
function openEnqFilter(){
  const body = openDrawer('Filter', ''); const dr = el('drawer'); dr.classList.add('narrow');
  _afterDrawerClose = () => dr.classList.remove('narrow');
  const paint = () => {
    el('drawer-sub').textContent = `${_eq.last.length} of ${_eq.rows.length} enquiries`;
    body.innerHTML = _eq.conds.map((c, i) => {
      const f = EQ_FIELDS.find(x => x.k === c.field) || EQ_FIELDS[0];
      const ops = EQ_OPS[f.t]; if (!ops.some(o => o[0] === c.op)) c.op = ops[0][0];
      const opts = f.opts ? f.opts(_eq.rows) : [];
      let ctl = '';
      if (!['empty', 'notempty', 'today'].includes(c.op)) {
        ctl = (f.t === 'enum' || f.t === 'multi')
          ? `<select class="in fval" data-i="${i}"><option value="">Select…</option>${opts.map(o => `<option value="${esc(o)}" ${String(c.value) === String(o) ? 'selected' : ''}>${esc(f.label ? f.label(o) : o)}</option>`).join('')}</select>`
          : `<input class="in fval" data-i="${i}" type="${f.t === 'num' ? 'number' : f.t === 'date' ? 'date' : 'text'}" value="${esc(c.value ?? '')}" placeholder="Value">`;
      }
      return `${i ? '<div class="fand">And</div>' : ''}<div class="fcard"><div class="fhead"><div><div class="fname">${esc(f.l)}</div>
          <select class="fop fopsel" data-i="${i}">${ops.map(o => `<option value="${o[0]}" ${o[0] === c.op ? 'selected' : ''}>${o[1]}</option>`).join('')}</select></div>
        <button class="fdel" data-i="${i}" title="Remove">🗑</button></div>${ctl}</div>`;
    }).join('') || '<div class="hint" style="margin-top:12px">No filters — showing everything.</div>';
    body.innerHTML += `<div style="display:flex;justify-content:space-between;align-items:center;margin-top:16px">
        <button class="btn line sm" id="fadd">+ Add filter</button>${_eq.conds.length ? '<a href="#" id="fclear" class="hint">Remove all</a>' : ''}</div>
      <div id="fpick" style="display:none"><input class="in" id="fsearch" placeholder="Search fields…" style="margin-top:8px"><div class="flist" id="flistbox"></div></div>`;
    const sync = () => { eqSaveConds(); eqRun(); paint(); };
    body.querySelectorAll('.fopsel').forEach(e => e.onchange = () => { _eq.conds[+e.dataset.i].op = e.value; sync(); });
    body.querySelectorAll('.fval').forEach(e => { const h = () => { _eq.conds[+e.dataset.i].value = e.value; eqSaveConds(); eqRun(); el('drawer-sub').textContent = `${_eq.last.length} of ${_eq.rows.length} enquiries`; }; e.onchange = h; if (e.tagName === 'INPUT') e.oninput = debounce(h, 200); });
    body.querySelectorAll('.fdel').forEach(b2 => b2.onclick = () => { _eq.conds.splice(+b2.dataset.i, 1); sync(); });
    const fc = el('fclear'); if (fc) fc.onclick = ev => { ev.preventDefault(); _eq.conds = []; sync(); };
    el('fadd').onclick = () => {
      el('fpick').style.display = ''; el('fsearch').focus();
      const draw = q => el('flistbox').innerHTML = EQ_FIELDS.filter(f => !q || f.l.toLowerCase().includes(q)).map(f => `<button data-k="${f.k}"><span class="ic">${f.t === 'num' ? '#' : f.t === 'date' ? '📅' : f.t === 'multi' ? '≡' : 'T'}</span>${esc(f.l)}</button>`).join('');
      draw(''); el('fsearch').oninput = () => draw(el('fsearch').value.trim().toLowerCase());
      el('flistbox').onclick = ev => { const b2 = ev.target.closest('button'); if (!b2) return;
        const f = EQ_FIELDS.find(x => x.k === b2.dataset.k);
        _eq.conds.push({ field: f.k, op: EQ_OPS[f.t][0][0], value: '' }); sync(); };
    };
  };
  paint();
}

/* ── Calls ───────────────────────────────────────────────────── */
async function tabEnqCalls(){
  const b = el('body');
  b.innerHTML = head('Calls', 'Every call the IVR reported, matched to the family by number.') + '<div class="loading">Loading…</div>';
  const [{ data: calls, error }, rows] = await Promise.all([
    getSb().schema('eurokids').from('call_log').select('*').order('started_at', { ascending: false }).limit(500),
    enqRows().catch(() => []),
  ]);
  if (error) return b.innerHTML = fail(error);
  const byId = Object.fromEntries(rows.map(r => [r.id, r]));
  b.innerHTML = head('Calls', `${(calls || []).length} calls · ${(calls || []).filter(c => c.status === 'missed').length} missed`, `<button class="btn line" id="enq-logcall">Log a Call…</button>`)
    + ((calls || []).length ? `<div class="panel"><div class="tw"><table><thead><tr><th>When</th><th>Caller</th><th>Family</th><th>Agent</th><th>Length</th><th>Result</th><th>Recording</th></tr></thead><tbody>
      ${(calls || []).map(c => { const e = c.enquiry_id ? byId[c.enquiry_id] : null; return `<tr style="cursor:pointer" ${c.enquiry_id ? `onclick="openEnquiry(${c.enquiry_id})"` : ''}>
        <td class="hint" style="white-space:nowrap">${dtLocal(c.started_at)}</td>
        <td><strong>${esc(c.caller || '')}</strong>${c.direction === 'outbound' ? ' <span class="chip c-mute">outbound</span>' : ''}</td>
        <td>${e ? `${esc(enqName(e))} ${statusChip(e.status)}` : '<span class="hint">unknown</span>'}</td>
        <td class="hint">${esc(c.agent || '—')}${c.provider === 'manual' ? ' <span class="chip c-mute">logged by hand</span>' : ''}</td><td class="hint">${c.duration_s ? Math.floor(c.duration_s / 60) + 'm ' + (c.duration_s % 60) + 's' : '—'}</td>
        <td><span class="chip ${c.status === 'missed' ? 'c-crit' : c.status === 'answered' ? 'c-good' : 'c-mute'}">${esc(c.status || '')}</span></td>
        <td>${c.recording_url ? `<a href="${esc(c.recording_url)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">▶︎ Play</a>` : '<span class="hint">—</span>'}</td></tr>`; }).join('')}
      </tbody></table></div></div>`
    : `<div class="panel"><div class="empty"><div class="ic">📞</div><h3>No calls yet</h3><div>Point the IVR at the webhook shown in Setup and every call lands here on its own, matched to the family by number. Until then, <strong>Log a Call</strong> puts one here by hand and on the family’s card.</div></div></div>`);
  el('enq-logcall').onclick = () => openLogCall();
}

/* ── logging a call by hand ────────────────────────────────────
   This button used to open the new-enquiry sheet, which created or merged a
   family and then stopped. No call row was ever written, so a call somebody
   took and wrote down never appeared among the calls — this screen was the
   IVR's alone. A call logged here goes where an IVR call goes: the call log,
   and the family's own history. */
function openLogCall(preset = {}){
  openDrawer('Log a call', 'Who rang, what was said, and when to call them back.');
  const row = (l, c, sub) => `<div class="row"><div class="l">${l}${sub ? `<span class="sub">${sub}</span>` : ''}</div><div class="v">${c}</div></div>`;
  el('drawer-body').innerHTML = `
    <div class="grp" style="margin-top:0"><h3>The call</h3><div class="box">
      ${row('Mobile', `<input class="in" id="lc-phone" inputmode="numeric" placeholder="10-digit mobile" value="${esc(preset.phone || '')}">`, 'Type it first — if we know them, their name appears.')}
      <div class="rowx" id="lc-known" style="padding-top:0"></div>
      ${row('Direction', `<select class="in" id="lc-dir"><option value="inbound">They called us</option><option value="outbound">We called them</option></select>`)}
      ${row('Outcome', `<select class="in" id="lc-status"><option value="answered">Answered</option><option value="missed">Missed</option><option value="voicemail">Voicemail</option></select>`)}
      ${row('Minutes', `<input class="in" id="lc-min" type="number" min="0" max="600" step="1" placeholder="0" style="width:90px">`)}
      ${row('When', `<input class="in" id="lc-at" type="datetime-local" value="${new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)}">`)}
    </div></div>
    <div class="grp"><h3>What they said</h3><div class="box">
      <div class="rowx"><textarea class="in" id="lc-note" rows="3" placeholder="Asked about timings and the day care fee…" style="width:100%"></textarea></div>
      ${row('Call back on', `<input class="in" id="lc-follow" type="date">`)}
    </div></div>
    <div class="grp" id="lc-newgrp" style="display:none"><h3>We do not know this number</h3><div class="box">
      ${row('Child', `<input class="in" id="lc-child" placeholder="child’s name">`)}
      ${row('Parent', `<input class="in" id="lc-parent" placeholder="who rang">`)}
      <div class="rowx hint">Saving will start an enquiry for them.</div>
    </div></div>`;
  el('drawer-foot').innerHTML = `<div id="lc-msg"></div><button class="btn line" id="lc-cancel">Cancel</button><button class="btn" id="lc-save">Log the call</button>`;
  el('lc-cancel').onclick = closeDrawer;

  let foundId = 0, lookedUp = false;
  el('lc-phone').oninput = debounce(async () => {
    const d = el('lc-phone').value.replace(/\D/g, '').slice(-10);
    foundId = 0; lookedUp = false;
    if (d.length < 10) { el('lc-known').innerHTML = ''; el('lc-newgrp').style.display = 'none'; return; }
    const { data } = await getSb().schema('eurokids').from('v_enquiry')
      .select('id,child_name,father_name,status').eq('phone_key', d).limit(1).maybeSingle();
    lookedUp = true;
    if (data) {
      foundId = data.id;
      el('lc-known').innerHTML = `<span class="chip c-good">known</span> <strong>${esc(enqName(data))}</strong> — the call goes on their card.`;
      el('lc-newgrp').style.display = 'none';
    } else {
      el('lc-known').innerHTML = '<span class="chip c-warn">new number</span> Nobody on record with this number.';
      el('lc-newgrp').style.display = '';
    }
  }, 250);
  // Opened from a family's card: run the lookup straight away so it says
  // whose call this is, rather than waiting for a keystroke that never comes.
  if (preset.phone) el('lc-phone').dispatchEvent(new Event('input'));
  setTimeout(() => el('lc-phone').focus(), 250);

  el('lc-save').onclick = async ev => {
    const btn = ev.currentTarget;
    const phone = el('lc-phone').value.trim();
    if (phone.replace(/\D/g, '').length < 10) return el('lc-msg').innerHTML = '<div class="err">A 10-digit mobile number is needed.</div>';
    btn.disabled = true; btn.textContent = 'Saving…';
    const at = el('lc-at').value;
    const j = await enqApi('/api/enquiry/call', {
      phone, direction: el('lc-dir').value, status: el('lc-status').value,
      minutes: Number(el('lc-min').value) || 0,
      at: at ? new Date(at).toISOString() : null,
      note: el('lc-note').value, follow_up_on: el('lc-follow').value || null,
      child_name: el('lc-child') ? el('lc-child').value : '',
      caller_name: el('lc-parent') ? el('lc-parent').value : '',
      // Only once the lookup has actually answered. It starts unanswered and
      // is debounced, so pasting a number and pressing Save at once used to
      // send "create it" for a number we in fact know — which for an outbound
      // call defeats the guard that stops the hub inventing a family for a
      // misdial.
      createIfUnknown: lookedUp && !foundId,
    });
    if (!j.ok) { btn.disabled = false; btn.textContent = 'Log the call'; return el('lc-msg').innerHTML = `<div class="err">${esc(j.error)}</div>`; }
    enqRefresh();
    _afterDrawerClose = () => renderApp();
    openEnquiry(j.enquiry_id);
  };
}

/* ── Setup ───────────────────────────────────────────────────── */
async function tabEnqSetup(){
  const b = el('body');
  b.innerHTML = head('Setup', 'Where enquiries come from, and how families hear back.') + '<div class="loading">Loading…</div>';
  const j = await enqApi('/api/enquiry/setup');
  if (!j.ok) return b.innerHTML = fail(j.error);
  const code = t => `<pre style="background:var(--field);border-radius:8px;padding:12px;font-size:12.5px;overflow:auto;white-space:pre-wrap;word-break:break-all;margin:0;font-family:var(--mono)">${esc(t)}</pre>`;
  const embed = `<div id="ek-enquire"></div>
<script>
(function(){var f=document.createElement('iframe');f.src='${j.embed_url}';f.style.cssText='width:100%;border:0;min-height:820px';f.setAttribute('title','Enquire');
document.getElementById('ek-enquire').appendChild(f);
window.addEventListener('message',function(e){if(e.data&&e.data.ekEnquireHeight)f.style.height=(e.data.ekEnquireHeight+20)+'px';});})();
<\/script>`;
  const ok = v => v ? '<span class="chip c-good">ready</span>' : '<span class="chip c-warn">not set</span>';
  b.innerHTML = head('Setup', 'Where enquiries come from, and how families hear back.') + `<div style="max-width:820px">
    <div class="grp" style="margin-top:0"><h3>Website form (replaces Tally)</h3><div class="box">
      <div class="rowx"><div class="hint" style="margin-bottom:8px">Paste this into an <strong>Embed / HTML</strong> element on the Framer site. One question per screen, sizes itself, and every submission lands here with the source “Website”, sends the family a welcome email, and tells the office.</div>${code(embed)}</div>
    </div><div class="foot">Direct link for WhatsApp or an Instagram bio: <a href="${esc(j.site)}/enquire" target="_blank">${esc(j.site)}/enquire</a></div></div>

    <div class="grp"><h3>Reception tablet ${ok(j.kiosk_key_set)}</h3><div class="box">
      ${j.kiosk_url ? `<div class="rowx"><div class="hint" style="margin-bottom:8px">Open on the Samsung tab in Chrome, then <em>Add to Home screen</em>. Full screen, big type, keeps the screen awake, and clears itself for the next family. Arrives as a <strong>Walk In</strong>; a family who called earlier is recognised, not duplicated.</div>${code(j.kiosk_url)}</div>`
        : `<div class="rowx hint">Add <code>ENQUIRY_KIOSK_KEY</code> (any long random string) in Vercel → Environment Variables, redeploy, and the tablet link appears here.</div>`}
    </div></div>

    <div class="grp"><h3>IVR call log ${ok(j.ivr_key_set)}</h3><div class="box">
      ${j.ivr_url ? `<div class="rowx"><div class="hint" style="margin-bottom:8px">In the IVR provider’s settings, find <em>Webhook / Call status callback / Post-call URL</em> and paste this. It understands the field names of Exotel, MyOperator, Knowlarity, Servetel, Ozonetel and Tata Tele.</div>${code(j.ivr_url)}</div>`
        : `<div class="rowx hint">Add <code>IVR_WEBHOOK_KEY</code> in Vercel, redeploy, and the webhook URL appears here.</div>`}
    </div></div>

    <div class="grp"><h3>Messages</h3><div class="box">
      <div class="row"><div class="l">Welcome email<span class="sub">Sent to every website and tablet enquiry with an email address.</span></div><div class="v">${ok(j.email_configured)}</div></div>
      <div class="row"><div class="l">Who hears about a new enquiry<span class="sub">Chosen below, per person and per source.</span></div><div class="v">${ok(j.email_configured)}</div></div>
      <div class="row"><div class="l">Visit reminder<span class="sub">The morning before a booked visit, automatically.</span></div><div class="v">${ok(j.email_configured)}</div></div>
      <div class="row"><div class="l">WhatsApp<span class="sub">${j.whatsapp_configured ? `Template “${esc(j.whatsapp_template)}” sends itself.` : 'Not connected — every enquiry has a one-tap WhatsApp button instead.'}</span></div><div class="v">${j.whatsapp_configured ? ok(true) : '<span class="chip c-mute">manual</span>'}</div></div>
    </div></div>

    <div class="grp"><h3>Who gets told</h3><div class="box" id="nt-box"><div class="rowx hint">Loading the people…</div></div>
      <div class="foot">Everyone with hub access, from Users &amp; Access — plus any address you add below, which receives the email without being able to sign in. The email names the family and opens their card directly, and nobody is emailed a source they have not ticked.</div></div>

    <div class="grp"><h3>Bring in the Coda database</h3><div class="box">
      <div class="rowx"><div class="hint" style="margin-bottom:10px">
        In Coda, open the <strong>Enquiry Database</strong> table &rarr; <strong>&ctdot;</strong> &rarr; <em>Download as CSV</em>, then drop the file here.
        Export the whole table, not the filtered view — the hub does its own filtering, and the enquiry list already hides last year and anything lost.
        Families already here are left exactly as they are: this only adds the ones that are missing, so running it again every few weeks is safe.
      </div>
      <input type="file" id="cd-file" accept=".csv,text/csv" class="in" style="padding:9px">
      <div id="cd-out" style="margin-top:10px"></div>
      </div></div>
      <div class="foot">Notes from Neeta, Diya and Sunita come across as timeline notes under their own names.</div></div>
  </div>`;
  renderNotify();
  wireCodaImport();
}

/* ── the Coda import ───────────────────────────────────────────────
   This used to be a Python script and the service-role key, which is exactly
   why the hub sat four hundred families behind the sheet everybody was
   actually using. Preview first, always: four hundred families is not a
   thing to discover after the fact. */
function wireCodaImport(){
  const f = el('cd-file'), out = el('cd-out'); if (!f) return;
  let csv = null;
  const say = h => out.innerHTML = h;

  const post = async (commit) => {
    say('<span class="hint">Reading…</span>');
    const j = await enqApi('/api/enquiry/import', { csv, commit });
    if (!j.ok) return say(`<div class="err">${esc(j.error)}</div>`);
    const warn = (j.unparsed_dates || []).length
      ? `<div class="hint" style="margin-top:6px">Dates it could not read (left blank): ${esc(j.unparsed_dates.join(' · '))}</div>` : '';
    if (j.dry_run) {
      say(`<div class="hint"><strong>${j.in_file}</strong> families in the file ·
            <strong>${j.already_here}</strong> already here, untouched ·
            <strong>${j.to_add}</strong> would be added, with ${j.notes_in_file} notes.</div>
           ${j.sample.length ? `<div class="hint" style="margin-top:6px">First few: ${j.sample.map(r => esc(r.child || r.phone || '—')).join(', ')}…</div>` : ''}
           ${warn}
           <div style="margin-top:10px">${j.to_add
             ? `<button class="btn" id="cd-go">Add ${j.to_add} families</button>`
             : '<span class="chip c-good">Already up to date</span>'}</div>`);
      if (el('cd-go')) el('cd-go').onclick = () => { el('cd-go').disabled = true; el('cd-go').textContent = 'Adding…'; post(true); };
    } else {
      say(`<div class="chip c-good">Added ${j.added} families and ${j.notes_added} notes.</div>
           <div class="hint" style="margin-top:6px">${j.already_here} were already here and were not touched.</div>${warn}`);
    }
  };

  f.onchange = () => {
    const file = f.files && f.files[0]; if (!file) return;
    const r = new FileReader();
    r.onload = () => { csv = String(r.result || ''); post(false); };
    r.onerror = () => say('<div class="err">That file could not be read.</div>');
    r.readAsText(file);
  };
}

/* ── who hears about a new enquiry ─────────────────────────────
   Not a box you type addresses into. Addresses typed into settings go stale
   the day somebody leaves; an account is closed when they go and the emails
   stop with it. So these are the hub's own users, each choosing their sources.

   The hub's own users, specifically: the people in Users & Access, not every
   account that can sign in to anything. This listed all 26 auth accounts, 23
   of them teachers created in the Staff Portal, so the three lines that
   matter were buried and the list grew with every hire. */
async function renderNotify(){
  const box = el('nt-box'); if (!box) return;
  const j = await enqApi('/api/enquiry/notify');
  if (!j.ok) return box.innerHTML = `<div class="rowx"><div class="err">${esc(j.error)}</div></div>`;
  if (!j.people.length) return box.innerHTML = '<div class="rowx hint">Nobody has hub access yet. Add them in Fees &amp; Children &rarr; Users &amp; Access and they will appear here.</div>';

  const extras = j.extras || [];
  const nobody = j.people.every(p => !p.sources.length) && extras.every(x => !x.sources.length);
  box.innerHTML =
    (nobody ? `<div class="rowx hint">Nobody has been chosen yet, so new enquiries still go to the old office address. Tick somebody and that stops.</div>` : '') +
    j.people.map(p => `<div class="row" style="align-items:flex-start">
      <div class="l">${esc(p.name)}<span class="sub">${esc(p.email)}${p.role === 'admin' ? ' · admin' : ''}</span></div>
      <div class="v chips" style="flex-wrap:wrap;gap:6px;justify-content:flex-end;max-width:62%">
        ${j.sources.map(s => `<button class="chip nt-src ${p.sources.includes(s) ? 'on c-good' : 'c-mute'}"
            data-u="${esc(p.id)}" data-s="${esc(s)}" ${j.canEdit ? '' : 'disabled'}
            style="cursor:${j.canEdit ? 'pointer' : 'default'}">${esc(s)}</button>`).join('')}
      </div></div>`).join('') +
    // Plain addresses. Somebody who should get the email and has no reason to
    // sign in — and whose address is very often already a Staff Portal
    // teacher login, so an account cannot be created for it at all.
    extras.map(x => `<div class="row" style="align-items:flex-start">
      <div class="l">${esc(x.email)}<span class="sub">email only &middot; cannot sign in</span></div>
      <div class="v chips" style="flex-wrap:wrap;gap:6px;justify-content:flex-end;max-width:62%">
        ${j.sources.map(s => `<button class="chip nt-src ${x.sources.includes(s) ? 'on c-good' : 'c-mute'}"
            data-e="${esc(x.email)}" data-s="${esc(s)}" ${j.canEdit ? '' : 'disabled'}
            style="cursor:${j.canEdit ? 'pointer' : 'default'}">${esc(s)}</button>`).join('')}
        ${j.canEdit ? `<button class="chip c-mute nt-del" data-e="${esc(x.email)}" title="Remove this address">&times;</button>` : ''}
      </div></div>`).join('') +
    (j.canEdit ? `<div class="rowx" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
       <input class="in" id="nt-new" type="email" placeholder="someone@example.com" style="max-width:280px">
       <button class="btn line sm" id="nt-add">Add an address</button>
       <span class="hint">They get the email. They cannot sign in.</span></div>` : '') +
    (j.canEdit ? '' : '<div class="rowx hint">Only an admin can change this.</div>');

  if (!j.canEdit) return;
  // A chip belongs either to a hub user (data-u) or to a plain address
  // (data-e); the only difference is which key the save is sent under.
  box.querySelectorAll('.nt-src').forEach(btn => btn.onclick = async () => {
    const u = btn.dataset.u, e = btn.dataset.e;
    const sel = u ? `.nt-src[data-u="${u}"]` : `.nt-src[data-e="${e}"]`;
    const flip = () => { btn.classList.toggle('on'); btn.classList.toggle('c-good'); btn.classList.toggle('c-mute'); };
    flip();
    const sources = [...box.querySelectorAll(sel + '.on')].map(x => x.dataset.s);
    const r = await enqApi('/api/enquiry/notify', u ? { user_id: u, sources } : { email: e, sources });
    if (!r.ok) {
      // Put the chip back rather than leaving the screen claiming something
      // that was never saved.
      flip();
      alert(r.error || 'That could not be saved.');
    }
  });

  box.querySelectorAll('.nt-del').forEach(btn => btn.onclick = async () => {
    const e = btn.dataset.e;
    if (!confirm(`Stop emailing ${e} about enquiries?`)) return;
    const r = await enqApi('/api/enquiry/notify', { email: e, remove: true });
    if (!r.ok) return alert(r.error || 'That could not be removed.');
    renderNotify();
  });

  const add = el('nt-add');
  if (add) add.onclick = async () => {
    const v = (el('nt-new').value || '').trim();
    if (!v) return;
    // Every source on by default — somebody added here was added to be told,
    // and an address that is on the list but ticked for nothing is the silent
    // failure this whole screen exists to prevent.
    const r = await enqApi('/api/enquiry/notify', { email: v, sources: j.sources });
    if (!r.ok) return alert(r.error || 'That could not be added.');
    el('nt-new').value = '';
    renderNotify();
  };
}

/* ── two records that might be one family ──────────────────────
   A phone number already merges on its own when an enquiry is captured, so
   everything here is a case a number cannot settle: the mother rang in
   January, the father walked in in February, and the child is the same child.
   Claude proposes; a person decides. Nothing merges itself, because mixing two
   families' records together has no clean undo. */
async function renderDupeBanner(){
  const bar = el('dupe-bar'); if (!bar) return;
  const j = await enqApi('/api/enquiry/duplicates');
  if (!j.ok) return bar.innerHTML = '';

  if (!j.pairs.length) {
    bar.innerHTML = `<details class="fold"><summary>Possible duplicate families <span class="chip c-mute">none waiting</span></summary>
      <div class="fold-body"><div class="hint" style="display:flex;justify-content:space-between;align-items:center;gap:12px">
        <span>Nothing to look at. Phone numbers already merge on their own; this is for the same family under two different numbers.</span>
        <button class="btn line" id="dupe-scan" ${j.ready ? '' : 'disabled title="ANTHROPIC_API_KEY is not set on this deployment."'}>Look for duplicates</button>
      </div></div></details>`;
  } else {
    const nm = e => esc(e.child_name || e.father_name || e.father_phone || ('#' + e.id));
    const side = (e, pid, other) => `<div style="flex:1;min-width:0;border:1px solid var(--line);border-radius:10px;padding:10px">
        <div style="font-weight:600">${nm(e)}</div>
        <div class="hint">#${e.id} · ${esc((e.sources || []).join(', '))} · ${String(e.first_contact_at || '').slice(0, 10)}</div>
        <div class="hint">${esc(e.father_name || e.mother_name || '—')} · ${esc(e.father_phone || e.mother_phone || 'no number')}</div>
        <div class="hint">${esc(e.address || '')}</div>
        <button class="btn line dupe-keep" data-p="${pid}" data-keep="${e.id}" style="margin-top:8px;width:100%">Keep this one, fold in #${other}</button>
      </div>`;
    // Shut by default. Open, it pushed the enquiry list off the screen — a
    // helpful feature making the main job harder.
    bar.innerHTML = `<details class="fold"><summary>Possible duplicate families
        <span class="chip c-warn">${j.pairs.length} waiting</span></summary><div class="fold-body">
      ${j.pairs.map(p => `<div class="box" style="margin-bottom:8px"><div class="rowx">
        <div style="margin-bottom:8px"><span class="chip ${p.confidence >= 85 ? 'c-crit' : p.confidence >= 65 ? 'c-warn' : 'c-mute'}">${p.confidence}% sure</span>
          <span style="margin-left:8px">${esc(p.reason)}</span></div>
        <div style="display:flex;gap:10px;flex-wrap:wrap">${side(p.a, p.id, p.b.id)}${side(p.b, p.id, p.a.id)}</div>
        <div style="margin-top:8px"><button class="btn line dupe-no" data-p="${p.id}">They are different families</button></div>
      </div></div>`).join('')}
      <div style="padding-top:4px"><button class="btn line" id="dupe-scan" ${j.ready ? '' : 'disabled'}>Look again</button></div>
      </div></details>`;
  }

  const scan = el('dupe-scan');
  if (scan) scan.onclick = async () => {
    scan.disabled = true; scan.textContent = 'Looking…';
    const r = await enqApi('/api/enquiry/duplicates', { action: 'scan' });
    if (!r.ok) { scan.disabled = false; scan.textContent = 'Look for duplicates'; return alert(r.error); }
    renderDupeBanner();
  };

  bar.querySelectorAll('.dupe-no').forEach(b2 => b2.onclick = async () => {
    b2.disabled = true;
    const r = await enqApi('/api/enquiry/duplicates', { action: 'not_same', id: Number(b2.dataset.p) });
    if (!r.ok) { b2.disabled = false; return alert(r.error); }
    renderDupeBanner();
  });

  bar.querySelectorAll('.dupe-keep').forEach(b2 => b2.onclick = async () => {
    const keep = Number(b2.dataset.keep);
    // Named, and spelled out, because this one cannot be undone.
    if (!confirm(`Keep enquiry #${keep} and fold the other into it?\n\nAnything the other record knows that this one does not — a name, a date of birth, an address — is copied across. Its calls, notes and history move too, and then it is deleted. This cannot be undone.`)) return;
    b2.disabled = true; b2.textContent = 'Merging…';
    const r = await enqApi('/api/enquiry/duplicates', { action: 'merge', id: Number(b2.dataset.p), keep });
    if (!r.ok) { b2.disabled = false; b2.textContent = 'Keep this one'; return alert(r.error); }
    enqRefresh(); tabEnqList();
  });
}

/* ── the enquiry sheet ───────────────────────────────────────── */
async function openEnquiry(id, opts = {}){
  const s = getSb().schema('eurokids');
  const body = openDrawer('Enquiry', '');
  const [{ data: e }, { data: events }, { data: notes }, { data: calls }] = await Promise.all([
    s.from('v_enquiry').select('*').eq('id', id).maybeSingle(),
    s.from('enquiry_event').select('*').eq('enquiry_id', id).order('at', { ascending: false }).limit(200),
    s.from('enquiry_note').select('*').eq('enquiry_id', id).order('created_at', { ascending: false }),
    s.from('call_log').select('*').eq('enquiry_id', id).order('started_at', { ascending: false }).limit(50),
  ]);
  if (!e) { body.innerHTML = '<div class="err">Enquiry not found.</div>'; return; }
  el('drawer-title').textContent = enqName(e);
  el('drawer-sub').textContent = [(e.programs || []).join(', '), (e.sources || []).join(', '), e.academic_year, 'since ' + longDate((e.first_contact_at || e.created_at).slice(0, 10))].filter(Boolean).join(' · ');

  const phone = e.father_phone || e.mother_phone;
  const waText = `Hello${e.father_name ? ' ' + e.father_name : ''}, this is ${who() || 'the team'} from EuroKids JMD Enclave. Thank you for enquiring${e.child_name ? ' for ' + e.child_name : ''} — happy to answer any questions and book a visit for you. When would suit?`;
  const row = (l, ctl, sub = '') => `<div class="row"><div class="l">${l}${sub ? `<span class="sub">${sub}</span>` : ''}</div>${ctl}</div>`;
  const inp = (i, v, ph = '', type = 'text') => `<input class="in wide" id="${i}" type="${type}" value="${esc(v ?? '')}" placeholder="${esc(ph)}">`;
  const multi = (i, chosen, opts) => `<div class="chips" id="${i}">${opts.map(o => `<span class="chip ${(chosen || []).includes(o) ? 'on' : ''}" data-v="${esc(o)}">${esc(o)}</span>`).join('')}</div>`;

  body.innerHTML = `
    ${e.has_intake_photo ? `<div class="grp"><div class="box" style="padding:0;overflow:hidden">
      <img id="en-photo" alt="Taken at the desk when this form was submitted"
           style="width:100%;display:block;background:var(--fill);aspect-ratio:16/10;object-fit:cover">
      </div><div class="foot">Taken at the reception tablet when the form was sent${
        e.intake_photo_at ? ' · ' + dtLocal(e.intake_photo_at) : ''}</div></div>` : ''}

    ${(() => {
      // Where this stands, what happens next, and the phone — in that order,
      // because that is the order a coordinator needs them in.
      //
      // What was here was a tinted panel with a 22px headline and a blue
      // progress bar: the shape every generated admin screen has. It
      // announced that a machine laid it out before it said anything about
      // the family. Plain type, real pills, a proper toolbar.
      const keen = e.sentiment ?? 5;
      const kcol = keen >= 7 ? 'var(--green)' : keen >= 4 ? 'var(--orange)' : 'var(--red)';
      const overdue = e.follow_up_due && !e.on_roster;
      const next = e.on_roster ? 'On the roll'
        : e.status === 'won' ? `Joined${e.admitted_uin ? ' · ' + esc(e.admitted_uin) : ''}`
        : e.status === 'lost' ? `Lost${e.lost_reason ? ' — ' + esc(e.lost_reason) : ''}`
        : e.visit_at && new Date(e.visit_at) > new Date() ? 'Visiting ' + dtLocal(e.visit_at)
        : e.follow_up_on ? (e.follow_up_due ? 'Call them back today' : 'Call back ' + longDate(e.follow_up_on))
        : 'No follow-up set';
      return `<div class="snap">
        <div class="snap-pills">
          <span class="chip ${ENQ_STATUS[e.status]?.c || 'c-mute'}">${ENQ_STATUS[e.status]?.l || esc(e.status)}</span>
          ${(e.stages || []).slice(-1).map(x => `<span class="chip c-mute">${esc(x)}</span>`).join('')}
          ${(e.programs || []).map(x => `<span class="chip c-mute">${esc(x)}</span>`).join('')}
          ${e.on_roster ? '<span class="chip c-mute">on roll</span>' : ''}
        </div>
        <div class="snap-next ${overdue ? 'due' : ''}">${next}</div>
        <div class="snap-meta">${e.call_count || 0} call${e.call_count === 1 ? '' : 's'} · ${e.note_count || 0} note${e.note_count === 1 ? '' : 's'} · last worked ${whenAgo(e.updated_at)}${e.updated_by ? ' by ' + esc(e.updated_by) : ''}</div>

        <div class="snap-keen"><span class="cap">How keen</span>
          <input type="range" class="keen-range" id="en-sent" min="0" max="10" value="${keen}"
                 style="--kc:${kcol};--kp:${keen * 10}%;max-width:190px;flex:1">
          <b class="keen-n" id="en-sentn" style="--kc:${kcol}">${keen}</b></div>

        ${e.ai_summary
          ? `<div class="snap-story" id="en-story"><span id="en-storytext">${esc(e.ai_summary)}</span>
               <button class="lnk" id="en-restory" title="Write it again from the latest notes">Rewrite</button></div>`
          : `<div class="snap-story" id="en-story"><button class="lnk" id="en-restory">Summarise this family in one line</button></div>`}

        <div class="snap-bar">
          ${phone ? `<a class="pri" href="tel:${esc(phone)}">Call ${esc((e.father_name || e.mother_name || '').split(' ')[0] || 'them')}</a>` : ''}
          ${phone ? `<a href="${waHref(phone, waText)}" target="_blank" rel="noopener">WhatsApp</a>` : ''}
          <button id="qa-logcall">Log a call</button>
          <button id="qa-visit">Visited</button>
        </div></div>`;
    })()}

    <div class="grp"><h3>Where they are</h3><div class="box">
      ${row('Inquiry status', `<select class="in" id="en-status">${ENQ_STATUSES.map(([k, l]) => `<option value="${k}" ${e.status === k ? 'selected' : ''}>${l}</option>`).join('')}</select>`)}
      ${row('Admission stage', multi('en-stages', e.stages, ENQ_STAGES))}
      ${row('Follow up on', inp('en-follow', e.follow_up_on, '', 'date'))}
      ${row('Handled by', inp('en-by', e.updated_by, who()))}
      ${row('Academic year', `<select class="in" id="en-ay">${[acadYear(), '25-26', '26-27', '27-28'].filter((v, i, a2) => a2.indexOf(v) === i).map(y => `<option ${e.academic_year === y ? 'selected' : ''}>${y}</option>`).join('')}</select>`)}
    </div></div>

    <div class="grp"><h3>Calls &amp; visits</h3><div class="box">
      ${row('Call status', `<select class="in" id="en-callst"><option value=""></option>${ENQ_CALLS.map(c => `<option ${e.call_status === c ? 'selected' : ''}>${c}</option>`).join('')}</select>`, 'Setting this stamps today’s date')}
      ${row('Call date', inp('en-calldate', e.call_date, '', 'date'))}
      ${row('Visit scheduled', inp('en-visit', toInputDT(e.visit_at), '', 'datetime-local'), e.visit_reminder_sent_at ? 'Reminder sent ' + dtLocal(e.visit_reminder_sent_at) : 'The family is reminded the morning before, automatically')}
      ${row('First visit', inp('en-visited', toInputDT(e.first_visit_at), '', 'datetime-local'))}
    </div></div>

    <div class="grp"><h3>Family</h3><div class="box">
      ${row('Father', inp('en-fname', e.father_name, 'name'))}
      ${row('Phone', `<div class="inst">${inp('en-fphone', e.father_phone, '10-digit mobile', 'tel')}${e.father_phone ? `<a class="btn line sm" href="tel:${esc(e.father_phone)}">Call</a><a class="btn line sm" href="${waHref(e.father_phone, waText)}" target="_blank" rel="noopener">WhatsApp</a>` : ''}</div>`)}
      ${row('Email', inp('en-femail', e.father_email, '', 'email'))}
      ${row('Mother', inp('en-mname', e.mother_name, 'name'))}
      ${row('Phone', `<div class="inst">${inp('en-mphone', e.mother_phone, 'optional', 'tel')}${e.mother_phone ? `<a class="btn line sm" href="tel:${esc(e.mother_phone)}">Call</a><a class="btn line sm" href="${waHref(e.mother_phone, waText)}" target="_blank" rel="noopener">WhatsApp</a>` : ''}</div>`)}
      ${row('Email', inp('en-memail', e.mother_email, 'optional', 'email'))}
      ${row('Address', inp('en-addr', e.address, 'area or society'))}
    </div>${e.welcome_email_sent_at ? `<div class="foot">Welcome email sent ${dtLocal(e.welcome_email_sent_at)}.</div>` : ''}</div>

    <div class="grp"><h3>Child</h3><div class="box">
      ${row('Name', inp('en-cname', e.child_name, 'child’s name'))}
      ${row('Programme', multi('en-progs', e.programs, ENQ_PROGRAMS))}
      ${row('Date of birth', inp('en-dob', e.dob, '', 'date'))}
      ${row('Sex', `<div class="seg" id="en-sex"><button data-v="Boy" class="${e.sex === 'Boy' ? 'on' : ''}">Boy</button><button data-v="Girl" class="${e.sex === 'Girl' ? 'on' : ''}">Girl</button></div>`)}
      ${row('Lead source', multi('en-sources', e.sources, ENQ_SOURCES))}
    </div></div>

    <div class="grp"><h3>Notes &amp; timeline</h3><div class="box">
      <div class="note-new">
        <textarea id="en-note" placeholder="What did they say? What did you promise?"></textarea>
        <div class="act"><span class="who" id="en-notewho"></span>
          <button class="btn sm" id="en-addnote" disabled>Add note</button></div>
      </div>
      <div id="en-timeline"></div>
    </div><div class="foot">Every note keeps its author and time.</div></div>`;

  el('drawer-foot').innerHTML = `<div id="pf-msg"></div>
    <div class="more"><button class="btn line" id="en-actbtn">Actions…</button>
      <div class="menu up" id="en-menu">
        <button data-a="log_call">Log a call with them…</button>
        <div class="msep"></div>
        <button data-a="welcome_email">Send welcome email${e.welcome_email_sent_at ? '<span class="sub">again</span>' : ''}</button>
        <button data-a="welcome_wa">Send welcome WhatsApp</button>
        <div class="msep"></div>
        <button data-a="visit_now">Mark visited now</button>
        <button data-a="form_taken">Form taken · fee pending</button>
        <button data-a="won">Mark won</button>
        <button data-a="lost" style="color:var(--red)">Mark lost…</button>
        <div class="msep"></div>
        <button data-a="delete" style="color:var(--red)">Delete this enquiry…</button>
      </div></div>
    <button class="btn" id="en-save">Save</button>`;

  const segOne = i => { const box = el(i); box.querySelectorAll('button').forEach(b2 => b2.onclick = () => { box.querySelectorAll('button').forEach(x => x.classList.remove('on')); b2.classList.add('on'); }); return () => box.querySelector('.on')?.dataset.v ?? null; };
  const segMany = i => { const box = el(i); box.querySelectorAll('.chip').forEach(c => c.onclick = () => c.classList.toggle('on')); return () => [...box.querySelectorAll('.chip.on')].map(c => c.dataset.v); };
  const sex = segOne('en-sex'), progs = segMany('en-progs'), sources = segMany('en-sources'), stages = segMany('en-stages');
  // The photo is behind a route that checks permission and streams the file,
  // because the bucket it lives in has no read policy at all. So it cannot be
  // an <img src> to storage; it is fetched with the session token and handed
  // to the tag as a blob.
  if (e.has_intake_photo) {
    (async () => {
      try {
        const { data: { session: s } } = await getSb().auth.getSession();
        const r = await fetch(`/api/enquiry/photo?id=${id}`, {
          headers: { Authorization: `Bearer ${s.access_token}` },
        });
        if (!r.ok) throw new Error(String(r.status));
        const img = el('en-photo');
        if (!img) return;                       // the drawer was closed meanwhile
        img.src = URL.createObjectURL(await r.blob());
        img.onload = () => URL.revokeObjectURL(img.src);
      } catch (err) {
        const img = el('en-photo');
        // 403 is not a failure, it is the answer: this person is not one of
        // the people allowed to see faces. Saying "could not be loaded" would
        // invite them to retry something that will never work.
        const denied = String(err && err.message) === '403';
        if (img) img.replaceWith(Object.assign(document.createElement('div'), {
          className: 'rowx hint',
          textContent: denied
            ? 'A photo was taken at reception. You do not have access to enquiry photos.'
            : 'The photo could not be loaded.' }));
      }
    })();
  }

  // Red, amber, green as it moves — the number is a judgement, so it should
  // look like one rather than like the browser's default blue for everything.
  const paintKeen = () => {
    const v = Number(el('en-sent').value);
    const c = v >= 7 ? 'var(--green)' : v >= 4 ? 'var(--orange)' : 'var(--red)';
    el('en-sent').style.setProperty('--kc', c);
    el('en-sent').style.setProperty('--kp', v * 10 + '%');
    const n = el('en-sentn'); n.textContent = v; n.style.setProperty('--kc', c);
  };
  el('en-sent').oninput = paintKeen;
  el('en-callst').onchange = () => { if (el('en-callst').value && !el('en-calldate').value) el('en-calldate').value = new Date().toISOString().slice(0, 10); };
  // The box says what it wants, the button stays asleep until there is
  // something to send, and the line underneath says who it will be filed
  // under and when — so nobody types a date into the note itself.
  const ta = el('en-note');
  el('en-notewho').textContent = `Will be saved as ${who() || 'you'} · ${dtLocal(new Date().toISOString())}`;
  ta.oninput = () => {
    ta.style.height = 'auto'; ta.style.height = Math.min(220, Math.max(62, ta.scrollHeight)) + 'px';
    el('en-addnote').disabled = !ta.value.trim();
  };
  // Cmd/Ctrl+Enter sends, because a textarea swallows Enter.
  ta.onkeydown = ev => { if ((ev.metaKey || ev.ctrlKey) && ev.key === 'Enter') el('en-addnote').click(); };

  const drawTimeline = () => {
    const items = [
      ...(notes || []).map(n => ({ at: n.created_at, kind: 'note', summary: n.body, actor: n.author, noteId: n.id })),
      ...(events || []).map(x => ({ at: x.at, kind: x.kind, summary: x.summary, actor: x.actor })),
      ...(calls || []).map(c => ({ at: c.started_at, kind: c.status === 'missed' ? 'missed_call' : c.direction === 'outbound' ? 'call_out' : 'call_in', summary: `${c.status === 'missed' ? 'Missed call' : c.direction === 'outbound' ? 'We called' : 'They called'}${c.agent ? ' · ' + c.agent : ''}${c.duration_s ? ' · ' + c.duration_s + 's' : ''}`, actor: c.agent, rec: c.recording_url })),
    ].sort((a, z) => (z.at || '').localeCompare(a.at || ''));
    el('en-timeline').innerHTML = items.map(x => `<div class="note-item">
        <div class="note-head"><span>${EVENT_ICON[x.kind] || '•'}</span>
          <b>${esc(x.actor || 'system')}</b><span>${dtLocal(x.at)}</span>
          ${x.noteId ? `<a href="#" class="en-delnote" data-id="${x.noteId}" style="margin-left:auto">Remove</a>` : ''}</div>
        <div class="note-body">${esc(x.summary || x.kind)}${x.rec ? ` <a href="${esc(x.rec)}" target="_blank" rel="noopener">▶︎ recording</a>` : ''}</div>
      </div>`).join('') || '<div class="note-item hint">Nothing yet.</div>';
    // Asked for from the "Last worked" column: land on the trail rather
    // than at the top of a long record.
    if (opts.trail) {
      const t = el('en-timeline');
      if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    el('en-timeline').querySelectorAll('.en-delnote').forEach(a => a.onclick = async ev => { ev.preventDefault(); if (!confirm('Remove this note?')) return; await s.from('enquiry_note').delete().eq('id', Number(a.dataset.id)); enqRefresh(); openEnquiry(id); });
  };
  drawTimeline();

  el('en-addnote').onclick = async () => {
    const text = ta.value.trim(); if (!text) return;
    const btn = el('en-addnote'); btn.disabled = true; btn.textContent = 'Saving…';
    // The author and the time are the database's job, not the typist's.
    const { error } = await s.from('enquiry_note').insert({
      enquiry_id: id, body: text, author: who(), created_by: session?.user?.id || null });
    if (error) { btn.disabled = false; btn.textContent = 'Add note'; return alert('Could not save the note: ' + error.message); }
    await s.from('enquiry').update({ updated_by: who(), updated_at: new Date().toISOString() }).eq('id', id);
    ta.value = ''; enqRefresh(); openEnquiry(id);
  };

  const val = i => (el(i).value || '').trim() || null;
  const save = async (extra = {}) => {
    const patch = {
      status: el('en-status').value, sentiment: Number(el('en-sent').value), follow_up_on: val('en-follow'),
      updated_by: val('en-by') || who(), academic_year: el('en-ay').value,
      stages: stages(), sources: sources(), programs: progs(),
      call_status: val('en-callst'), call_date: val('en-calldate'),
      visit_at: val('en-visit') ? new Date(el('en-visit').value).toISOString() : null,
      first_visit_at: val('en-visited') ? new Date(el('en-visited').value).toISOString() : null,
      father_name: val('en-fname'), father_phone: val('en-fphone'), father_email: val('en-femail')?.toLowerCase() || null,
      mother_name: val('en-mname'), mother_phone: val('en-mphone'), mother_email: val('en-memail')?.toLowerCase() || null,
      address: val('en-addr'), child_name: val('en-cname'), dob: val('en-dob'), sex: sex(), ...extra,
    };
    if (!patch.father_phone && !patch.mother_phone) { el('pf-msg').innerHTML = '<div class="err">Keep at least one phone number — it is how the family is recognised.</div>'; return false; }
    if (patch.status === 'won' && !e.won_at) patch.won_at = new Date().toISOString();
    // Compare instants, not strings. The browser builds
    // "2026-10-15T09:30:00.000Z" and PostgREST returns
    // "2026-10-15T09:30:00+00:00" — never equal, even when nothing moved. So
    // every Save cleared the reminder flag, and the cron, which selects on
    // that flag being null, emailed the family about tomorrow's visit again.
    const sameVisit = +new Date(patch.visit_at || 0) === +new Date(e.visit_at || 0);
    if (!sameVisit) patch.visit_reminder_sent_at = null;   // a moved visit gets a fresh reminder
    const { error } = await s.from('enquiry').update(patch).eq('id', id);
    if (error) { el('pf-msg').innerHTML = `<div class="err">${esc(error.message)}</div>`; return false; }
    const evs = [];
    if (patch.status !== e.status) evs.push({ enquiry_id: id, kind: patch.status === 'won' ? 'won' : patch.status === 'lost' ? 'lost' : 'status', summary: `${ENQ_STATUS[e.status]?.l} → ${ENQ_STATUS[patch.status]?.l}${extra.lost_reason ? ' · ' + extra.lost_reason : ''}`, actor: who() });
    if (patch.sentiment !== e.sentiment) evs.push({ enquiry_id: id, kind: 'sentiment', summary: `Sentiment ${e.sentiment ?? '—'} → ${patch.sentiment}`, actor: who() });
    if (patch.visit_at && !sameVisit) evs.push({ enquiry_id: id, kind: 'visit', summary: `Visit booked for ${dtLocal(patch.visit_at)}`, actor: who() });
    if (patch.first_visit_at && !e.first_visit_at) evs.push({ enquiry_id: id, kind: 'visit', summary: 'Visited the school', actor: who(), at: patch.first_visit_at });
    // Sorted, because the chips come back in declaration order and the
    // database holds them in the order they were added. Unsorted, adding a
    // stage from the table made every later Save write a stage event that
    // recorded no change.
    const sameStages = String([...patch.stages].sort()) === String([...(e.stages || [])].sort());
    if (!sameStages) evs.push({ enquiry_id: id, kind: 'stage', summary: `Stage → ${patch.stages.join(', ') || '—'}`, actor: who() });
    if (evs.length) await s.from('enquiry_event').insert(evs);
    enqRefresh(); return true;
  };
  el('en-save').onclick = async () => { if (await save()) { el('pf-msg').innerHTML = '<div class="ok">Saved.</div>'; _afterDrawerClose = () => renderApp(); setTimeout(() => openEnquiry(id), 400); } };

  // The one-line story. Written on demand rather than on every save: it costs
  // a model call, and most opens of a card change nothing worth re-reading.
  // The button is rebound after each run rather than chained to the old one,
  // which would have gone stale the moment the box was rewritten.
  const bindStory = () => {
    const btn = el('en-restory'); if (!btn) return;
    btn.onclick = async () => {
      const box = el('en-story');
      box.innerHTML = '<span class="hint">Reading their history…</span>';
      const j = await enqApi('/api/enquiry/summary', { id });
      box.innerHTML = j.ok
        ? `<span id="en-storytext">${esc(j.summary)}</span> <button class="lnk" id="en-restory" title="Write it again from the latest notes">↻</button>`
        : `<span class="err">${esc(j.error)}</span> <button class="lnk" id="en-restory">Try again</button>`;
      bindStory();
      if (j.ok) enqRefresh();
    };
  };
  bindStory();

  // The two commonest acts, lifted out of the Actions menu onto the card.
  const qaLog = el('qa-logcall');
  if (qaLog) qaLog.onclick = () => openLogCall({ phone: e.father_phone || e.mother_phone || '' });
  const qaVisit = el('qa-visit');
  if (qaVisit) qaVisit.onclick = () => {
    if (!el('en-visited').value) el('en-visited').value = toInputDT(new Date().toISOString());
    if (!stages().includes('1st Premise Visit')) el('en-stages').querySelector('[data-v="1st Premise Visit"]')?.classList.add('on');
    el('en-save').click();
  };

  const menu = el('en-menu');
  el('en-actbtn').onclick = ev => { ev.stopPropagation(); menu.classList.toggle('open'); };
  menu.onclick = ev => ev.stopPropagation();
  if (!window._enMenuBound) { window._enMenuBound = true; document.addEventListener('click', () => el('en-menu')?.classList.remove('open')); }
  menu.querySelectorAll('button[data-a]').forEach(b2 => b2.onclick = async () => {
    menu.classList.remove('open'); const a = b2.dataset.a;
    // Their number is already known, so the sheet opens with it filled in and
    // the card recognised — logging a call about somebody you have open
    // should not mean typing their number back in.
    if (a === 'log_call') openLogCall({ phone: e.father_phone || e.mother_phone || '' });
    if (a === 'welcome_email' || a === 'welcome_wa') {
      if (!(await save())) return;
      const j = await enqApi('/api/enquiry/capture', { action: 'welcome', id, kind: a === 'welcome_email' ? 'email' : 'whatsapp', text: waText });
      if (!j.ok) return el('pf-msg').innerHTML = `<div class="err">${esc(j.error)}</div>`;
      if (j.wa_link) { window.open(j.wa_link, '_blank'); el('pf-msg').innerHTML = '<div class="ok">WhatsApp opened with the message ready — press send there.</div>'; }
      else el('pf-msg').innerHTML = `<div class="ok">${j.email === 'sent' ? 'Welcome email sent.' : j.email ? 'Email: ' + esc(j.email) : ''} ${j.whatsapp === 'sent' ? 'WhatsApp sent.' : ''}</div>`;
      enqRefresh(); setTimeout(() => openEnquiry(id), 900);
    }
    if (a === 'visit_now') { if (!el('en-visited').value) el('en-visited').value = toInputDT(new Date().toISOString());
      if (!stages().includes('1st Premise Visit')) el('en-stages').querySelector('[data-v="1st Premise Visit"]')?.classList.add('on');
      el('en-save').click(); }
    if (a === 'form_taken') { el('en-status').value = 'form_taken'; el('en-save').click(); }
    if (a === 'won') { if (!confirm(`Mark ${enqName(e)} as won?`)) return; el('en-status').value = 'won'; el('en-save').click(); }
    if (a === 'lost') { const why = prompt('Why did we lose them? (fees, distance, joined elsewhere, no response…)', e.lost_reason || ''); if (why === null) return;
      el('en-status').value = 'lost'; if (await save({ lost_reason: why || null })) openEnquiry(id); }
    if (a === 'delete') {
      // Named in the question, because "Are you sure?" on a list of similar
      // rows is how the wrong family gets deleted.
      const label = enqName(e) + (e.phone ? ` · ${e.phone}` : '');
      if (!confirm(`Delete ${label}?\n\nEverything goes: the enquiry, its calls and notes,`
        + `${e.has_intake_photo ? ' and the photo taken at the desk.' : ' and its history.'}`
        + `\n\nThis cannot be undone.`)) return;
      const j = await enqApi('/api/enquiry/delete', { id });
      if (!j.ok) return el('pf-msg').innerHTML = `<div class="err">${esc(j.error)}</div>`;
      closeDrawer(true);
      enqRefresh();
    }
  });
  el('drawer-body').scrollTop = 0;
}

/* ── new enquiry ─────────────────────────────────────────────── */
function openNewEnquiry(preset = {}){
  const body = openDrawer('New Enquiry', 'A call, a walk-in, a message — file it in thirty seconds.');
  const row = (l, ctl, sub = '') => `<div class="row"><div class="l">${l}${sub ? `<span class="sub">${sub}</span>` : ''}</div>${ctl}</div>`;
  body.innerHTML = `
    <div class="grp"><div class="box">
      ${row('How did they reach us', `<div class="seg" id="nq-source">${['Call', 'Walk In', 'WhatsApp', 'Referral', 'Instagram'].map(x => `<button data-v="${x}" class="${(preset.source || 'Call') === x ? 'on' : ''}">${x}</button>`).join('')}</div>`)}
    </div></div>
    <div class="grp"><h3>Parent</h3><div class="box">
      ${row('Mobile', `<input class="in wide" id="nq-phone" type="tel" inputmode="numeric" placeholder="10-digit mobile" value="${esc(preset.phone || '')}">`, 'Type the number first — if we know them, their card opens.')}
      ${row('Name', `<input class="in wide" id="nq-parent" placeholder="parent’s name">`)}
      ${row('Email', `<input class="in wide" id="nq-email" type="email" placeholder="optional">`)}
    </div><div class="foot" id="nq-known"></div></div>
    <div class="grp"><h3>Child</h3><div class="box">
      ${row('Name', `<input class="in wide" id="nq-child" placeholder="child’s name">`)}
      ${row('Programme', `<div class="chips" id="nq-progs">${ENQ_PROGRAMS.map(p => `<span class="chip" data-v="${esc(p)}">${esc(p)}</span>`).join('')}</div>`)}
      ${row('Area', `<input class="in wide" id="nq-addr" placeholder="e.g. Undri, Nyati County">`)}
    </div></div>
    <div class="grp"><h3>What they said</h3><div class="box">
      <div class="rowx"><textarea class="in" id="nq-msg" rows="3" placeholder="Timings, fees, when they want to visit…" style="width:100%"></textarea></div>
      ${row('Follow up on', `<input class="in" id="nq-follow" type="date" value="${new Date(Date.now() + 2 * 864e5).toISOString().slice(0, 10)}">`)}
      <label class="row" style="cursor:pointer"><span class="l">Send the welcome email now<span class="sub">Needs an email address.</span></span><input type="checkbox" class="sw" id="nq-welcome" checked></label>
    </div></div>`;
  el('drawer-foot').innerHTML = `<div id="pf-msg"></div><button class="btn line" id="nq-cancel">Cancel</button><button class="btn" id="nq-save">Save Enquiry</button>`;
  el('nq-cancel').onclick = closeDrawer;
  const box = el('nq-source'); box.querySelectorAll('button').forEach(b2 => b2.onclick = () => { box.querySelectorAll('button').forEach(x => x.classList.remove('on')); b2.classList.add('on'); });
  const pbox = el('nq-progs'); pbox.querySelectorAll('.chip').forEach(c => c.onclick = () => c.classList.toggle('on'));

  el('nq-phone').oninput = debounce(async () => {
    const d = el('nq-phone').value.replace(/\D/g, '').slice(-10);
    if (d.length < 10) return el('nq-known').textContent = '';
    const { data } = await getSb().schema('eurokids').from('v_enquiry').select('id,child_name,father_name,status,phone').eq('phone_key', d).limit(1).maybeSingle();
    el('nq-known').innerHTML = data ? `Known: <strong>${esc(enqName(data))}</strong> · ${ENQ_STATUS[data.status]?.l}. Saving adds this contact to their card. <a href="#" id="nq-open">Open it instead</a>` : '';
    const o = el('nq-open'); if (o) o.onclick = ev => { ev.preventDefault(); openEnquiry(data.id); };
  }, 250);
  setTimeout(() => el('nq-phone').focus(), 250);

  el('nq-save').onclick = async ev => {
    const btn = ev.currentTarget, phone = el('nq-phone').value.trim();
    if (phone.replace(/\D/g, '').length < 10) { el('pf-msg').innerHTML = '<div class="err">A 10-digit mobile number is needed.</div>'; return; }
    btn.disabled = true; btn.textContent = 'Saving…';
    const j = await enqApi('/api/enquiry/capture', { action: 'capture', input: {
      source: box.querySelector('.on')?.dataset.v || 'Call', father_phone: phone, father_name: el('nq-parent').value, father_email: el('nq-email').value,
      child_name: el('nq-child').value, programs: [...pbox.querySelectorAll('.chip.on')].map(c => c.dataset.v),
      address: el('nq-addr').value, message: el('nq-msg').value, sendWelcome: el('nq-welcome').checked, actor: who(),
    } });
    if (!j.ok) { btn.disabled = false; btn.textContent = 'Save Enquiry'; el('pf-msg').innerHTML = `<div class="err">${esc(j.error)}</div>`; return; }
    if (el('nq-follow').value) await getSb().schema('eurokids').from('enquiry').update({ follow_up_on: el('nq-follow').value }).eq('id', j.id);
    if (el('nq-msg').value.trim()) await getSb().schema('eurokids').from('enquiry_note').insert({ enquiry_id: j.id, body: el('nq-msg').value.trim(), author: who(), created_by: session?.user?.id || null });
    enqRefresh(); _afterDrawerClose = () => renderApp(); openEnquiry(j.id);
  };
}

/* ══ the website ══════════════════════════════════════════════
   The cards on the front of eurokidsjmdenclave.org, editable by a person
   rather than by me running SQL. Fourteen cards exist, all published, all
   still showing the placeholder artwork I generated — this is the screen that
   lets the real Canva exports replace them.

   Files do not travel through our own API. A serverless function takes a few
   megabytes and a video of the annual function is two hundred, so the browser
   asks for a signed URL and puts the file straight into the bucket. */

let _site = { cards: [], media: [], settings: [], base: '', site: '' };

async function tabWebsite(){
  const b = el('body');
  b.innerHTML = head('Website', 'The cards on the front of the public site.') + '<div class="loading">Loading…</div>';
  const j = await enqApi('/api/site');
  if (!j.ok) return b.innerHTML = head('Website', '') + fail(j.error);
  _site = j;
  paintWebsite();
}

function paintWebsite(){
  const b = el('body');
  const { cards, media, base, site } = _site;
  const speed = (_site.settings.find(s => s.key === 'marquee_seconds') || {}).value || '55';
  const mediaOf = id => media.filter(m => m.card_id === id);
  const placeholder = c => c.artwork_path && /placeholder/i.test(c.artwork_path);

  const needArt = cards.filter(c => !c.artwork_path).length;
  const needVid = cards.filter(c => !c.video_path && !c.video_url).length;

  b.innerHTML = head('Website', `${cards.length} cards · ${cards.filter(c => c.published).length} live`,
      `<a class="btn line" href="${esc(site)}" target="_blank" rel="noopener">Open the site</a><button class="btn" id="sw-new">New card…</button>`)
    + `<div class="grp" style="margin-top:0"><div class="box">
        <div class="row"><div class="l">How fast the cards travel<span class="sub">Seconds for the row to move its own length. Bigger is slower — 90 drifts, 40 is brisk.</span></div>
          <div class="v" style="gap:10px"><input type="range" id="sw-speed" min="20" max="120" step="5" value="${esc(speed)}" style="max-width:200px"><b class="heatn" id="sw-speedn">${esc(speed)}s</b></div></div>
      </div><div class="foot" id="sw-speedmsg">${needVid ? `${needVid} of ${cards.length} cards have no video yet — their WATCH NOW opens a page with only photos.` : 'Every card has a video.'}</div></div>`
    + (cards.some(placeholder) ? `<div class="grp"><div class="box"><div class="rowx">
        <div class="foot warn" style="margin:0">The artwork on these cards is still the placeholder I generated, not your Canva designs. Open a card and drop the real export in.</div>
      </div></div></div>` : '')
    + `<div class="grp"><h3>Cards</h3><div class="box" id="sw-list">
        ${cards.map((c, i) => {
          const m = mediaOf(c.id);
          return `<div class="row" data-id="${c.id}">
            <div class="l" style="display:flex;gap:12px;align-items:center;min-width:0">
              ${c.artwork_path
                ? `<img src="${esc(base + c.artwork_path)}" alt="" style="width:46px;height:60px;object-fit:cover;border-radius:6px;background:var(--fill);flex:none">`
                : `<div style="width:46px;height:60px;border-radius:6px;background:var(--fill);flex:none"></div>`}
              <div style="min-width:0">
                <div style="font-weight:600">${esc(c.title)}</div>
                <span class="sub">/events/${esc(c.slug)} · ${m.length} photo${m.length === 1 ? '' : 's'}
                  ${c.video_url ? '· video link' : c.video_path ? '· video file' : '· no video'}</span>
              </div>
            </div>
            <div class="v" style="gap:6px">
              <span class="chip ${c.published ? 'c-good' : 'c-mute'}">${c.published ? 'live' : 'hidden'}</span>
              <button class="btn line sm sw-up"   data-i="${i}" ${i === 0 ? 'disabled' : ''} title="Move earlier">↑</button>
              <button class="btn line sm sw-down" data-i="${i}" ${i === cards.length - 1 ? 'disabled' : ''} title="Move later">↓</button>
              <button class="btn line sm sw-edit" data-id="${c.id}">Edit</button>
            </div></div>`;
        }).join('') || '<div class="rowx hint">No cards yet.</div>'}
      </div><div class="foot">The order here is the order they travel in. ${needArt ? `${needArt} card${needArt === 1 ? ' has' : 's have'} no artwork at all.` : ''}</div></div>`;

  el('sw-new').onclick = () => openCard(null);
  b.querySelectorAll('.sw-edit').forEach(x => x.onclick = () => openCard(Number(x.dataset.id)));
  b.querySelectorAll('.sw-up').forEach(x => x.onclick = () => moveCard(Number(x.dataset.i), -1));
  b.querySelectorAll('.sw-down').forEach(x => x.onclick = () => moveCard(Number(x.dataset.i), 1));

  const sp = el('sw-speed');
  sp.oninput = () => { el('sw-speedn').textContent = sp.value + 's'; };
  sp.onchange = async () => {
    const r = await enqApi('/api/site', { action: 'set_setting', key: 'marquee_seconds', value: sp.value });
    el('sw-speedmsg').textContent = r.ok
      ? `Saved. The site picks this up on its next load.`
      : r.error;
  };
}

async function moveCard(i, by){
  const ids = _site.cards.map(c => c.id);
  const j = i + by;
  if (j < 0 || j >= ids.length) return;
  [ids[i], ids[j]] = [ids[j], ids[i]];
  const r = await enqApi('/api/site', { action: 'reorder', ids });
  if (!r.ok) return alert(r.error);
  tabWebsite();
}

/* Uploading. The route issues a signed URL and the file goes straight to
   storage — our own API never carries the bytes. */
async function siteUpload(file, kind, slug, onProgress){
  const j = await enqApi('/api/site', { action: 'upload_url', kind, slug, content_type: file.type });
  if (!j.ok) throw new Error(j.error);
  onProgress && onProgress('Uploading…');
  const { error } = await getSb().storage.from(j.bucket).uploadToSignedUrl(j.path, j.token, file);
  if (error) throw new Error(error.message);
  return j.path;
}

function openCard(id){
  const c = id ? _site.cards.find(x => x.id === id) : null;
  const m = id ? _site.media.filter(x => x.card_id === id) : [];
  const base = _site.base;
  openDrawer(c ? c.title : 'New card', c ? `/events/${c.slug}` : 'It stays hidden until you publish it.');
  const row = (l, ctl, sub) => `<div class="row"><div class="l">${l}${sub ? `<span class="sub">${sub}</span>` : ''}</div><div class="v">${ctl}</div></div>`;

  el('drawer-body').innerHTML = `
    <div class="grp" style="margin-top:0"><h3>The card</h3><div class="box">
      ${row('Title', `<input class="in wide" id="sc-title" value="${esc(c?.title || '')}" placeholder="Sports Day">`)}
      ${row('Address', `<input class="in wide" id="sc-slug" value="${esc(c?.slug || '')}" placeholder="sports-day">`, 'The bit after /events/ in the link. Leave blank and it follows the title.')}
      ${row('Blurb', `<input class="in wide" id="sc-blurb" value="${esc(c?.blurb || '')}" placeholder="One line under the title">`)}
      ${row('Live on the site', `<input type="checkbox" class="sw" id="sc-pub" ${c?.published ? 'checked' : ''}>`, 'Unticked, nobody can reach it even with the link.')}
    </div></div>

    <div class="grp"><h3>The face of the card</h3><div class="box">
      <div class="rowx" id="sc-artbox">
        ${c?.artwork_path
          ? `<img id="sc-artimg" src="${esc(base + c.artwork_path)}" alt="" style="width:160px;border-radius:10px;display:block;background:var(--fill)">`
          : '<div class="hint">Nothing yet.</div>'}
      </div>
      ${row('Replace it', `<input type="file" id="sc-art" accept="image/*">`, 'The Canva export. JPG, PNG or WebP.')}
      <div class="rowx" id="sc-artmsg" style="padding-top:0"></div>
    </div></div>

    <div class="grp"><h3>The video behind WATCH NOW</h3><div class="box">
      ${row('YouTube or Instagram link', `<input class="in wide" id="sc-vurl" value="${esc(c?.video_url || '')}" placeholder="https://youtu.be/…">`, 'Easiest, and the page stays light.')}
      ${row('…or upload a file', `<input type="file" id="sc-vfile" accept="video/mp4,video/webm,video/quicktime">`, c?.video_path ? 'A file is already uploaded. Choosing another replaces it.' : 'mp4, webm or mov, up to 200 MB.')}
      <div class="rowx" id="sc-vmsg" style="padding-top:0">${c?.video_path ? `<span class="chip c-good">file uploaded</span> <button class="lnk" id="sc-vclear">Remove it</button>` : ''}</div>
    </div><div class="foot">A link wins if both are set.</div></div>

    ${id ? `<div class="grp"><h3>Photos on the card’s page</h3><div class="box">
      <div class="rowx" id="sc-gal" style="display:flex;flex-wrap:wrap;gap:8px">
        ${m.map(x => `<div style="position:relative">
          ${x.kind === 'video'
            ? `<video src="${esc(base + x.path)}" style="width:92px;height:92px;object-fit:cover;border-radius:8px;background:#000"></video>`
            : `<img src="${esc(base + x.path)}" alt="" style="width:92px;height:92px;object-fit:cover;border-radius:8px;background:var(--fill)">`}
          <button class="btn line sm sc-delm" data-id="${x.id}" title="Remove"
            style="position:absolute;top:-6px;right:-6px;padding:1px 6px;line-height:1.4">×</button>
        </div>`).join('') || '<div class="hint">No photos yet.</div>'}
      </div>
      ${row('Add photos', `<input type="file" id="sc-gadd" accept="image/*" multiple>`, 'Choose several at once.')}
      <div class="rowx" id="sc-gmsg" style="padding-top:0"></div>
    </div></div>` : '<div class="grp"><div class="box"><div class="rowx hint">Save the card first, then you can add photos to its page.</div></div></div>'}`;

  el('drawer-foot').innerHTML = `<div id="sc-msg"></div>
    ${id ? '<button class="btn line" id="sc-del" style="color:var(--red)">Delete</button>' : ''}
    <button class="btn line" id="sc-cancel">Cancel</button><button class="btn" id="sc-save">Save</button>`;
  el('sc-cancel').onclick = closeDrawer;

  // Files are uploaded the moment they are chosen, so Save is only ever about
  // the words — and a half-finished upload cannot be saved by accident.
  let artPath = c?.artwork_path ?? undefined;
  let vidPath = c?.video_path ?? undefined;
  const slugNow = () => (el('sc-slug').value || el('sc-title').value || 'card');

  el('sc-art').onchange = async ev => {
    const f = ev.target.files[0]; if (!f) return;
    const msg = el('sc-artmsg'); msg.innerHTML = '<span class="hint">Uploading…</span>';
    try {
      artPath = await siteUpload(f, 'artwork', slugNow(), s => msg.innerHTML = `<span class="hint">${s}</span>`);
      el('sc-artbox').innerHTML = `<img src="${URL.createObjectURL(f)}" alt="" style="width:160px;border-radius:10px;display:block">`;
      msg.innerHTML = '<span class="chip c-good">uploaded</span> Press Save to use it.';
    } catch (e) { msg.innerHTML = `<span class="err">${esc(e.message)}</span>`; }
  };

  el('sc-vfile').onchange = async ev => {
    const f = ev.target.files[0]; if (!f) return;
    const msg = el('sc-vmsg'); msg.innerHTML = '<span class="hint">Uploading — a large video takes a while…</span>';
    try {
      vidPath = await siteUpload(f, 'video', slugNow());
      msg.innerHTML = '<span class="chip c-good">uploaded</span> Press Save to use it.';
    } catch (e) { msg.innerHTML = `<span class="err">${esc(e.message)}</span>`; }
  };
  const vclear = el('sc-vclear');
  if (vclear) vclear.onclick = () => { vidPath = null; el('sc-vmsg').innerHTML = '<span class="hint">Will be removed when you save.</span>'; };

  const gadd = el('sc-gadd');
  if (gadd) gadd.onchange = async ev => {
    const files = [...ev.target.files]; if (!files.length) return;
    const msg = el('sc-gmsg');
    for (let i = 0; i < files.length; i++) {
      msg.innerHTML = `<span class="hint">Uploading ${i + 1} of ${files.length}…</span>`;
      try {
        const kind = files[i].type.startsWith('video') ? 'video' : 'gallery';
        const path = await siteUpload(files[i], kind, slugNow());
        const r = await enqApi('/api/site', { action: 'add_media', card_id: id, path, kind: kind === 'video' ? 'video' : 'image' });
        if (!r.ok) throw new Error(r.error);
      } catch (e) { msg.innerHTML = `<span class="err">${esc(e.message)}</span>`; return; }
    }
    msg.innerHTML = '<span class="chip c-good">added</span>';
    const j = await enqApi('/api/site'); if (j.ok) { _site = j; openCard(id); }
  };

  el('drawer-body').querySelectorAll('.sc-delm').forEach(x => x.onclick = async () => {
    if (!confirm('Remove this photo from the page? The file is deleted too.')) return;
    const r = await enqApi('/api/site', { action: 'delete_media', id: Number(x.dataset.id) });
    if (!r.ok) return alert(r.error);
    const j = await enqApi('/api/site'); if (j.ok) { _site = j; openCard(id); }
  });

  const del = el('sc-del');
  if (del) del.onclick = async () => {
    if (!confirm(`Delete “${c.title}”?\n\nThe card, its photos and its video are all removed, and the page at /events/${c.slug} stops existing. This cannot be undone.`)) return;
    const r = await enqApi('/api/site', { action: 'delete_card', id });
    if (!r.ok) return alert(r.error);
    closeDrawer(true); tabWebsite();
  };

  el('sc-save').onclick = async ev => {
    const btn = ev.currentTarget;
    if (!el('sc-title').value.trim()) return el('sc-msg').innerHTML = '<div class="err">A card needs a title.</div>';
    btn.disabled = true; btn.textContent = 'Saving…';
    const r = await enqApi('/api/site', {
      action: 'save_card', id,
      title: el('sc-title').value, slug: el('sc-slug').value, blurb: el('sc-blurb').value,
      published: el('sc-pub').checked, video_url: el('sc-vurl').value,
      sort: c?.sort ?? (_site.cards.length + 1),
      ...(artPath !== undefined ? { artwork_path: artPath } : {}),
      ...(vidPath !== undefined ? { video_path: vidPath } : {}),
    });
    if (!r.ok) { btn.disabled = false; btn.textContent = 'Save'; return el('sc-msg').innerHTML = `<div class="err">${esc(r.error)}</div>`; }
    // Whether the website actually picked it up. Saving to the database and
    // appearing on the site are two different things, and the gap between
    // them is what made this look broken.
    if (r.site && !r.site.ok) {
      el('sc-msg').innerHTML = `<div class="err">Saved, but the website was not refreshed (${esc(r.site.why || 'unknown')}). It will catch up within a minute.</div>`;
      btn.disabled = false; btn.textContent = 'Save';
      setTimeout(() => { closeDrawer(true); tabWebsite(); }, 2600);
      return;
    }
    closeDrawer(true); tabWebsite();
  };
}

/* ══ reports ══════════════════════════════════════════════════
   Only the enquiry half, on purpose.

   The fee tables hold 418 instalments and paid_on is set on none of them,
   because parents pay through EPMS and nothing is written back. Drawn from
   that, the hub would report about ₹1.24 crore overdue out of ₹1.28 crore —
   wrong by roughly a crore. A wrong figure on a page that looks official is
   worse than a blank space, so the space is here and labelled. */

async function tabEnqReports(){
  const b = el('body');
  b.innerHTML = head('Reports', 'What the enquiry book can honestly say.') + '<div class="loading">Counting…</div>';
  const j = await enqApi('/api/reports/enquiries');
  if (!j.ok) return b.innerHTML = head('Reports', '') + fail(j.error);

  const pc = (n, of_) => of_ ? Math.round(100 * n / of_) + '%' : '—';
  const bar = (n, max) => `<span style="display:inline-block;height:6px;border-radius:3px;background:var(--accent);width:${max ? Math.max(2, Math.round(60 * n / max)) : 0}px;vertical-align:middle"></span>`;
  const maxMonth = Math.max(1, ...j.months.map(r => r.enquiries));
  const maxSrc = Math.max(1, ...j.sources.map(r => r.enquiries));

  b.innerHTML = head('Reports', `${j.total} enquiries on record`)
    + `<div class="stats">
        <div class="stat"><div class="k">Enquiries</div><div class="v">${j.total}</div><div class="m">all time</div></div>
        <div class="stat"><div class="k">Visited the school</div><div class="v">${j.visited}</div><div class="m">${pc(j.visited, j.total)} of them</div></div>
        <div class="stat"><div class="k">Still open</div><div class="v">${j.open}</div><div class="m">in progress or form taken</div></div>
        <div class="stat ${j.median_days_to_first_note == null ? '' : j.median_days_to_first_note <= 1 ? 'good' : j.median_days_to_first_note <= 3 ? '' : 'warn'}">
          <div class="k">First spoken to</div><div class="v">${j.median_days_to_first_note == null ? '—' : j.median_days_to_first_note + 'd'}</div>
          <div class="m">median, after they enquired</div></div>
      </div>`

    + ((j.caveats.never_won || j.caveats.never_lost) ? `<div class="grp"><div class="box"><div class="rowx">
        <div class="foot warn" style="margin:0"><strong>Conversion cannot be measured.</strong>
        ${j.caveats.never_won ? 'Not one enquiry has ever been marked <em>won</em>' : ''}${j.caveats.never_won && j.caveats.never_lost ? ' and none marked <em>lost</em>' : ''}, yet there are children on the roll who started as enquiries here. Until somebody closes an enquiry when a family joins or walks away, these columns stay empty and nobody can say which source is worth the money.</div>
      </div></div></div>` : '')

    + '<div id="adm-box"></div>'
    + `<div class="grp"><h3>Month by month</h3><div class="panel"><div class="tw"><table>
        <thead><tr><th>Month</th><th>Enquiries</th><th>Visited</th><th>Visit rate</th><th>Form taken</th><th>Won</th><th>Lost</th><th>Still open</th><th>Avg keenness</th></tr></thead>
        <tbody>${j.months.map(r => `<tr>
          <td style="font-weight:600">${esc(r.month)}</td>
          <td>${bar(r.enquiries, maxMonth)} <b style="margin-left:6px">${r.enquiries}</b></td>
          <td>${r.visited}</td><td class="hint">${pc(r.visited, r.enquiries)}</td>
          <td>${r.form_taken || '—'}</td><td>${r.won || '—'}</td><td>${r.lost || '—'}</td><td>${r.open || '—'}</td>
          <td class="hint">${r.keen ?? '—'}</td></tr>`).join('')}</tbody></table></div></div></div>`

    + `<div class="grp"><h3>Where they come from</h3><div class="panel"><div class="tw"><table>
        <thead><tr><th>Source</th><th>Enquiries</th><th>Visited</th><th>Visit rate</th><th>Won</th><th>Avg keenness</th></tr></thead>
        <tbody>${j.sources.map(r => `<tr>
          <td style="font-weight:600">${esc(r.source)}</td>
          <td>${bar(r.enquiries, maxSrc)} <b style="margin-left:6px">${r.enquiries}</b></td>
          <td>${r.visited}</td><td class="hint">${pc(r.visited, r.enquiries)}</td>
          <td>${r.won || '—'}</td><td class="hint">${r.keen ?? '—'}</td></tr>`).join('')}</tbody></table></div></div>
      <div class="foot">A family who rang and then walked in counts under both, so these add up to more than ${j.total}.</div></div>`

    + `<div class="grp"><h3>What they ask for</h3><div class="box">
        ${j.programmes.map(p => `<div class="row"><div class="l">${esc(p.programme)}</div><div class="v"><b>${p.enquiries}</b></div></div>`).join('')}
      </div></div>`

    + `<div class="grp"><h3>Who is doing the work</h3><div class="panel"><div class="tw"><table>
        <thead><tr><th>Who</th><th>Notes written</th><th>Families touched</th><th>Calls logged</th><th>First</th><th>Last</th></tr></thead>
        <tbody>${j.staff.map(r => `<tr>
          <td style="font-weight:600">${esc(r.who)}</td><td><b>${r.notes}</b></td><td>${r.enquiries}</td>
          <td>${r.calls || '—'}</td><td class="hint">${esc(r.first)}</td><td class="hint">${esc(r.last)}</td></tr>`).join('')
          || '<tr><td colspan="6" class="hint">Nobody has written a note yet.</td></tr>'}</tbody></table></div></div>
      <div class="foot">Counted from notes and calls, which are the things people actually record. Conversions per person are not here because no enquiry is ever marked won.${j.untouched ? ` <strong>${j.untouched}</strong> enquir${j.untouched === 1 ? 'y has' : 'ies have'} no note from anyone.` : ''}</div></div>`

    + (() => {
      // Money, from EPMS — which is what EuroKids itself bills and banks. The
      // hub's own payment_plan has never been marked paid and is ignored.
      const m = j.money; if (!m) return '';
      const rate = m.invoiced ? Math.round(100 * m.collected / m.invoiced) : 0;
      const maxP = Math.max(1, ...m.by_programme.map(x => x.invoiced));
      const maxM = Math.max(1, ...m.collected_by_month.map(x => x.amount));
      return `<div class="grp"><h3>Fees</h3>
        <div class="stats">
          <div class="stat"><div class="k">Invoiced</div><div class="v">${inr(m.invoiced)}</div><div class="m">${m.children} children</div></div>
          <div class="stat good"><div class="k">Collected</div><div class="v">${inr(m.collected)}</div><div class="m">${rate}% of what was raised</div></div>
          <div class="stat ${m.due > 0 ? 'warn' : ''}"><div class="k">Still due</div><div class="v">${inr(m.due)}</div><div class="m">${m.families_owing} famil${m.families_owing === 1 ? 'y' : 'ies'}</div></div>
        </div>
        <div class="panel"><div class="tw"><table>
          <thead><tr><th>Programme</th><th>Children</th><th>Invoiced</th><th>Collected</th><th>Still due</th><th>Collected</th></tr></thead>
          <tbody>${m.by_programme.map(x => `<tr>
            <td style="font-weight:600">${esc(x.programme)}</td><td>${x.children}</td>
            <td>${inr(x.invoiced)}</td><td>${inr(x.collected)}</td>
            <td style="${x.due > 0 ? 'color:var(--orange);font-weight:600' : ''}">${x.due ? inr(x.due) : '—'}</td>
            <td>${bar(x.invoiced, maxP)} <span class="hint" style="margin-left:6px">${x.invoiced ? Math.round(100 * x.collected / x.invoiced) : 0}%</span></td>
          </tr>`).join('')}</tbody></table></div></div>
        <div class="foot">${m.as_of ? 'As EPMS had it on ' + dtLocal(m.as_of) + '.' : ''} ${esc(j.caveats.plan_unmaintained || '')}</div></div>

      ${m.collected_by_month.length ? `<div class="grp"><h3>Money arriving</h3><div class="box">
        ${m.collected_by_month.map(x => `<div class="row"><div class="l">${esc(x.month)}</div>
          <div class="v" style="gap:10px">${bar(x.amount, maxM)} <b>${inr(x.amount)}</b></div></div>`).join('')}
      </div><div class="foot">Payments the morning sync noticed arriving, by the month it saw them.</div></div>` : ''}

      ${m.top_owing.length ? `<div class="grp"><h3>Who still owes</h3><div class="panel"><div class="tw"><table>
        <thead><tr><th>Child</th><th>Programme</th><th>Invoiced</th><th>Paid</th><th>Still due</th></tr></thead>
        <tbody>${m.top_owing.map(x => `<tr>
          <td style="font-weight:600">${esc(x.name || x.uin)}</td><td class="hint">${esc(x.programme || '')}</td>
          <td class="hint">${inr(x.invoiced)}</td><td class="hint">${inr(x.collected)}</td>
          <td><b>${inr(x.due)}</b></td></tr>`).join('')}</tbody></table></div></div>
        <div class="foot">The fifteen largest. ${m.families_owing} famil${m.families_owing === 1 ? 'y owes' : 'ies owe'} something.</div></div>` : ''}`;
    })();
  renderAdmitted();
}

/* Enquiries whose child now appears on the EuroKids roll.
   The daily sync closes the confident ones on its own; this is for the few it
   will not touch, and for seeing what it did. */
async function renderAdmitted(){
  const box = el('adm-box'); if (!box) return;
  const j = await enqApi('/api/enquiry/admitted');
  if (!j.ok) return box.innerHTML = '';
  if (!j.confident.length && !j.unsure.length) {
    return box.innerHTML = `<div class="grp"><div class="box"><div class="rowx hint">Every open enquiry has been checked against the ${j.roll} children on the EuroKids roll. None of them have joined yet.</div></div></div>`;
  }
  box.innerHTML = `<div class="grp"><h3>Now on the roll (${j.confident.length + j.unsure.length})</h3><div class="box">
      ${j.confident.length ? `<div class="rowx hint">${j.confident.length} will be closed as won by the next morning sync. <button class="lnk" id="adm-now">Do it now</button></div>` : ''}
      ${j.unsure.map(m => `<div class="row"><div class="l">${esc(m.child)}<span class="sub">${esc(m.why)}</span></div>
        <div class="v" style="gap:6px">
          <button class="btn line sm" onclick="openEnquiry(${m.enquiry_id})">Open</button>
          <button class="btn line sm adm-yes" data-id="${m.enquiry_id}" data-uin="${esc(m.uin)}">Yes, they joined</button>
        </div></div>`).join('')}
    </div><div class="foot">Matched on the child's and father's names — EPMS gives us no phone numbers, so a name is all there is.</div></div>`;

  const now = el('adm-now');
  if (now) now.onclick = async () => {
    now.disabled = true; now.textContent = 'Closing…';
    const r = await enqApi('/api/enquiry/admitted', { all: true });
    if (!r.ok) { now.disabled = false; return alert(r.error); }
    enqRefresh(); tabEnqReports();
  };
  box.querySelectorAll('.adm-yes').forEach(b2 => b2.onclick = async () => {
    const r = await enqApi('/api/enquiry/admitted', { id: Number(b2.dataset.id), uin: b2.dataset.uin });
    if (!r.ok) return alert(r.error);
    enqRefresh(); tabEnqReports();
  });
}
