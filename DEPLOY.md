# Deploying NINES (Vercel + Supabase)

The public build: anyone can play as a guest (progress in their browser), sign in with Google or an emailed link to keep progress across devices, and use the AI coach within daily limits or with their own key. Admins (emails in `ADMIN_EMAILS`) get `/admin`. See DECISIONS D-021 and D-022.

Total cost at launch: $0 (Vercel Hobby, Supabase free tier, PostHog free tier, Groq free tier) plus AI spend, capped by `NINES_MONTHLY_BUDGET_USD`. Supabase's built-in email sender is for testing only; add your own SMTP before a public launch.

**All account, database, Google sign-in and analytics setup is in [SUPABASE_SETUP.md](SUPABASE_SETUP.md).** This page covers hosting.

## 1. Vercel project (about 5 minutes)
1. Sign in at vercel.com with GitHub and **Add New → Project → Import** this repository. Framework: Next.js, defaults are fine.
2. Add the environment variables below, then deploy.

## 2. Environment variables (Project → Settings → Environment Variables)
Every variable, with comments, is in [`.env.example`](.env.example). For production set:

| Name | Notes |
|---|---|
| `NEXT_PUBLIC_SITE_URL` | your public address, no trailing slash |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public; from Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | **secret**, server only |
| `ADMIN_EMAILS` | comma-separated admin sign-in emails |
| `PRIVACY_CONTACT_EMAIL` | shown on `/privacy`; redeploy after changing |
| `GROQ_API_KEY`, `NINES_MONTHLY_BUDGET_USD`, `IP_HASH_SALT` | the shared AI coach and its hard cap |
| `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST` | optional analytics |
| `POSTHOG_PROJECT_ID`, `POSTHOG_PERSONAL_API_KEY` | optional, to show Visited/Started in `/admin` |

Optional quota tuning: `NINES_GUEST_GRADES_PER_DAY` (5), `NINES_GUEST_HINTS_PER_DAY` (10), `NINES_PLAYER_GRADES_PER_DAY` (20), `NINES_PLAYER_HINTS_PER_DAY` (40).

Never set `NINES_DEV_LOGIN=1` on a public site: it exists only for local runs and the e2e suite, and it is ignored once Supabase is configured.

Redeploy after changing variables (Deployments → ⋯ → Redeploy). `NEXT_PUBLIC_*` values and `PRIVACY_CONTACT_EMAIL` are baked in at build time.

## 3. Check it
- Open the site in a private window: the briefing plays (skippable), then the guided tour. Play Latency Numbers; the "Want to keep this?" card appears after the debrief.
- Sign in with Google and with an email link; Settings shows "Signed in", and Supabase's `progress` table has your row.
- Settings → "Your own API key": paste a test key, "Test key" succeeds, and the browser's network tab shows the request going to `api.groq.com` or `api.anthropic.com` only, never to this site.
- Sign in with an `ADMIN_EMAILS` address: `/admin` loads. Signed out, `/admin` and `/dev/seed` are plain 404s.
- Paste the URL into a LinkedIn post draft: the preview card should show "Learn system design by breaking systems."
- Open it on a phone and play one mission end to end.
- Settings → Delete my account and data removes the rows in Supabase.

## Limits worth knowing
- Groq's free tier allows 30 requests/min and 8,000 tokens/min across all players using the shared key. Past that, or past a quota or budget, the coach quietly falls back to self-grading. Players with their own key are unaffected.
- Guests' progress lives in their browser only; clearing site data loses it. The briefing and Settings say so.
- Magic links work only in the browser that requested them; the email also carries a code that works anywhere.
