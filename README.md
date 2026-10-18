# Stub

An expense tracker for receipts and returns. You can:

- Scan a receipt to fill in the store, date, total, card and category. Every field stays editable before and after saving.
- Log purchases and returns. A return links to the purchase it came from, and the money comes off that category and card.
- Save cards once (a nickname and the last 4 digits only), then pick one when you log an expense.
- Use the default categories, edit them, or add your own with an icon, color and optional monthly budget.
- See personalized monthly insights in the app, and get them by email on the 1st.
- Sign up with an email and password, or with Google. Forgotten passwords are reset with a 6-digit code sent by email.

Built with Next.js 16, TypeScript, Tailwind v4, shadcn/ui (Base UI), Prisma + Postgres, Better Auth, Resend, and Claude for reading receipts.

## Run it locally

```bash
npm install
cp .env.example .env        # set DATABASE_URL and BETTER_AUTH_SECRET (npx @better-auth/cli secret)
npx prisma migrate deploy   # creates the tables
npm run dev                 # http://localhost:3000
```

`DATABASE_URL` can be your Neon database's URL, or a throwaway local Postgres from `npx prisma dev`
(it prints the URL to use).

npm 11 blocks install scripts by default. If Prisma fails to load, run
`npm install-scripts approve prisma @prisma/engines` and then `npm rebuild`.

To fill an account with four months of sample data:

```bash
npm run db:seed-demo -- you@example.com [password]
```

Then sign in with that email and password (default `stub-demo-123`).

## Optional services

Leave a key empty in `.env` and the app falls back to a local option.

| Feature | Env vars | Without them |
|---|---|---|
| Google sign-in | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | The Google button is hidden; email and password still work |
| Email (password reset codes, monthly reports) | `RESEND_API_KEY`, `EMAIL_FROM` | Emails print to the server console |
| Receipt scanning with Claude | `ANTHROPIC_API_KEY`, `RECEIPT_MODEL` | Scanning uses on-device OCR (Tesseract), which is less accurate |
| Monthly report job | `CRON_SECRET` | `/api/cron/monthly` refuses requests |

**Google OAuth:** create a Web client at console.cloud.google.com → APIs & Services → Credentials. Add
`http://localhost:3000/api/auth/callback/google` as a redirect URI (and your production URL's equivalent).

**Receipt model:** defaults to `claude-opus-5-5`. To cut cost per scan, set `RECEIPT_MODEL=claude-haiku-5-5`.
Requests opt into server-side refusal fallbacks (`fallbacks: "default"`).

**Monthly emails:** `vercel.json` calls `GET /api/cron/monthly` at 14:00 UTC on the 1st. Anywhere else, call it with
`Authorization: Bearer $CRON_SECRET`. Each user gets each month once, so re-running it is safe. Settings → "Send
last month's report now" sends one on demand.

## Deploying to Vercel

1. Import the GitHub repo in Vercel.
2. In the project, open **Storage → Create Database → Neon** and connect it to the project. This sets
   `DATABASE_URL` and `DATABASE_URL_UNPOOLED`.
3. In **Settings → Environment Variables**, add `BETTER_AUTH_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM`, `CRON_SECRET`,
   and optionally `ANTHROPIC_API_KEY`, `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. `BETTER_AUTH_URL` can be left
   unset; the production domain is used.
4. Redeploy. Each build runs `prisma migrate deploy` before `next build`, so the tables are created automatically.

Receipt photos are stored in the database as downscaled JPEGs. At scale, move them to blob storage.

## Where things are

- `app/page.tsx`: the landing page. The hero uses `components/ui/container-scroll-animation.tsx` (21st.dev).
- `app/(app)/*`: the signed-in app (overview, expenses, cards, categories, insights, settings).
- `components/stub/expense-sheet.tsx`: the add and edit panel, including receipt scanning and returns.
- `lib/actions.ts`: server actions for every change, each checked against the signed-in user.
- `lib/insights.ts`: the monthly insight rules. `lib/report.ts` turns them into the email.
- `app/api/receipts/scan/route.ts`: Claude receipt extraction. `lib/ocr.ts` is the on-device fallback.
