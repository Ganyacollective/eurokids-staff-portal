# Deploying Eurokids Staff Portal to the Web

This guide takes you from "code on your laptop" to "permanent live URL that any HR person can log into from their phone."

**Total time:** ~30 minutes the first time. Future updates take 2 minutes.
**Total cost:** ₹0 (free tiers cover everything for ~30 employees).

---

## Already done for you

- ✅ Dependencies installed (`node_modules` exists)
- ✅ Git repository initialized with the first commit
- ✅ TypeScript compiles cleanly

You don't need to install Node.js or run any commands locally unless you want to test the app on your laptop before deploying.

---

## Step 1 — Create a Supabase project (5 min)

Supabase is the backend — it stores all your data and handles user logins.

1. Go to <https://supabase.com> and click **Start your project**.
2. Sign in with GitHub (create a free GitHub account first if you don't have one — go to <https://github.com/signup>).
3. Click **New Project**:
   - **Name**: `eurokids-staff-portal`
   - **Database Password**: click "Generate a password," then **save it somewhere safe** (you'll rarely need it but losing it is annoying).
   - **Region**: pick **Mumbai** (closest to you).
   - **Plan**: Free.
4. Wait ~2 minutes for the project to provision.

### Step 1a — Apply the database schema

5. In your Supabase project, click **SQL Editor** in the left sidebar → **New Query**.
6. Open the file `supabase/schema.sql` from your project folder (in any text editor — even TextEdit).
7. Copy the **entire contents** and paste into the Supabase SQL Editor.
8. Click **Run** (or press Cmd+Enter). You should see "Success. No rows returned." This creates all 14 tables, the row-level security policies, and seeds your 24 teachers + AY 2026-27 holidays.

### Step 1b — Grab the API keys

9. Click **Project Settings** (gear icon, bottom left) → **API**.
10. You'll need three values for the next step. Keep this tab open.
    - **Project URL** (looks like `https://xxxxxxxx.supabase.co`)
    - **anon public** key (long string starting with `eyJ…`)
    - **service_role** key (also `eyJ…` — this is a secret, don't share it)

### Step 1c — Create your admin login

11. Click **Authentication** in the left sidebar → **Users** → **Add User** → **Create new user**.
12. Enter:
    - **Email**: your email (e.g. `abhinav@ganya.in`)
    - **Password**: pick something strong
    - Tick **Auto Confirm User**.
13. Click **Create user**. Copy the new user's **UID** (long string starting with a letter).
14. Back to **SQL Editor** → New Query, paste this (replace `YOUR_USER_UID` with the UID you just copied):

```sql
insert into profiles (id, role, full_name)
values ('YOUR_USER_UID', 'admin', 'Abhinav Saxena');
```

Run it. You're now an admin in the app.

---

## Step 2 — Push the code to GitHub (5 min)

Vercel deploys from a GitHub repository, so we need to put the code there first.

### The easy way (no terminal): GitHub Desktop

1. Download **GitHub Desktop** from <https://desktop.github.com>. Install and sign in with the same GitHub account from Step 1.
2. **File → Add Local Repository** → choose `/Users/abhinaxv/Documents/Claude/Projects/Eurokids/payroll-app`.
3. GitHub Desktop sees there's already a git repo and an initial commit. Click **Publish repository**.
4. **Repository name**: `eurokids-staff-portal`. Tick **Keep this code private**. Click **Publish**.
5. Done — your code is now on GitHub.

### The terminal way (alternative)

If you prefer the command line, ask me and I'll give you the exact 3 commands once you've created an empty repo on github.com.

---

## Step 3 — Deploy to Vercel (10 min)

Vercel hosts your Next.js app and gives you a permanent live URL.

1. Go to <https://vercel.com> and click **Sign Up**.
2. Sign up with GitHub (one click — it uses the account from Step 2).
3. On the dashboard, click **Add New… → Project**.
4. Find **eurokids-staff-portal** in the list (Vercel auto-detects all your GitHub repos). Click **Import**.
5. **Configure Project** screen:
   - **Framework Preset**: Next.js (auto-detected).
   - **Root Directory**: leave as `./`.
   - **Build Command**: leave default.
   - **Environment Variables**: this is the important part. Click **Add** and enter the three values from Supabase (Step 1b):

| Name | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://xxxxxxxx.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `eyJ…` (the anon key) |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJ…` (the service_role key — **secret**) |

6. Click **Deploy**. Wait ~2 minutes.
7. You'll see "Congratulations!" and a URL like `https://eurokids-staff-portal.vercel.app`. **This is your live website.**

---

## Step 4 — Test your live site (2 min)

1. Open your Vercel URL in a browser.
2. You'll see the login page.
3. Sign in with the email and password you created in Step 1c.
4. You should land on the Dashboard. The Employees page will show your 24 seeded teachers.

If anything is broken, send me a screenshot of the error and I'll diagnose it.

---

## Step 5 (optional) — Use your own domain

Free Vercel URLs work but look temporary. To use, e.g., `payroll.eurokidsjmdenclave.org`:

1. In Vercel project → **Settings → Domains** → **Add**.
2. Enter your subdomain. Vercel shows a CNAME record to add at your domain provider (GoDaddy, Cloudflare, whoever you bought the domain from).
3. Add the CNAME record at your domain provider. Wait ~10 min for DNS propagation.
4. Vercel will issue an SSL certificate automatically. Done.

---

## Adding future HR staff

When you hire a new HR person:

1. Go to Supabase → **Authentication → Users → Add User**, create their email + password.
2. Note their UID.
3. In SQL Editor:
```sql
insert into profiles (id, role, full_name)
values ('NEW_USER_UID', 'admin', 'Their Name');
```
4. Send them the Vercel URL and their credentials.

When you eventually build the teacher portal (next phase), teachers will sign in with phone + password (auto-prepended +91) instead.

---

## Making code changes later

Whenever I update the code in this folder:

1. Open GitHub Desktop. You'll see the changed files.
2. Write a short summary, click **Commit to main** → **Push origin**.
3. Vercel automatically detects the push and redeploys in ~2 minutes.
4. Your live URL has the new code.

That's the entire ongoing maintenance loop.

---

## Cost monitoring

- **Supabase free tier**: 500 MB database, 1 GB file storage, 50,000 monthly active users. You'll use perhaps 50 MB and 30 users. No cost ever, unless usage explodes.
- **Vercel free tier**: 100 GB bandwidth/month. A 30-person staff portal uses ~1 GB. No cost.
- **Domain** (optional): ₹600–1,000/year if you buy one.

If Supabase ever exceeds free tier (which would mean massive growth), it auto-prompts you before charging.
