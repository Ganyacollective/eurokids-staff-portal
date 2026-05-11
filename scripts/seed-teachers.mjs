#!/usr/bin/env node
/**
 * Bulk-creates Supabase Auth users for every employee in the roster
 * and writes the corresponding teacher_links row in one fell swoop.
 *
 * Usage:
 *   1) Ensure SUPABASE_SERVICE_ROLE_KEY is set in payroll-app/.env.local
 *   2) From the payroll-app/ directory: `node scripts/seed-teachers.mjs`
 *
 * Idempotent — re-running it skips users who already exist; no duplicate
 * auth records, no orphaned teacher_links rows.
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// ---------- Load env --------------------------------------------------------
const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, '..', '.env.local');
const envText = readFileSync(envPath, 'utf8');
const env = Object.fromEntries(
  envText.split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0,i), l.slice(i+1)]; })
);

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY  = env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

// ---------- Roster ----------------------------------------------------------
// Mirrors DEFAULT_STATE.employees in public/portal.html. Edit here when staff
// is added or removed, then re-run the script.
const TEMP_PASSWORD = 'eurokids123';   // every teacher gets this; they change on first login
const EMAIL_DOMAIN  = 'eurokidsjmdenclave.org';

const ROSTER = [
  // Support Staff
  { employee_id:'e1',  display_name:'Manisha Zurange',  department:'Support Staff', designation:'Cleaner',          email_slug:'manisha.zurange' },
  { employee_id:'e2',  display_name:'Aarti Yadav',       department:'Support Staff', designation:'Cook',             email_slug:'aarti.yadav' },
  { employee_id:'e3',  display_name:'Gudiya Yadav',      department:'Support Staff', designation:'Didi',             email_slug:'gudiya.yadav' },
  { employee_id:'e4',  display_name:'Baby Maushi',       department:'Support Staff', designation:'Daycare Didi',     email_slug:'baby.maushi' },
  { employee_id:'e5',  display_name:'Pooja Shrirame',    department:'Support Staff', designation:'Cleaner',          email_slug:'pooja.shrirame' },
  { employee_id:'e6',  display_name:'Malti Patil',       department:'Support Staff', designation:'Cleaner',          email_slug:'malti.patil' },
  { employee_id:'e7',  display_name:'Laxmi Palante',     department:'Support Staff', designation:'Cleaner',          email_slug:'laxmi.palante' },
  { employee_id:'e8',  display_name:'Ranjhana Ghule',    department:'Support Staff', designation:'Cleaner',          email_slug:'ranjhana.ghule' },
  { employee_id:'e9',  display_name:'Aarti Biradar',     department:'Support Staff', designation:'Didi',             email_slug:'aarti.biradar' },
  { employee_id:'e10', display_name:'Kala Koli',         department:'Support Staff', designation:'Didi',             email_slug:'kala.koli' },
  { employee_id:'e11', display_name:'Theresa Pillay',    department:'Support Staff', designation:'Didi',             email_slug:'theresa.pillay' },
  // Teachers + Admin
  { employee_id:'e12', display_name:'Anamika Singh',     department:'Teacher', designation:'Nursery Teacher',   email_slug:'anamika.singh' },
  { employee_id:'e13', display_name:'Deepti S',          department:'Admin',   designation:'Coordinator',        email_slug:'deepti.s' },
  { employee_id:'e14', display_name:'Sasmita Mishra',    department:'Teacher', designation:'Daycare Teacher',    email_slug:'sasmita.mishra' },
  { employee_id:'e15', display_name:'Diya Advani',       department:'Teacher', designation:'Daycare Teacher',    email_slug:'diya.advani' },
  { employee_id:'e16', display_name:'Sonia Nyayapathi',  department:'Teacher', designation:'Sr.Kg Teacher',      email_slug:'sonia.nyayapathi' },
  { employee_id:'e17', display_name:'Evan Lunkad',       department:'Teacher', designation:'Jr.Kg Teacher',      email_slug:'evan.lunkad' },
  { employee_id:'e18', display_name:'Firdous Shaikh',    department:'Teacher', designation:'Nursery Teacher',    email_slug:'firdous.shaikh' },
  { employee_id:'e19', display_name:'Pallavi Wadmare',   department:'Teacher', designation:'Nursery Teacher',    email_slug:'pallavi.wadmare' },
  { employee_id:'e20', display_name:'Deepshiksha Tyagi', department:'Teacher', designation:'Playgroup Teacher',  email_slug:'deepshiksha.tyagi' },
  { employee_id:'e21', display_name:'Manisha Apte',      department:'Teacher', designation:'Nursery Teacher',    email_slug:'manisha.apte' },
  { employee_id:'e22', display_name:'Sherebanu Patrawala',department:'Teacher',designation:'Teacher',            email_slug:'sherebanu.patrawala' },
  { employee_id:'e23', display_name:'Starr Liu',         department:'Teacher', designation:'Playgroup Teacher',  email_slug:'starr.liu' },
  { employee_id:'e24', display_name:'Anuja Mule',        department:'Teacher', designation:'Nursery Teacher',    email_slug:'anuja.mule' },
];

// ---------- Execute ---------------------------------------------------------
let created = 0, existed = 0, linked = 0, failed = 0;
const credentials = [];

for (const member of ROSTER) {
  const email = `${member.email_slug}@${EMAIL_DOMAIN}`;
  let userId = null;

  // 1) Create the auth user (or find them if already present)
  const { data: createdUser, error: createErr } = await admin.auth.admin.createUser({
    email,
    password: TEMP_PASSWORD,
    email_confirm: true,
    user_metadata: {
      display_name: member.display_name,
      employee_id:  member.employee_id,
      department:   member.department,
    }
  });

  if (createErr) {
    if (/already been registered|already exists/i.test(createErr.message)) {
      // Look up existing user
      const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const found = list?.users?.find(u => u.email === email);
      if (found) { userId = found.id; existed++; }
      else { console.error(`Could not locate existing user for ${email}`); failed++; continue; }
    } else {
      console.error(`Failed to create ${email}: ${createErr.message}`);
      failed++;
      continue;
    }
  } else {
    userId = createdUser.user.id;
    created++;
  }

  // 2) Upsert the teacher_links row
  const { error: linkErr } = await admin.from('teacher_links').upsert({
    user_id:      userId,
    employee_id:  member.employee_id,
    display_name: member.display_name,
    department:   member.department,
    designation:  member.designation,
  });
  if (linkErr) {
    console.error(`Failed to link ${email}: ${linkErr.message}`);
    failed++;
  } else {
    linked++;
  }

  credentials.push({ email, password: TEMP_PASSWORD, name: member.display_name });
}

// ---------- Summary ---------------------------------------------------------
console.log('\n──────────────────────────────────────────');
console.log(`Created: ${created}   Existed: ${existed}   Linked: ${linked}   Failed: ${failed}`);
console.log('──────────────────────────────────────────\n');
console.log('Credentials (share with each teacher individually):\n');
for (const c of credentials) {
  console.log(`  ${c.name.padEnd(22)}  ${c.email.padEnd(40)}  password: ${c.password}`);
}
console.log('\nThey can sign in at /teacher.html and change their password from the menu.\n');
