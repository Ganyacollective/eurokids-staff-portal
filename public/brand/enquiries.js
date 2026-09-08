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

const ENQ_STATUSES = [
  ['in_progress', 'In progress',             'c-acc'],
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
const enqRefresh = () => invalidate('enq');
const who = () => (profile?.full_name || session?.user?.email || '').split('@')[0];

// Save one field and leave a trail, so "who changed this, and when" is answerable.
async function enqPatch(id, patch, note){
  const { error } = await getSb().schema('eurokids').from('enquiry')
    .update({ ...patch, updated_by: who() }).eq('id', id);
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
      ${list('Follow-ups due', due, 'Nothing due today.', item)}
      ${list('Visits today', visits, 'No visits booked for today.', item)}
      ${list('Nobody has spoken to them yet', fresh, 'Every enquiry has been contacted.', item)}
      ${(calls || []).length ? list('Calls today', calls, '', c => `<button class="linkrow enq-row" data-id="${c.enquiry_id || ''}" style="display:flex;justify-content:space-between;gap:12px;color:var(--label)">
          <span><strong>${esc(c.caller || '')}</strong><span class="hint" style="margin-left:8px">${dtLocal(c.started_at)}${c.agent ? ' · ' + esc(c.agent) : ''}</span></span>
          <span class="chip ${c.status === 'missed' ? 'c-crit' : 'c-good'}">${esc(c.status || '')}</span></button>`) : ''}`;
  el('enq-new').onclick = () => openNewEnquiry();
  b.querySelectorAll('.enq-row').forEach(x => x.onclick = () => x.dataset.id && openEnquiry(Number(x.dataset.id)));
  if (window._openNewEnquiry) { window._openNewEnquiry = false; openNewEnquiry(); }
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
      <div class="panel"><div class="tw"><table id="eq-table"><thead><tr>
        <th>Child</th><th>Sentiment</th><th>Program</th><th>Status</th><th>Stage</th><th>Source</th>
        <th>Father</th><th>Phone</th><th>Visit</th><th>Call</th><th>Follow-up</th><th>Notes</th><th>Last worked</th></tr></thead>
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
  el('eq-rows').innerHTML = list.map(r => `<tr data-id="${r.id}" class="${r.follow_up_due ? 't-warn' : r.status === 'won' ? 't-good' : r.status === 'lost' ? 't-crit' : ''}">
      <td class="eq-open" style="cursor:pointer"><strong>${esc(enqName(r))}</strong>${r.on_roster ? ' <span class="chip c-good">on roll</span>' : ''}<div class="hint">${esc(r.academic_year)} · ${whenAgo(r.created_at)}</div></td>
      <td style="min-width:120px"><input type="range" class="eq-heat" min="0" max="10" value="${r.sentiment ?? 5}" style="width:80px;height:24px;vertical-align:middle" title="${r.sentiment ?? '—'} / 10"><b class="heatn">${r.sentiment ?? '—'}</b></td>
      <td>${chipList(r.programs, 'c-acc')}</td>
      <td>${sel('status', r.status, ENQ_STATUSES.map(s => s[0]), v => ENQ_STATUS[v]?.l || v)}</td>
      <td style="white-space:normal;max-width:220px">${chipList(r.stages)}</td>
      <td>${chipList(r.sources)}</td>
      <td class="hint">${esc(r.father_name || r.mother_name || '—')}</td>
      <td>${r.phone ? `<a href="tel:${esc(r.phone)}">${esc(r.phone)}</a>` : '<span class="hint">—</span>'}</td>
      <td><input type="datetime-local" class="in eq-edit" data-f="visit_at" value="${toInputDT(r.visit_at)}" style="width:172px"></td>
      <td>${sel('call_status', r.call_status, ENQ_CALLS)}<div class="hint">${r.call_date ? longDate(r.call_date) : ''}</div></td>
      <td><input type="date" class="in eq-edit" data-f="follow_up_on" value="${r.follow_up_on || ''}" style="width:140px"></td>
      <td class="eq-open" style="cursor:pointer;white-space:normal;max-width:260px">${r.latest_note ? `${esc(String(r.latest_note).slice(0, 90))}<div class="hint">${esc(r.latest_note_by || '')} · ${r.note_count} note${r.note_count === 1 ? '' : 's'}</div>` : '<span class="hint">add a note ›</span>'}</td>
      <td class="hint">${whenAgo(r.updated_at)}<div class="hint">${esc(r.updated_by || '')}</div></td>
    </tr>`).join('') || `<tr><td colspan="13"><div class="empty"><div class="ic">📭</div><h3>Nothing matches</h3><div>Change the filter, or reset it to this academic year.</div></div></td></tr>`;

  el('eq-rows').querySelectorAll('.eq-open').forEach(td => td.onclick = () => openEnquiry(Number(td.closest('tr').dataset.id)));
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
  el('eq-rows').querySelectorAll('.eq-heat').forEach(x => {
    x.oninput = () => { x.nextElementSibling.textContent = x.value; };
    x.onchange = async () => { const id = Number(x.closest('tr').dataset.id);
      await enqPatch(id, { sentiment: Number(x.value) }, { kind: 'sentiment', summary: `Sentiment → ${x.value}/10` });
      const row = _eq.rows.find(z => z.id === id); if (row) row.sentiment = Number(x.value); };
  });
}

// The filter panel: one card per condition, add as many as you like.
function openEnqFilter(){
  const dr = el('drawer'); const body = openDrawer('Filter', ''); dr.classList.add('narrow');
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
        <td class="hint">${esc(c.agent || '—')}</td><td class="hint">${c.duration_s ? Math.floor(c.duration_s / 60) + 'm ' + (c.duration_s % 60) + 's' : '—'}</td>
        <td><span class="chip ${c.status === 'missed' ? 'c-crit' : c.status === 'answered' ? 'c-good' : 'c-mute'}">${esc(c.status || '')}</span></td>
        <td>${c.recording_url ? `<a href="${esc(c.recording_url)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">▶︎ Play</a>` : '<span class="hint">—</span>'}</td></tr>`; }).join('')}
      </tbody></table></div></div>`
    : `<div class="panel"><div class="empty"><div class="ic">📞</div><h3>No calls yet</h3><div>Point the IVR at the webhook shown in Setup and every call lands here, matched to the family.</div></div></div>`);
  el('enq-logcall').onclick = () => openNewEnquiry({ source: 'Call' });
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
      <div class="row"><div class="l">Walk-in alert<span class="sub">The office is emailed the moment a family submits; set <code>ENQUIRY_NOTIFY_EMAIL</code> to change who.</span></div><div class="v">${ok(j.email_configured)}</div></div>
      <div class="row"><div class="l">Visit reminder<span class="sub">The morning before a booked visit, automatically.</span></div><div class="v">${ok(j.email_configured)}</div></div>
      <div class="row"><div class="l">WhatsApp<span class="sub">${j.whatsapp_configured ? `Template “${esc(j.whatsapp_template)}” sends itself.` : 'Not connected — every enquiry has a one-tap WhatsApp button instead.'}</span></div><div class="v">${j.whatsapp_configured ? ok(true) : '<span class="chip c-mute">manual</span>'}</div></div>
    </div></div>
  </div>`;
}

/* ── the enquiry sheet ───────────────────────────────────────── */
async function openEnquiry(id){
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
    <div class="hero ${e.status === 'won' ? 'paid' : e.status === 'lost' ? 'due' : ''}"><div class="k">${ENQ_STATUS[e.status]?.l || e.status}</div>
      <div class="v" style="font-size:26px">${e.on_roster ? 'On the roll 🎉' : e.follow_up_on ? (e.follow_up_due ? 'Follow up today' : 'Follow up ' + longDate(e.follow_up_on)) : 'No follow-up set'}</div>
      <div class="m">${e.call_count || 0} call${e.call_count === 1 ? '' : 's'} · ${e.note_count || 0} note${e.note_count === 1 ? '' : 's'} · last worked ${whenAgo(e.updated_at)}${e.updated_by ? ' by ' + esc(e.updated_by) : ''}</div></div>

    <div class="grp"><h3>Where they are</h3><div class="box">
      ${row('Inquiry status', `<select class="in" id="en-status">${ENQ_STATUSES.map(([k, l]) => `<option value="${k}" ${e.status === k ? 'selected' : ''}>${l}</option>`).join('')}</select>`)}
      ${row('Admission stage', multi('en-stages', e.stages, ENQ_STAGES))}
      ${row('How keen', `<div style="display:flex;align-items:center;gap:10px;flex:1;justify-content:flex-end"><input type="range" id="en-sent" min="0" max="10" value="${e.sentiment ?? 5}" style="max-width:200px"><b class="heatn" id="en-sentn">${e.sentiment ?? 5}</b></div>`, '0 cold · 10 to be won at any cost')}
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
      <div class="note-in"><textarea class="in" id="en-note" rows="1" placeholder="Add a note — what they said, what you promised"></textarea><button class="btn sm" id="en-addnote">Add</button></div>
      <div id="en-timeline"></div>
    </div><div class="foot">Every note keeps its author and time.</div></div>`;

  el('drawer-foot').innerHTML = `<div id="pf-msg"></div>
    <div class="more"><button class="btn line" id="en-actbtn">Actions…</button>
      <div class="menu up" id="en-menu">
        <button data-a="welcome_email">Send welcome email${e.welcome_email_sent_at ? '<span class="sub">again</span>' : ''}</button>
        <button data-a="welcome_wa">Send welcome WhatsApp</button>
        <div class="msep"></div>
        <button data-a="visit_now">Mark visited now</button>
        <button data-a="form_taken">Form taken · fee pending</button>
        <button data-a="won">Mark won</button>
        <button data-a="lost" style="color:var(--red)">Mark lost…</button>
      </div></div>
    <button class="btn" id="en-save">Save</button>`;

  const segOne = i => { const box = el(i); box.querySelectorAll('button').forEach(b2 => b2.onclick = () => { box.querySelectorAll('button').forEach(x => x.classList.remove('on')); b2.classList.add('on'); }); return () => box.querySelector('.on')?.dataset.v ?? null; };
  const segMany = i => { const box = el(i); box.querySelectorAll('.chip').forEach(c => c.onclick = () => c.classList.toggle('on')); return () => [...box.querySelectorAll('.chip.on')].map(c => c.dataset.v); };
  const sex = segOne('en-sex'), progs = segMany('en-progs'), sources = segMany('en-sources'), stages = segMany('en-stages');
  el('en-sent').oninput = () => { el('en-sentn').textContent = el('en-sent').value; };
  el('en-callst').onchange = () => { if (el('en-callst').value && !el('en-calldate').value) el('en-calldate').value = new Date().toISOString().slice(0, 10); };
  const ta = el('en-note'); ta.oninput = () => { ta.style.height = 'auto'; ta.style.height = Math.min(160, ta.scrollHeight) + 'px'; };

  const drawTimeline = () => {
    const items = [
      ...(notes || []).map(n => ({ at: n.created_at, kind: 'note', summary: n.body, actor: n.author, noteId: n.id })),
      ...(events || []).map(x => ({ at: x.at, kind: x.kind, summary: x.summary, actor: x.actor })),
      ...(calls || []).map(c => ({ at: c.started_at, kind: c.status === 'missed' ? 'missed_call' : c.direction === 'outbound' ? 'call_out' : 'call_in', summary: `${c.status === 'missed' ? 'Missed call' : c.direction === 'outbound' ? 'We called' : 'They called'}${c.agent ? ' · ' + c.agent : ''}${c.duration_s ? ' · ' + c.duration_s + 's' : ''}`, actor: c.agent, rec: c.recording_url })),
    ].sort((a, z) => (z.at || '').localeCompare(a.at || ''));
    el('en-timeline').innerHTML = items.map(x => `<div class="note"><span style="margin-right:6px">${EVENT_ICON[x.kind] || '•'}</span>${esc(x.summary || x.kind)}${x.rec ? ` <a href="${esc(x.rec)}" target="_blank" rel="noopener">▶︎ recording</a>` : ''}
        <div class="who"><span>${esc(x.actor || '')} · ${dtLocal(x.at)}</span>${x.noteId ? `<a href="#" class="en-delnote" data-id="${x.noteId}">Remove</a>` : ''}</div></div>`).join('') || '<div class="note hint">Nothing yet.</div>';
    el('en-timeline').querySelectorAll('.en-delnote').forEach(a => a.onclick = async ev => { ev.preventDefault(); if (!confirm('Remove this note?')) return; await s.from('enquiry_note').delete().eq('id', Number(a.dataset.id)); enqRefresh(); openEnquiry(id); });
  };
  drawTimeline();

  el('en-addnote').onclick = async () => {
    const text = ta.value.trim(); if (!text) return;
    const { error } = await s.from('enquiry_note').insert({ enquiry_id: id, body: text, author: who(), created_by: session?.user?.id || null });
    if (error) return alert('Could not save the note: ' + error.message);
    await s.from('enquiry').update({ updated_by: who() }).eq('id', id);
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
    if (patch.visit_at !== e.visit_at) patch.visit_reminder_sent_at = null;   // a moved visit gets a fresh reminder
    const { error } = await s.from('enquiry').update(patch).eq('id', id);
    if (error) { el('pf-msg').innerHTML = `<div class="err">${esc(error.message)}</div>`; return false; }
    const evs = [];
    if (patch.status !== e.status) evs.push({ enquiry_id: id, kind: patch.status === 'won' ? 'won' : patch.status === 'lost' ? 'lost' : 'status', summary: `${ENQ_STATUS[e.status]?.l} → ${ENQ_STATUS[patch.status]?.l}${extra.lost_reason ? ' · ' + extra.lost_reason : ''}`, actor: who() });
    if (patch.sentiment !== e.sentiment) evs.push({ enquiry_id: id, kind: 'sentiment', summary: `Sentiment ${e.sentiment ?? '—'} → ${patch.sentiment}`, actor: who() });
    if (patch.visit_at && patch.visit_at !== e.visit_at) evs.push({ enquiry_id: id, kind: 'visit', summary: `Visit booked for ${dtLocal(patch.visit_at)}`, actor: who() });
    if (patch.first_visit_at && !e.first_visit_at) evs.push({ enquiry_id: id, kind: 'visit', summary: 'Visited the school', actor: who(), at: patch.first_visit_at });
    if (String(patch.stages) !== String(e.stages)) evs.push({ enquiry_id: id, kind: 'stage', summary: `Stage → ${patch.stages.join(', ') || '—'}`, actor: who() });
    if (evs.length) await s.from('enquiry_event').insert(evs);
    enqRefresh(); return true;
  };
  el('en-save').onclick = async () => { if (await save()) { el('pf-msg').innerHTML = '<div class="ok">Saved.</div>'; _afterDrawerClose = () => renderApp(); setTimeout(() => openEnquiry(id), 400); } };

  const menu = el('en-menu');
  el('en-actbtn').onclick = ev => { ev.stopPropagation(); menu.classList.toggle('open'); };
  menu.onclick = ev => ev.stopPropagation();
  if (!window._enMenuBound) { window._enMenuBound = true; document.addEventListener('click', () => el('en-menu')?.classList.remove('open')); }
  menu.querySelectorAll('button[data-a]').forEach(b2 => b2.onclick = async () => {
    menu.classList.remove('open'); const a = b2.dataset.a;
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
