// Smoke-test the payroll reconciliation engine outside a browser.
// Usage: node scripts/smoke-reconcile.js      (from payroll-app/)
const fs = require('fs'), vm = require('vm'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'portal.html'), 'utf8');
const src = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');

const noop = () => {};
const el = () => new Proxy({}, { get: (t, k) => k === 'style' ? {} : k === 'classList' ? { add: noop, remove: noop, toggle: noop, contains: () => false } : (typeof k === 'string' && k.startsWith('on')) ? null : (k === 'value' || k === 'textContent' || k === 'innerHTML') ? '' : noop, set: () => true });
const g = {
  window: null, document: new Proxy({}, { get: (t, k) => k === 'body' ? el() : (k === 'getElementById' || k === 'querySelector') ? () => el() : k === 'querySelectorAll' ? () => [] : k === 'addEventListener' ? noop : k === 'createElement' ? () => el() : k === 'head' ? el() : noop }),
  localStorage: { getItem: () => null, setItem: noop, removeItem: noop }, location: { reload: noop, href: '' },
  alert: noop, confirm: () => true, prompt: () => null, navigator: {}, console,
  supabase: { createClient: () => ({ auth: { getSession: async () => ({ data: { session: null } }), onAuthStateChange: noop }, from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }) }) },
  fetch: async () => ({ ok: true, json: async () => ({}) }), setTimeout: () => 0, clearTimeout: noop, crypto: require('crypto').webcrypto,
};
g.window = g; g.globalThis = g;
const ctx = vm.createContext(g);
vm.runInContext(src + '\n;globalThis.__reconcile = reconcile; globalThis.__state = () => state;', ctx, { filename: 'portal.js' });

const S = ctx.__state();
S.employees = [
  { id: 'e1', display_name: 'Asha Teacher', name_petpooja: 'ASHA', department: 'Teacher', reporting_minutes: 540, monthly_salary: 26000, is_active: true },
  { id: 'e2', display_name: 'Ravi Support', name_petpooja: 'RAVI', department: 'Support', reporting_minutes: 480, monthly_salary: 13000, is_active: true },
  { id: 'e3', display_name: 'Left Person', name_petpooja: 'LEFT', department: 'Teacher', reporting_minutes: 540, monthly_salary: 20000, is_active: false, left_date: '2026-04-10' },
  { id: 'e4', display_name: 'Ghost Never Punched', name_petpooja: 'GHOST', department: 'Teacher', reporting_minutes: 540, monthly_salary: 20000, is_active: true },
];
S.leaves = []; S.holidays = []; S.vacations = []; S.student_holidays = []; S.special_days = []; S.special_day_overrides = [];
S.adjustments = [{ id: 'a1', month: '2026-04', employee_id: 'e1', date: '2026-04-07', kind: 'forgive_lwp', reason: 'test' }];
S.day_overrides = [{ id: 'o1', employee_id: 'e1', date: '2026-04-08', status: 'FullDay', note: 'override same emp' }];

const rows = [];
const add = (name, date, inn, out) => rows.push({ raw_name: name, attendance_date: date, first_punch: inn, last_punch: out, petpooja_status: null });
for (let d = 6; d <= 10; d++) {
  const date = `2026-04-${String(d).padStart(2, '0')}`;
  if (d !== 7) add('ASHA', date, '08:55 AM', '04:30 PM');
  add('RAVI', date, '07:58 AM', '04:00 PM');
  add('LEFT', date, '09:00 AM', '04:00 PM');
  add('UNKNOWN PERSON', date, '09:00 AM', '04:00 PM');
}
add('ASHA', '2026-05-02', '09:00 AM', '04:00 PM');
add('ASHA', '2026-04-07', null, null);

const r = ctx.__reconcile(rows, '2026-04');
const sum = id => r.summaries.find(x => x.employee_id === id);
const days = id => r.reconciledDays.filter(x => x.employee_id === id);
let fails = 0;
const show = (label, ok) => { console.log((ok ? '  ✓ ' : '  ✗ ') + label); if (!ok) fails++; };
show('forgiven LWP becomes FullDay and stays forgiven after an override recount', days('e1').find(d => d.date === '2026-04-07')?.status === 'FullDay' && sum('e1').lwpDays === 0 && sum('e1').totalCutDays === 0);
show('archived employee is paid up to leaving date', !!sum('e3') && sum('e3').fd === 5);
show('active employee missing from the file gets a zero_punches anomaly', !!sum('e4') && r.anomalies.some(a => a.kind === 'zero_punches' && a.employee_id === 'e4'));
show('unknown name → one anomaly, not one per row', r.anomalies.filter(a => a.kind === 'name_mismatch' && a.description.includes('UNKNOWN')).length === 1);
show('rows outside the month are ignored and reported', r.anomalies.some(a => a.description.includes('outside 2026-04')) && !days('e1').some(d => d.date.startsWith('2026-05')));
show('support staff full days counted', sum('e2').fd === 5);
console.log(fails ? `\n${fails} FAILED` : '\nall pass');
process.exit(fails ? 1 : 0);
