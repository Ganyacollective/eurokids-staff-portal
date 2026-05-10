# Eurokids Staff Portal

A web application for Eurokids JM Enclave to manage payroll reconciliation, attendance, leaves, and the staff registry.

## What it replaces

- **PetPooja Excel → manual Coda import** flow.
- **Tally form** for leave applications.
- **Manual cross-referencing** between attendance and leave applications.
- **Memory-based** decisions about which late strikes to forgive.

## Stack

- **Next.js 15** (App Router, Server Actions, Turbopack)
- **Supabase** (Postgres + Auth + Storage)
- **Tailwind CSS** for styling
- **TypeScript** end-to-end
- **xlsx** for parsing PetPooja exports

## First-time setup

You only do this once.

### 1. Install dependencies

```bash
cd /Users/abhinaxv/Documents/Claude/Projects/Eurokids/payroll-app
npm install
```

### 2. Create a Supabase project

Go to <https://supabase.com>, sign in (free), click **New Project**.
- Name: `eurokids-staff-portal`
- Region: pick closest (Mumbai/Singapore)
- Database password: save this somewhere safe.

### 3. Apply the schema

In the Supabase dashboard → **SQL Editor**, paste the contents of `supabase/schema.sql` and run it. This creates all tables, enums, and security policies.

### 4. Wire up the env file

Copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
```

Open `.env.local` and fill in:
- `NEXT_PUBLIC_SUPABASE_URL` — from Supabase: Settings → API → Project URL.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — from Supabase: Settings → API → `anon` key.
- `SUPABASE_SERVICE_ROLE_KEY` — from Supabase: Settings → API → `service_role` key (treat like a password).

### 5. Create your admin account

Go to Supabase → **Authentication → Users → Add User**:
- Email: your email (or fake — phone is what teachers use, but the first admin uses email-password for simplicity).
- Password: pick one.
Then in **SQL Editor**:

```sql
insert into profiles (id, role, full_name)
select id, 'admin', 'Abhinav Saxena' from auth.users where email = 'your@email.com';
```

### 6. Run the app

```bash
npm run dev
```

Open <http://localhost:3000> and log in.

## Day-to-day usage

1. **Add employees** under `/employees` — name (must match PetPooja exactly), reporting time, salary, etc.
2. **Add holidays / vacations** under `/holidays` — seed once per academic year.
3. **At month-end**: upload PetPooja Excel under `/attendance`, review the anomaly inbox, finalize cuts, generate salary sheet.

## Deploy to production (when ready)

1. Push this folder to a GitHub repo.
2. Go to <https://vercel.com>, **Add New Project**, import the GitHub repo.
3. Paste the same env variables from `.env.local` into Vercel project settings.
4. Hit Deploy. You get a URL like `eurokids-staff-portal.vercel.app`. Optionally point a custom domain.
