# Setting up accounts: Supabase, Google sign-in, analytics

NINES works with none of this: guests play fully and progress stays in their browser. This guide turns on the optional parts: sign-in (Google or an emailed link/code), saved progress, the `/admin` page, and analytics.

**Where the secrets go.** Put every value in `.env.local` (copy `.env.example`) for local runs, and in your host's environment settings (for example Vercel → Project → Settings → Environment Variables) for the public site. Don't paste secrets into chat, issues, or commits. `.env*` files are gitignored.

Menu names in the Supabase, Google and PostHog dashboards change now and then; if a label differs slightly, look for the nearest match.

---

## 1. Create the Supabase project

1. Sign in at <https://supabase.com> and choose **New project**.
2. Pick a name (for example `nines`), a strong database password (save it in a password manager; the app doesn't use it), and the region closest to your players.
3. Wait for the project to finish provisioning.

## 2. Create the tables

1. In the project, open **SQL Editor → New query**.
2. Paste the whole of [`supabase/migrations/20261007000000_init.sql`](supabase/migrations/20261007000000_init.sql) and press **Run**. It is safe to run twice.
3. Check **Table Editor** shows `profiles`, `progress`, `saves`, `ai_usage`, `feedback`, `counters` and `rate_limits`, each with the RLS (row level security) shield on.

What this sets up: a profile row is created automatically for every new account; browsers can **read their own** profile, progress and save and nothing else; **all writes go through the NINES server**, which validates them first and rate-limits them. There are deliberately no insert/update/delete policies for browsers. (If you use the Supabase CLI: `supabase link` then `supabase db push` does the same.)

## 3. Get the project keys

**Project Settings → API** (or **API Keys**):

| Variable | Which value | Secret? |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL, like `https://abcdxyz.supabase.co` | no |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | The `anon` public key, or the **publishable** key (`sb_publishable_…`) | no, safe in the browser |
| `SUPABASE_SERVICE_ROLE_KEY` | The `service_role` key, or the **secret** key (`sb_secret_…`) | **yes, server only** |

The service-role key bypasses row level security. Never prefix it with `NEXT_PUBLIC_`, never commit it, and rotate it if it ever leaks.

## 4. Allow your site's address

**Authentication → URL Configuration**:

- **Site URL**: your public address, for example `https://nines.example.com` (use `http://localhost:3100` while testing locally).
- **Redirect URLs**: add both
  - `https://nines.example.com/auth/callback`
  - `http://localhost:3100/auth/callback`

Also set `NEXT_PUBLIC_SITE_URL` to the public address in your environment.

## 5. Email sign-in (link and code, no passwords)

**Authentication → Sign In / Providers → Email**: make sure **Enable Email provider** is on. Leave passwords off or unused; NINES never asks for one.

**Authentication → Email Templates.** NINES sends both a link and a 6-digit code, so players on a phone can type the code if the link opens in the wrong browser. Edit **two** templates, because new players receive "Confirm signup" and returning players receive "Magic Link". Put this in the body of both:

```html
<h2>Your NINES sign-in</h2>
<p><a href="{{ .ConfirmationURL }}">Open NINES and sign in</a></p>
<p>Or type this code into NINES: <strong>{{ .Token }}</strong></p>
<p>If you didn't ask for this, ignore this email.</p>
```

**Email limits.** Supabase's built-in email sender is for testing only and allows very few emails per hour. Before sharing the site publicly, set up your own SMTP under **Project Settings → Authentication → SMTP Settings** (Resend, Postmark, Amazon SES, Brevo and others all work), and raise the rate limits under **Authentication → Rate Limits** to match.

## 6. Google sign-in ("Continue with Google")

**A. In Google Cloud Console** (<https://console.cloud.google.com>):

1. Create a project (or pick one).
2. **APIs & Services → OAuth consent screen** (the newer UI calls this **Google Auth Platform**): choose **External**, fill in the app name (for example NINES), your support email and a developer contact email. Under scopes keep only the defaults: `email`, `profile`, `openid`. Add your **privacy policy link** (`https://nines.example.com/privacy`) and authorised domain. Publish the app (move it from "Testing" to "In production") so anyone can sign in, not only listed test users.
3. **Credentials → Create credentials → OAuth client ID**:
   - Application type: **Web application**.
   - **Authorized JavaScript origins**: `https://nines.example.com` and `http://localhost:3100`.
   - **Authorized redirect URIs**: exactly `https://<your-project-ref>.supabase.co/auth/v1/callback` (copy it from the Google provider page in Supabase, step B). Google redirects to Supabase first, and Supabase then sends the player to NINES.
4. Copy the **Client ID** and **Client secret**.

**B. In Supabase**: **Authentication → Sign In / Providers → Google**: enable it, paste the Client ID and Client secret, save. Supabase shows the callback URL to use in step A.3.

Google sign-in shares the player's email and name with NINES. The admin page shows the email; that is described on `/privacy`.

## 7. Admin access and privacy contact

```
ADMIN_EMAILS=you@example.com            # comma-separated; sign in with Google or a link using this address, then open /admin
PRIVACY_CONTACT_EMAIL=privacy@example.com   # shown on /privacy; read when the site is built, so redeploy after changing it
```

`/admin` returns a plain 404 for anyone who is not on the list, and the check happens on the server. An address only counts as admin once Supabase has confirmed it (a Google account, or an emailed link/code that was used).

## 8. Analytics (optional): PostHog

Skip this and nothing is collected; the admin funnel's "Visited" and "Started a level" rows show n/a.

1. Create a free project at <https://posthog.com> (choose the US or EU cloud).
2. **Project settings**: copy the **Project API key** → `NEXT_PUBLIC_POSTHOG_KEY`, and set `NEXT_PUBLIC_POSTHOG_HOST` to `https://us.i.posthog.com` or `https://eu.i.posthog.com`.
3. To show those two numbers inside `/admin`, also create a **personal API key** (your account menu → Personal API keys, with the "Query: read" scope) → `POSTHOG_PERSONAL_API_KEY`, and copy the numeric **project id** from the project settings → `POSTHOG_PROJECT_ID`. If you use the EU cloud, also set `POSTHOG_API_HOST=https://eu.posthog.com`.

What it records: counts of `visit`, `briefing_*`, `tour_*`, `level_started`, `level_completed`, `section_completed` and the sign-up prompt steps. No cookies, no typed content, no person profiles, and it stays off for players who switch it off in Settings or send Do Not Track. Visits are counted per page load, not as unique people.

## 9. The AI coach (optional)

- **Shared coach:** `GROQ_API_KEY` (server only) plus `NINES_MONTHLY_BUDGET_USD`, as before. Set `IP_HASH_SALT` to any random string.
- **Players' own keys:** nothing to configure. In Settings → "Your own API key" a player can paste a Groq or Claude key. It is stored only in their browser and their browser calls the provider directly, so it never reaches your server.

## 10. Check it works

Run `npm run dev` (port 3100) and, in a private window:

1. Play **Latency Numbers** as a guest. After the debrief a "Want to keep this?" card appears. Level 1 itself is never behind sign-in.
2. Click **Save my progress** → continue with Google, or enter an email and use the link or the code.
3. In Supabase **Table Editor**, `profiles` has your row and `progress` has `a1 / latency-numbers / completed`.
4. Settings → **Delete my account and data**: the profile, progress and save rows disappear.
5. Sign in with an `ADMIN_EMAILS` address and open `/admin`.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| "Sign-in isn't set up on this server yet" | `NEXT_PUBLIC_SUPABASE_URL` or the anon key is missing, or the server wasn't restarted after setting it. |
| Google says `redirect_uri_mismatch` | The redirect URI in Google must be exactly `https://<project-ref>.supabase.co/auth/v1/callback`. |
| Google says "disallowed_useragent" (or an error page) for people coming from LinkedIn | Google blocks sign-in inside an app's built-in browser. NINES detects LinkedIn, Facebook, Instagram and Android web views and offers the emailed code instead; people can also open the page in Chrome or Safari. |
| Back from Google but still a guest | Add `/auth/callback` to Supabase **Redirect URLs** (step 4). |
| Email link opens but sign-in fails | Links work only in the browser that asked for them; use the code from the same email instead. |
| No email arrives | Built-in sender limits (step 5), or spam. Set up SMTP. |
| Signed in, but progress isn't saved | `SUPABASE_SERVICE_ROLE_KEY` is missing; reads work with the public key but writes need the server key. Check `/api/me` shows `"storage":"supabase"`. |
| `/admin` is a 404 | Your email isn't in `ADMIN_EMAILS`, or you're signed in with a different address. |

## What can and can't be trusted

The simulations run in the player's browser, so the server cannot prove a level was really played. What it does enforce on every write: only real levels in this build, in the right section, with prerequisites completed; scores 0 to 100; a finished level never goes backwards; the completion time is set by the server; at most 20 writes a minute per player. Treat progress as honest-effort learning data, not as anti-cheat; don't build a public leaderboard on it.
