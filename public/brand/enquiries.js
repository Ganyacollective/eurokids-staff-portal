/* ============================================================
   Enquiries & Admissions — the front of the funnel.
   Loaded after hub.html's script and shares its globals (el, esc, getSb,
   openDrawer, head, money, has, session, profile, debounce, cached…).

   One enquiry per family, keyed on phone. Everything that happens to it —
   the call, the form, the visit, the WhatsApp, the note — is an event on a
   timeline. "Today" is the worklist; "Enquiries" is the whole book;
   "Calls" is what the IVR reported; "Setup" is the plumbing.
   ============================================================ */

const ENQ_STAGES = [
  ['new',             'New',            'c-acc'],
  ['contacted',       'Contacted',      'c-mute'],
  ['visit_scheduled', 'Visit booked',   'c-warn'],
  ['visited',         'Visited',        'c-warn'],
  ['follow_up',       'Following up',   'c-mute'],
  ['admitted',        'Admitted',       'c-good'],
  ['lost',            'Lost',           'c-crit'],
];
const ENQ_STAGE = Object.fromEntries(ENQ_STAGES.map(([k, l, c]) => [k, { l, c }]));
const ENQ_SOURCES = { call: 'Call', walk_in: 'Walk-in', website: 'Website', instagram: 'Instagram', referral: 'Referral', just_dial: 'Just Dial', whatsapp: 'WhatsApp', other: 'Other' };
const ENQ_HEAT = ['Cold', 'Cool', 'Warm', 'Hot', 'Must win'];
const ENQ_PROGRAMS = ['Play Group', 'Nursery', 'Euro Junior', 'Euro Senior', 'Day Care', 'Summer Fun', 'Not sure'];
const EVENT_ICON = { call_in: '📞', call_out: '📲', missed_call: '📵', walk_in: '🚶', website: '🌐', form: '📝', visit: '🏫', stage: '➡️', heat: '🔥', note: '🗒', email: '✉️', whatsapp: '💬', sms: '💬', admitted: '🎉', lost: '⏹', created: '✨', edit: '✏️' };

const enqName = e => e.child_name || (e.father_name ? `${e.father_name}’s child` : null) || (e.phone ? `Unknown · ${e.phone}` : 'Unknown caller');
const heatDots = h => `<span class="heat" title="${ENQ_HEAT[h] || ''}">${[0,1,2,3].map(i => `<i class="${i < Number(h) ? 'on' : ''}"></i>`).join('')}</span>`;
const stageChip = s => `<span class="chip ${ENQ_STAGE[s]?.c || 'c-mute'}">${ENQ_STAGE[s]?.l || s}</span>`;
const whenAgo = iso => {
  if (!iso) return '—';
  const d = (Date.now() - new Date(iso).getTime()) / 864e5;
  if (d < 1) return 'today'; if (d < 2) return 'yesterday'; if (d < 30) return `${Math.floor(d)} d ago`;
  return longDate(iso.slice(0, 10));
};
const dtLocal = iso => iso ? new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
const toInputDT = iso => iso ? new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '';
const waHref = (phone, text) => `https://wa.me/${String(phone || '').replace(/\D/g, '').replace(/^(\d{10})$/, '91$1')}?text=${encodeURIComponent(text || '')}`;

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
const enqRefresh = () => { invalidate('enq'); };
const who = () => (profile?.full_name || session?.user?.email || '').split('@')[0];

/* ── Today: the worklist ─────────────────────────────────────── */
async function tabEnqToday(){
  const b = el('body');
  b.innerHTML = head('Today', 'Who to call, who is coming in, and what just arrived.', `<button class="btn" id="enq-new">New Enquiry…</button>`)
    + '<div class="loading">Loading…</div>';
  el('enq-new').onclick = () => openNewEnquiry();
  let rows; try { rows = await enqRows(); } catch (e) { return b.innerHTML = fail(e); }
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = today.slice(0, 7) + '-01';
  const open = rows.filter(r => !r.closed);
  const due = open.filter(r => r.follow_up_on && r.follow_up_on <= today).sort((a, b2) => (a.follow_up_on || '').localeCompare(b2.follow_up_on || ''));
  const fresh = open.filter(r => r.stage === 'new').slice(0, 30);
  const visits = open.filter(r => r.visit_scheduled_at && r.visit_scheduled_at.slice(0, 10) === today);
  const thisMonth = rows.filter(r => r.created_at >= monthStart);
  const visitedMonth = rows.filter(r => r.first_visit_at && r.first_visit_at >= monthStart);
  const admittedMonth = rows.filter(r => r.admitted_at && r.admitted_at >= monthStart);
  const { data: missed } = await getSb().schema('eurokids').from('call_log').select('id,caller,started_at,status,enquiry_id,agent')
    .gte('started_at', today + 'T00:00:00').order('started_at', { ascending: false }).limit(50);

  const list = (title, items, empty, render) => `
    <div class="panel"><div class="ptop"><h2>${title}</h2><span class="hint">${items.length}</span></div>
      ${items.length ? `<div class="box" style="box-shadow:none;border-radius:0">${items.map(render).join('')}</div>` : `<div class="pbody hint">${empty}</div>`}</div>`;
  const item = r => `<button class="linkrow enq-row" data-id="${r.id}" style="display:flex;justify-content:space-between;gap:12px;align-items:center;color:var(--label)">
      <span><strong>${esc(enqName(r))}</strong><span class="hint" style="margin-left:8px">${esc(r.program || '')}${r.phone ? ' · ' + esc(r.phone) : ''}</span>
        ${r.next_action ? `<div class="hint">${esc(r.next_action)}</div>` : r.latest_note ? `<div class="hint">🗒 ${esc(String(r.latest_note).slice(0, 80))}</div>` : ''}</span>
      <span style="display:flex;gap:8px;align-items:center;flex:none">${heatDots(r.heat)}${stageChip(r.stage)}<span style="color:var(--label-3)">›</span></span></button>`;

  b.innerHTML = head('Today', new Date().toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'long' }), `<button class="btn" id="enq-new">New Enquiry…</button>`)
    + `<div class="stats">
        <div class="stat"><div class="k">Open enquiries</div><div class="v">${open.length}</div><div class="m">${fresh.length} untouched</div></div>
        <div class="stat"><div class="k">This month</div><div class="v">${thisMonth.length}</div><div class="m">new enquiries</div></div>
        <div class="stat"><div class="k">Visited</div><div class="v">${visitedMonth.length}</div><div class="m">this month</div></div>
        <div class="stat good"><div class="k">Admitted</div><div class="v">${admittedMonth.length}</div><div class="m">${thisMonth.length ? Math.round(100 * admittedMonth.length / thisMonth.length) + '% of this month’s' : 'this month'}</div></div>
      </div>
      ${list('Follow-ups due', due, 'Nothing due. Set a follow-up date on an enquiry and it shows up here on the day.', item)}
      ${list('Visits today', visits, 'No visits booked for today.', item)}
      ${list('New — nobody has spoken to them yet', fresh, 'Every new enquiry has been contacted.', item)}
      ${(missed || []).length ? list('Calls today', missed, '', c => `<button class="linkrow enq-row" data-id="${c.enquiry_id || ''}" style="display:flex;justify-content:space-between;gap:12px;color:var(--label)">
          <span><strong>${esc(c.caller || '')}</strong><span class="hint" style="margin-left:8px">${dtLocal(c.started_at)}${c.agent ? ' · ' + esc(c.agent) : ''}</span></span>
          <span class="chip ${c.status === 'missed' ? 'c-crit' : 'c-good'}">${esc(c.status || '')}</span></button>`) : ''}`;
  el('enq-new').onclick = () => openNewEnquiry();
  b.querySelectorAll('.enq-row').forEach(x => x.onclick = () => x.dataset.id && openEnquiry(Number(x.dataset.id)));
  if (window._openNewEnquiry) { window._openNewEnquiry = false; openNewEnquiry(); }
}

/* ── Enquiries: the whole book ────────────────────────────────── */
let _enqF = { q: '', stage: 'open', source: '', program: '', sort: 'recent' };
async function tabEnqList(){
  const b = el('body');
  b.innerHTML = head('Enquiries', 'Every family who has asked about a place.', `<button class="btn" id="enq-new">New Enquiry…</button>`) + '<div class="loading">Loading…</div>';
  el('enq-new').onclick = () => openNewEnquiry();
  let rows; try { rows = await enqRows(); } catch (e) { return b.innerHTML = fail(e); }
  b.innerHTML = head('Enquiries', `${rows.length} on record · ${rows.filter(r => !r.closed).length} open`, `<div class="more"><button class="btn line" id="enq-more">•••</button><div class="menu" id="enq-menu"><button id="enq-csv">Download CSV</button></div></div><button class="btn" id="enq-new">New Enquiry…</button>`)
    + `<div class="tools">
        <div class="search"><input class="in" id="eq-q" type="search" placeholder="Search child, parent or phone" value="${esc(_enqF.q)}"></div>
        <select class="in" id="eq-stage"><option value="open">Open</option><option value="">All stages</option>${ENQ_STAGES.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select>
        <select class="in" id="eq-source"><option value="">Any source</option>${Object.entries(ENQ_SOURCES).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select>
        <select class="in" id="eq-program"><option value="">Any programme</option>${ENQ_PROGRAMS.map(p => `<option>${p}</option>`).join('')}</select>
        <select class="in" id="eq-sort"><option value="recent">Newest first</option><option value="touch">Last touched</option><option value="heat">Hottest first</option><option value="follow">Follow-up date</option><option value="name">Name A–Z</option></select>
      </div>
      <div class="panel"><div class="tw"><table><thead><tr><th>Child</th><th>Parent</th><th>Programme</th><th>Source</th><th>Stage</th><th>Heat</th><th>Follow-up</th><th>Last touch</th><th></th></tr></thead><tbody id="eq-rows"></tbody></table></div></div>`;
  ['eq-stage', 'eq-source', 'eq-program', 'eq-sort'].forEach(id => { el(id).value = _enqF[id.slice(3)] ?? ''; });
  const paint = () => {
    _enqF = { q: el('eq-q').value, stage: el('eq-stage').value, source: el('eq-source').value, program: el('eq-program').value, sort: el('eq-sort').value };
    const q = _enqF.q.trim().toLowerCase();
    let list = rows.filter(r =>
      (_enqF.stage === 'open' ? !r.closed : !_enqF.stage || r.stage === _enqF.stage) &&
      (!_enqF.source || r.source === _enqF.source) && (!_enqF.program || r.program === _enqF.program) &&
      (!q || [r.child_name, r.father_name, r.mother_name, r.father_phone, r.mother_phone, r.father_email, r.address].some(v => (v || '').toLowerCase().includes(q))));
    const s = _enqF.sort;
    if (s === 'touch') list.sort((a, b2) => (b2.last_touch_at || '').localeCompare(a.last_touch_at || ''));
    else if (s === 'heat') list.sort((a, b2) => b2.heat - a.heat || (b2.created_at || '').localeCompare(a.created_at || ''));
    else if (s === 'follow') list.sort((a, b2) => (a.follow_up_on || '9999').localeCompare(b2.follow_up_on || '9999'));
    else if (s === 'name') list.sort((a, b2) => enqName(a).localeCompare(enqName(b2)));
    el('eq-rows').innerHTML = list.map(r => `<tr class="${r.follow_up_due ? 't-warn' : r.stage === 'admitted' ? 't-good' : r.stage === 'lost' ? 't-crit' : ''}" style="cursor:pointer" onclick="openEnquiry(${r.id})">
        <td><strong>${esc(enqName(r))}</strong>${r.on_roster ? ' <span class="chip c-good">on roll</span>' : ''}${r.latest_note ? `<div class="hint">🗒 ${esc(String(r.latest_note).slice(0, 70))}</div>` : ''}</td>
        <td class="hint">${esc(r.father_name || r.mother_name || '—')}${r.phone ? `<br><a href="tel:${esc(r.phone)}" onclick="event.stopPropagation()" style="color:var(--label-2)">${esc(r.phone)}</a>` : ''}</td>
        <td>${esc(r.program || '—')}</td><td class="hint">${ENQ_SOURCES[r.source] || r.source}</td>
        <td>${stageChip(r.stage)}</td><td>${heatDots(r.heat)}</td>
        <td class="${r.follow_up_due ? 'money-due' : 'hint'}">${r.follow_up_on ? longDate(r.follow_up_on) : '—'}</td>
        <td class="hint">${whenAgo(r.last_touch_at || r.created_at)}</td><td style="color:var(--label-3)">›</td></tr>`).join('')
      || `<tr><td colspan="9"><div class="empty"><div class="ic">📭</div><h3>No enquiries match</h3><div>Try a different stage or clear the search.</div></div></td></tr>`;
    el('enq-csv').onclick = () => {
      const cols = ['id', 'child_name', 'program', 'dob', 'sex', 'father_name', 'father_phone', 'father_email', 'mother_name', 'mother_phone', 'mother_email', 'address', 'source', 'stage', 'heat', 'first_contact_at', 'first_visit_at', 'follow_up_on', 'next_action', 'latest_note'];
      const csv = [cols.join(',')].concat(list.map(r => cols.map(c => `"${String(r[c] ?? '').replace(/"/g, '""')}"`).join(','))).join('\n');
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = 'enquiries.csv'; a.click();
    };
  };
  paint();
  el('eq-q').oninput = debounce(paint, 160);
  ['eq-stage', 'eq-source', 'eq-program', 'eq-sort'].forEach(id => el(id).onchange = paint);
  el('enq-new').onclick = () => openNewEnquiry();
  el('enq-more').onclick = e => { e.stopPropagation(); el('enq-menu').classList.toggle('open'); };
  document.addEventListener('click', () => el('enq-menu')?.classList.remove('open'), { once: true });
}

/* ── Calls: what the IVR reported ─────────────────────────────── */
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
      ${(calls || []).map(c => { const e = c.enquiry_id ? byId[c.enquiry_id] : null; return `<tr style="cursor:pointer" onclick="${c.enquiry_id ? `openEnquiry(${c.enquiry_id})` : ''}">
        <td class="hint" style="white-space:nowrap">${dtLocal(c.started_at)}</td>
        <td><strong>${esc(c.caller || '')}</strong>${c.direction === 'outbound' ? ' <span class="chip c-mute">outbound</span>' : ''}</td>
        <td>${e ? `${esc(enqName(e))} ${stageChip(e.stage)}` : '<span class="hint">unknown</span>'}</td>
        <td class="hint">${esc(c.agent || '—')}</td><td class="hint">${c.duration_s ? Math.round(c.duration_s / 60) + 'm ' + (c.duration_s % 60) + 's' : '—'}</td>
        <td><span class="chip ${c.status === 'missed' ? 'c-crit' : c.status === 'answered' ? 'c-good' : 'c-mute'}">${esc(c.status || '')}</span></td>
        <td>${c.recording_url ? `<a href="${esc(c.recording_url)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">▶︎ Play</a>` : '<span class="hint">—</span>'}</td></tr>`; }).join('')}
      </tbody></table></div></div>`
    : `<div class="panel"><div class="empty"><div class="ic">📞</div><h3>No calls yet</h3><div>Point the IVR at the webhook in <a onclick="tab='enq_setup';renderApp()">Setup</a> and every call lands here, matched to the family. Until then, log calls by hand.</div></div></div>`);
  el('enq-logcall').onclick = () => openNewEnquiry({ source: 'call' });
}

/* ── Setup: the plumbing ─────────────────────────────────────── */
async function tabEnqSetup(){
  const b = el('body');
  b.innerHTML = head('Setup', 'Where enquiries come from, and how families hear back.') + '<div class="loading">Loading…</div>';
  const j = await enqApi('/api/enquiry/setup');
  if (!j.ok) return b.innerHTML = fail(j.error);
  const code = t => `<pre style="background:var(--field);border-radius:8px;padding:12px;font-size:12.5px;overflow:auto;white-space:pre-wrap;word-break:break-all;margin:0;font-family:var(--mono)">${esc(t)}</pre>`;
  const embed = `<div id="ek-enquire"></div>
<script>
(function(){var f=document.createElement('iframe');f.src='${j.embed_url}';f.style.cssText='width:100%;border:0;min-height:900px';f.setAttribute('title','Enquire');
document.getElementById('ek-enquire').appendChild(f);
window.addEventListener('message',function(e){if(e.data&&e.data.ekEnquireHeight)f.style.height=(e.data.ekEnquireHeight+20)+'px';});})();
</script>`;
  const ok = v => v ? '<span class="chip c-good">ready</span>' : '<span class="chip c-warn">not set</span>';
  b.innerHTML = head('Setup', 'Where enquiries come from, and how families hear back.') + `<div style="max-width:820px">
    <div class="grp" style="margin-top:0"><h3>Website form (replaces Tally)</h3><div class="box">
      <div class="rowx"><div class="hint" style="margin-bottom:8px">Paste this into an <strong>Embed / HTML</strong> element on the Framer site. The form sizes itself and every submission lands in Enquiries with source “Website”, sends the family a welcome email, and never touches Tally.</div>${code(embed)}</div>
    </div><div class="foot">Direct link for a WhatsApp or Instagram bio: <a href="${esc(j.site)}/enquire" target="_blank">${esc(j.site)}/enquire</a></div></div>

    <div class="grp"><h3>Reception iPad ${ok(j.kiosk_key_set)}</h3><div class="box">
      ${j.kiosk_url ? `<div class="rowx"><div class="hint" style="margin-bottom:8px">Open this on the iPad in Safari, then <em>Share → Add to Home Screen</em>. It runs full-screen, big type, and resets itself after each family. Submissions arrive as <strong>Walk-in</strong> and stamp the first visit — a family who called earlier is upgraded, not duplicated.</div>${code(j.kiosk_url)}</div>`
        : `<div class="rowx hint">Add <code>ENQUIRY_KIOSK_KEY</code> (any long random string) to Vercel → Environment Variables, redeploy, and the iPad link appears here.</div>`}
    </div></div>

    <div class="grp"><h3>IVR call log ${ok(j.ivr_key_set)}</h3><div class="box">
      ${j.ivr_url ? `<div class="rowx"><div class="hint" style="margin-bottom:8px">In the IVR provider’s settings, find <em>Webhook / Call status callback / Post-call URL</em> and paste this. It accepts JSON or form posts and understands the field names of Exotel, MyOperator, Knowlarity, Servetel, Ozonetel and Tata Tele. Each call is matched by number; an unknown inbound number becomes a new enquiry so nothing is lost.</div>${code(j.ivr_url)}</div>`
        : `<div class="rowx hint">Add <code>IVR_WEBHOOK_KEY</code> to Vercel, redeploy, and the webhook URL appears here.</div>`}
    </div></div>

    <div class="grp"><h3>Welcome messages</h3><div class="box">
      <div class="row"><div class="l">Email<span class="sub">Sent automatically on every website and iPad enquiry that has an email.</span></div><div class="v">${ok(j.email_configured)}</div></div>
      <div class="row"><div class="l">WhatsApp<span class="sub">${j.whatsapp_configured ? `Sends the approved template “${esc(j.whatsapp_template)}” automatically.` : 'Until Meta’s WhatsApp Business API is connected, the enquiry sheet gives a one-tap “WhatsApp” button that opens a pre-written message from your phone.'}</span></div><div class="v">${j.whatsapp_configured ? ok(true) : '<span class="chip c-mute">manual</span>'}</div></div>
    </div><div class="foot">To automate WhatsApp: a Meta Business account → WhatsApp Business API → a phone number and an approved template named <code>enquiry_welcome</code> with one variable (the child’s name). Then set <code>WHATSAPP_TOKEN</code> and <code>WHATSAPP_PHONE_NUMBER_ID</code> in Vercel.</div></div>

    <div class="grp"><h3>Bring in the Coda enquiries</h3><div class="box"><div class="rowx hint">Export the Coda “Enquiry Database” table as CSV and run <code>scripts/import_coda_enquiries.py</code>. Every row keeps its Coda id, so running it twice updates rather than duplicates.</div></div></div>
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
  el('drawer-sub').textContent = [e.program, ENQ_SOURCES[e.source], 'since ' + longDate((e.first_contact_at || e.created_at).slice(0, 10))].filter(Boolean).join(' · ');

  const phone = e.father_phone || e.mother_phone;
  const waText = `Hello${e.father_name ? ' ' + e.father_name : ''}, this is ${who() || 'the team'} from EuroKids JMD Enclave. Thank you for enquiring${e.child_name ? ' for ' + e.child_name : ''} — happy to answer any questions and book a visit for you. When would suit?`;
  const row = (l, ctl, sub = '') => `<div class="row"><div class="l">${l}${sub ? `<span class="sub">${sub}</span>` : ''}</div>${ctl}</div>`;
  const inp = (id, v, ph = '', type = 'text') => `<input class="in wide" id="${id}" type="${type}" value="${esc(v ?? '')}" placeholder="${esc(ph)}">`;

  body.innerHTML = `
    <div class="hero ${e.stage === 'admitted' ? 'paid' : e.stage === 'lost' ? 'due' : ''}"><div class="k">${ENQ_STAGE[e.stage]?.l || e.stage}</div>
      <div class="v" style="font-size:28px">${e.on_roster ? 'On the roll 🎉' : e.follow_up_on ? (e.follow_up_due ? 'Follow up today' : 'Follow up ' + longDate(e.follow_up_on)) : (e.stage === 'new' ? 'Nobody has called yet' : 'No follow-up set')}</div>
      <div class="m">${e.next_action ? esc(e.next_action) : `${ENQ_HEAT[e.heat]} · ${e.call_count || 0} call${e.call_count === 1 ? '' : 's'} · last touch ${whenAgo(e.last_touch_at || e.created_at)}`}</div></div>

    <div class="grp"><h3>Where they are</h3><div class="box">
      ${row('Stage', `<select class="in" id="en-stage">${ENQ_STAGES.map(([k, l]) => `<option value="${k}" ${e.stage === k ? 'selected' : ''}>${l}</option>`).join('')}</select>`)}
      ${row('How keen', `<div class="seg" id="en-heat">${ENQ_HEAT.map((l, i) => `<button data-v="${i}" class="${e.heat === i ? 'on' : ''}">${l}</button>`).join('')}</div>`, 'Coda’s sentiment: 0–3 cooling, 4 to be won at any cost')}
      ${row('Follow up on', inp('en-follow', e.follow_up_on, '', 'date'))}
      ${row('Next action', inp('en-next', e.next_action, 'e.g. Call after 5 pm, mother decides'))}
      ${row('Handled by', inp('en-who', e.assigned_to, who()))}
    </div></div>

    <div class="grp"><h3>Family</h3><div class="box">
      ${row('Father', inp('en-fname', e.father_name, 'name'))}
      ${row('Phone', `<div class="inst">${inp('en-fphone', e.father_phone, '10-digit mobile', 'tel')}${e.father_phone ? `<a class="btn line sm" href="tel:${esc(e.father_phone)}">Call</a><a class="btn line sm" href="${waHref(e.father_phone, waText)}" target="_blank" rel="noopener">WhatsApp</a>` : ''}</div>`)}
      ${row('Email', inp('en-femail', e.father_email, 'father@example.com', 'email'))}
      ${row('Mother', inp('en-mname', e.mother_name, 'name'))}
      ${row('Phone', `<div class="inst">${inp('en-mphone', e.mother_phone, 'optional', 'tel')}${e.mother_phone ? `<a class="btn line sm" href="tel:${esc(e.mother_phone)}">Call</a><a class="btn line sm" href="${waHref(e.mother_phone, waText)}" target="_blank" rel="noopener">WhatsApp</a>` : ''}</div>`)}
      ${row('Email', inp('en-memail', e.mother_email, 'optional', 'email'))}
      ${row('Address', inp('en-addr', e.address, 'area or society'))}
    </div>${e.welcome_email_sent_at || e.welcome_wa_sent_at ? `<div class="foot">Welcome ${[e.welcome_email_sent_at && 'email', e.welcome_wa_sent_at && 'WhatsApp'].filter(Boolean).join(' and ')} sent.</div>` : ''}</div>

    <div class="grp"><h3>Child</h3><div class="box">
      ${row('Name', inp('en-cname', e.child_name, 'child’s name'))}
      ${row('Programme', `<select class="in" id="en-prog"><option value="">—</option>${ENQ_PROGRAMS.map(p => `<option ${e.program === p ? 'selected' : ''}>${p}</option>`).join('')}</select>`)}
      ${row('Date of birth', inp('en-dob', e.dob, '', 'date'))}
      ${row('Sex', `<div class="seg" id="en-sex"><button data-v="Boy" class="${e.sex === 'Boy' ? 'on' : ''}">Boy</button><button data-v="Girl" class="${e.sex === 'Girl' ? 'on' : ''}">Girl</button></div>`)}
      ${row('Source', `<select class="in" id="en-source">${Object.entries(ENQ_SOURCES).map(([k, l]) => `<option value="${k}" ${e.source === k ? 'selected' : ''}>${l}</option>`).join('')}</select>`)}
    </div></div>

    <div class="grp"><h3>Journey</h3><div class="box">
      ${row('First contact', `<div class="v mute">${dtLocal(e.first_contact_at)}</div>`)}
      ${row('Visit booked for', inp('en-visit', toInputDT(e.visit_scheduled_at), '', 'datetime-local'))}
      ${row('First visit', inp('en-visited', toInputDT(e.first_visit_at), '', 'datetime-local'))}
      ${e.admitted_at ? row('Admitted', `<div class="v credit">${dtLocal(e.admitted_at)}${e.admitted_uin ? ' · ' + esc(e.admitted_uin) : ''}</div>`) : ''}
      ${e.stage === 'lost' ? row('Why lost', inp('en-lost', e.lost_reason, 'fees / distance / joined elsewhere…')) : ''}
    </div></div>

    <div class="grp"><h3>Notes &amp; timeline</h3><div class="box">
      <div class="note-in"><textarea class="in" id="en-note" rows="1" placeholder="Add a note — what they said, what you promised"></textarea><button class="btn sm" id="en-addnote">Add</button></div>
      <div id="en-timeline"></div>
    </div></div>`;

  el('drawer-foot').innerHTML = `<div id="pf-msg"></div>
    <div class="more"><button class="btn line" id="en-actbtn">Actions…</button>
      <div class="menu up" id="en-menu">
        <button data-a="welcome_email">Send welcome email${e.welcome_email_sent_at ? '<span class="sub">again</span>' : ''}</button>
        <button data-a="welcome_wa">Send welcome WhatsApp</button>
        <div class="msep"></div>
        <button data-a="visit_now">Mark visited now</button>
        <button data-a="book">Book a visit…</button>
        <div class="msep"></div>
        <button data-a="admitted">Mark admitted</button>
        <button data-a="lost" style="color:var(--red)">Mark lost…</button>
      </div></div>
    <button class="btn" id="en-save">Save</button>`;

  const seg = id => { const box = el(id); box.querySelectorAll('button').forEach(b2 => b2.onclick = () => { box.querySelectorAll('button').forEach(x => x.classList.remove('on')); b2.classList.add('on'); }); return () => box.querySelector('.on')?.dataset.v ?? null; };
  const heat = seg('en-heat'), sex = seg('en-sex');
  const ta = el('en-note'); ta.oninput = () => { ta.style.height = 'auto'; ta.style.height = Math.min(160, ta.scrollHeight) + 'px'; };

  const drawTimeline = (evs, nts, cls) => {
    const items = [
      ...(nts || []).map(n => ({ at: n.created_at, kind: 'note', summary: n.body, actor: n.author, noteId: n.id })),
      ...(evs || []).map(x => ({ at: x.at, kind: x.kind, summary: x.summary, actor: x.actor, detail: x.detail })),
      ...(cls || []).filter(c => !(evs || []).some(x => x.detail && x.detail.call_id === c.provider_call_id)).map(c => ({ at: c.started_at, kind: c.status === 'missed' ? 'missed_call' : c.direction === 'outbound' ? 'call_out' : 'call_in', summary: `${c.status === 'missed' ? 'Missed call' : c.direction === 'outbound' ? 'We called' : 'They called'}${c.agent ? ' · ' + c.agent : ''}${c.duration_s ? ' · ' + c.duration_s + 's' : ''}`, actor: c.agent, rec: c.recording_url })),
    ].sort((a, b2) => (b2.at || '').localeCompare(a.at || ''));
    el('en-timeline').innerHTML = items.map(x => `<div class="note"><span style="margin-right:6px">${EVENT_ICON[x.kind] || '•'}</span>${esc(x.summary || x.kind)}${x.rec ? ` <a href="${esc(x.rec)}" target="_blank" rel="noopener">▶︎ recording</a>` : ''}
        <div class="who"><span>${esc(x.actor || '')} · ${dtLocal(x.at)}</span>${x.noteId ? `<a href="#" class="en-delnote" data-id="${x.noteId}">Remove</a>` : ''}</div></div>`).join('')
      || '<div class="note hint">Nothing yet.</div>';
    el('en-timeline').querySelectorAll('.en-delnote').forEach(a => a.onclick = async ev => { ev.preventDefault(); if (!confirm('Remove this note?')) return; await s.from('enquiry_note').delete().eq('id', Number(a.dataset.id)); enqRefresh(); openEnquiry(id); });
  };
  drawTimeline(events, notes, calls);

  el('en-addnote').onclick = async () => {
    const text = ta.value.trim(); if (!text) return;
    const { error } = await s.from('enquiry_note').insert({ enquiry_id: id, body: text, author: who(), created_by: session?.user?.id || null });
    if (error) return alert('Could not save the note: ' + error.message);
    ta.value = ''; enqRefresh(); openEnquiry(id);
  };

  const val = i => (el(i).value || '').trim() || null;
  const save = async (extra = {}) => {
    const patch = {
      stage: el('en-stage').value, heat: Number(heat() ?? e.heat), follow_up_on: val('en-follow'), next_action: val('en-next'), assigned_to: val('en-who'),
      father_name: val('en-fname'), father_phone: val('en-fphone'), father_email: val('en-femail')?.toLowerCase() || null,
      mother_name: val('en-mname'), mother_phone: val('en-mphone'), mother_email: val('en-memail')?.toLowerCase() || null, address: val('en-addr'),
      child_name: val('en-cname'), program: val('en-prog'), dob: val('en-dob'), sex: sex(), source: el('en-source').value,
      visit_scheduled_at: val('en-visit') ? new Date(el('en-visit').value).toISOString() : null,
      first_visit_at: val('en-visited') ? new Date(el('en-visited').value).toISOString() : null,
      lost_reason: el('en-lost') ? val('en-lost') : e.lost_reason, ...extra,
    };
    if (!patch.father_phone && !patch.mother_phone) { el('pf-msg').innerHTML = '<div class="err">Keep at least one phone number — it is how the family is recognised.</div>'; return false; }
    if (patch.stage === 'admitted' && !e.admitted_at) patch.admitted_at = new Date().toISOString();
    if (patch.stage === 'visited' && !patch.first_visit_at) patch.first_visit_at = new Date().toISOString();
    if (patch.stage === 'visit_scheduled' && !patch.visit_scheduled_at) { el('pf-msg').innerHTML = '<div class="err">Set the visit date and time first.</div>'; return false; }
    const { error } = await s.from('enquiry').update(patch).eq('id', id);
    if (error) { el('pf-msg').innerHTML = `<div class="err">${esc(error.message)}</div>`; return false; }
    const evs = [];
    if (patch.stage !== e.stage) evs.push({ enquiry_id: id, kind: patch.stage === 'admitted' ? 'admitted' : patch.stage === 'lost' ? 'lost' : 'stage', summary: `${ENQ_STAGE[e.stage]?.l} → ${ENQ_STAGE[patch.stage]?.l}${patch.lost_reason && patch.stage === 'lost' ? ' · ' + patch.lost_reason : ''}`, actor: who() });
    if (patch.heat !== e.heat) evs.push({ enquiry_id: id, kind: 'heat', summary: `${ENQ_HEAT[e.heat]} → ${ENQ_HEAT[patch.heat]}`, actor: who() });
    if (patch.visit_scheduled_at && patch.visit_scheduled_at !== e.visit_scheduled_at) evs.push({ enquiry_id: id, kind: 'visit', summary: `Visit booked for ${dtLocal(patch.visit_scheduled_at)}`, actor: who() });
    if (patch.first_visit_at && !e.first_visit_at) evs.push({ enquiry_id: id, kind: 'visit', summary: 'Visited the school', actor: who(), at: patch.first_visit_at });
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
      else el('pf-msg').innerHTML = `<div class="ok">${j.email === 'sent' ? 'Welcome email sent. ' : j.email ? 'Email: ' + esc(j.email) + '. ' : ''}${j.whatsapp === 'sent' ? 'WhatsApp sent.' : j.whatsapp && j.whatsapp !== 'not_configured' ? 'WhatsApp: ' + esc(j.whatsapp) : ''}</div>`;
      enqRefresh(); setTimeout(() => openEnquiry(id), 900);
    }
    if (a === 'visit_now') { el('en-stage').value = e.stage === 'admitted' ? 'admitted' : 'visited'; if (!el('en-visited').value) el('en-visited').value = toInputDT(new Date().toISOString()); el('en-save').click(); }
    if (a === 'book') { el('en-stage').value = 'visit_scheduled'; el('en-visit').focus(); el('en-visit').showPicker?.(); el('pf-msg').innerHTML = '<div class="ok">Pick the date and time under Journey, then Save.</div>'; }
    if (a === 'admitted') { if (!confirm(`Mark ${enqName(e)} as admitted?`)) return; el('en-stage').value = 'admitted'; el('en-save').click(); }
    if (a === 'lost') { const why = prompt('Why did we lose them? (fees, distance, joined elsewhere, no response…)', e.lost_reason || ''); if (why === null) return; el('en-stage').value = 'lost'; await save({ lost_reason: why || null }); openEnquiry(id); }
  });
  el('drawer-body').scrollTop = 0;
}

/* ── new enquiry: the quick sheet for a call or a walk-in ────── */
function openNewEnquiry(preset = {}){
  const body = openDrawer('New Enquiry', 'A call, a walk-in, a message — file it in thirty seconds.');
  const row = (l, ctl, sub = '') => `<div class="row"><div class="l">${l}${sub ? `<span class="sub">${sub}</span>` : ''}</div>${ctl}</div>`;
  body.innerHTML = `
    <div class="grp"><div class="box">
      ${row('How did they reach us', `<div class="seg" id="nq-source"><button data-v="call" class="${(preset.source || 'call') === 'call' ? 'on' : ''}">Call</button><button data-v="walk_in" class="${preset.source === 'walk_in' ? 'on' : ''}">Walk-in</button><button data-v="whatsapp">WhatsApp</button><button data-v="referral">Referral</button><button data-v="instagram">Instagram</button></div>`)}
    </div></div>
    <div class="grp"><h3>Parent</h3><div class="box">
      ${row('Mobile', `<input class="in wide" id="nq-phone" type="tel" inputmode="numeric" placeholder="10-digit mobile" value="${esc(preset.phone || '')}">`, 'Type the number first — if we know them, their card opens.')}
      ${row('Name', `<input class="in wide" id="nq-parent" placeholder="parent’s name">`)}
      ${row('Email', `<input class="in wide" id="nq-email" type="email" placeholder="optional">`)}
    </div><div class="foot" id="nq-known"></div></div>
    <div class="grp"><h3>Child</h3><div class="box">
      ${row('Name', `<input class="in wide" id="nq-child" placeholder="child’s name">`)}
      ${row('Programme', `<select class="in" id="nq-prog"><option value="">Not sure yet</option>${ENQ_PROGRAMS.map(p => `<option>${p}</option>`).join('')}</select>`)}
      ${row('Area', `<input class="in wide" id="nq-addr" placeholder="e.g. Undri, Nyati County">`)}
    </div></div>
    <div class="grp"><h3>What they said</h3><div class="box">
      <div class="rowx"><textarea class="in" id="nq-msg" rows="3" placeholder="Timings, fees, when they want to visit…" style="width:100%"></textarea></div>
      ${row('Follow up on', `<input class="in" id="nq-follow" type="date" value="${new Date(Date.now() + 2 * 864e5).toISOString().slice(0, 10)}">`)}
      <label class="row" style="cursor:pointer"><span class="l">Send the welcome email now<span class="sub">Needs an email address. WhatsApp opens as a one-tap message after saving.</span></span><input type="checkbox" class="sw" id="nq-welcome" checked></label>
    </div></div>`;
  el('drawer-foot').innerHTML = `<div id="pf-msg"></div><button class="btn line" id="nq-cancel">Cancel</button><button class="btn" id="nq-save">Save Enquiry</button>`;
  el('nq-cancel').onclick = closeDrawer;
  const seg = id => { const box = el(id); box.querySelectorAll('button').forEach(b2 => b2.onclick = () => { box.querySelectorAll('button').forEach(x => x.classList.remove('on')); b2.classList.add('on'); }); return () => box.querySelector('.on')?.dataset.v ?? null; };
  const source = seg('nq-source');

  // Recognise a returning family as the number is typed.
  el('nq-phone').oninput = debounce(async () => {
    const d = el('nq-phone').value.replace(/\D/g, '').slice(-10);
    if (d.length < 10) return el('nq-known').textContent = '';
    const { data } = await getSb().schema('eurokids').from('v_enquiry').select('id,child_name,father_name,stage,program').eq('phone_key', d).limit(1).maybeSingle();
    el('nq-known').innerHTML = data ? `Known: <strong>${esc(enqName(data))}</strong> · ${ENQ_STAGE[data.stage]?.l}. Saving adds this contact to their card. <a href="#" id="nq-open">Open it instead</a>` : '';
    const o = el('nq-open'); if (o) o.onclick = ev => { ev.preventDefault(); openEnquiry(data.id); };
  }, 250);
  setTimeout(() => el('nq-phone').focus(), 250);

  el('nq-save').onclick = async ev => {
    const btn = ev.currentTarget;
    const phone = el('nq-phone').value.trim();
    if (phone.replace(/\D/g, '').length < 10) { el('pf-msg').innerHTML = '<div class="err">A 10-digit mobile number is needed.</div>'; return; }
    btn.disabled = true; btn.textContent = 'Saving…';
    const src = source() || 'call';
    const j = await enqApi('/api/enquiry/capture', { action: 'capture', input: {
      source: src, father_phone: phone, father_name: el('nq-parent').value, father_email: el('nq-email').value,
      child_name: el('nq-child').value, program: el('nq-prog').value, address: el('nq-addr').value, message: el('nq-msg').value,
      sendWelcome: el('nq-welcome').checked, actor: who(),
    } });
    if (!j.ok) { btn.disabled = false; btn.textContent = 'Save Enquiry'; el('pf-msg').innerHTML = `<div class="err">${esc(j.error)}</div>`; return; }
    if (el('nq-follow').value) await getSb().schema('eurokids').from('enquiry').update({ follow_up_on: el('nq-follow').value }).eq('id', j.id);
    enqRefresh();
    _afterDrawerClose = () => renderApp();
    openEnquiry(j.id);
    if (j.welcome?.whatsapp === 'not_configured') {
      setTimeout(() => { el('pf-msg').innerHTML = `<div class="ok">${j.existing ? 'Added to their existing card.' : 'Saved.'} ${j.welcome?.email === 'sent' ? 'Welcome email sent. ' : ''}Use <strong>Actions → Send welcome WhatsApp</strong> to open the message.</div>`; }, 600);
    }
  };
}
