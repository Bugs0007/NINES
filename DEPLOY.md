# Deploying NINES (Vercel + Neon)

The public build: anyone can play as a guest (progress in their browser), sign in with Google or GitHub to sync progress across devices, and use the AI coach within daily limits. Owners (emails in `OWNER_EMAILS`) get the personal edition and `/admin`. See DECISIONS D-021.

Total cost at launch: $0 (Vercel Hobby, Neon free tier, Groq free tier) plus AI spend, capped by `NINES_MONTHLY_BUDGET_USD`.

## 1. Vercel project (about 5 minutes)
1. Sign in at vercel.com with GitHub and **Add New → Project → Import** `Bugs0007/NINES` (private repos work on Hobby). Framework: Next.js, defaults are fine.
2. Before the first deploy, open **Storage → Create → Neon (Postgres)** and connect it to the project. This sets `DATABASE_URL`. Tables are created automatically on first use.

## 2. Environment variables (Project → Settings → Environment Variables)
| Name | Value |
|---|---|
| `AUTH_SECRET` | a random 32-byte string: `npx auth secret` prints one, or `openssl rand -base64 32` |
| `OWNER_EMAILS` | your sign-in email(s), comma-separated |
| `GROQ_API_KEY` | your Groq key |
| `NINES_MONTHLY_BUDGET_USD` | e.g. `10` (hard cap for everyone, per month) |
| `NINES_DAILY_BUDGET_USD` | optional, default monthly / 10 |
| `IP_HASH_SALT` | any random string (guests' quota keys are salted hashes, never raw addresses) |
| `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` | from step 3 |
| `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET` | from step 3 |
| `NEXT_PUBLIC_SITE_URL` | optional, e.g. `https://nines.vercel.app` (link previews use it; Vercel's production URL is used otherwise) |

Optional quota tuning: `NINES_GUEST_GRADES_PER_DAY` (5), `NINES_GUEST_HINTS_PER_DAY` (10), `NINES_PLAYER_GRADES_PER_DAY` (20), `NINES_PLAYER_HINTS_PER_DAY` (40).

Never set `NINES_DEV_LOGIN=1` in production: it enables passwordless email sign-in for testing.

## 3. Sign-in providers (both optional; at least one is needed for accounts)
- **GitHub**: github.com → Settings → Developer settings → OAuth Apps → New. Homepage `https://<your-app>.vercel.app`, callback `https://<your-app>.vercel.app/api/auth/callback/github`. Copy the Client ID and a new Client Secret.
- **Google**: console.cloud.google.com → APIs & Services → Credentials → Create OAuth client ID (Web). Authorized redirect URI `https://<your-app>.vercel.app/api/auth/callback/google`. Configure the consent screen (External, app name NINES) and publish it.

Redeploy after adding variables (Deployments → ⋯ → Redeploy).

## 4. Check it
- Open the site in a private window: the welcome intro plays, a mission works, Settings shows "Playing as a guest" and the sign-in buttons.
- Sign in with your owner email: Settings shows "Owner"; `/admin` loads; a Codex card (e.g. Little's Law, once built) shows your Case Intel notes.
- `/dev/seed` returns 404 for everyone except the owner.
- Paste the URL into a LinkedIn post draft: the preview card should show "Learn system design by breaking systems."
- Open it on your phone and play one mission end to end.

## Limits worth knowing
- Groq's free tier allows 30 requests/min and 8,000 tokens/min across all players. Past that, or past a quota or budget, the coach quietly falls back to self-grading. Upgrade the Groq plan if launch traffic needs it.
- Guests' progress lives in their browser only; clearing site data loses it. The game says so in Settings and the welcome intro.
