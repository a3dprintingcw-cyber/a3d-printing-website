# A3D Printing back office

Phase 1: the quote intake, the order inbox and the visitor dashboard, running
on Cloudflare and owned entirely by A3D. Nothing here depends on Formspree.

```
a3dprinting.com/api/quote-request   the form posts here, files land in R2
a3dprinting.com/api/e               privacy friendly page view beacon
a3dprinting.com/api/webhooks/sentoo payment status callbacks
a3dprinting.com/admin               the back office, behind Cloudflare Access
```

The marketing site stays on GitHub Pages exactly as it is. The Worker only
claims those two path prefixes.

## What is in here

| Path | What it does |
|---|---|
| `src/index.js` | router, public intake, admin API, Sentoo webhook |
| `src/access.js` | verifies the Cloudflare Access assertion, fails closed |
| `src/admin-html.js` | the back office UI, one file, no build step |
| `src/sentoo.js` | Sentoo client, with a mock mode until credentials arrive |
| `src/email.js` | new request alert through Cloudflare Email Routing |
| `migrations/0001_init.sql` | the schema |
| `test.mjs`, `test-admin.mjs` | 21 local tests, no cloud account needed |

## Running the tests

```
npm install
node test.mjs        # public intake, uploads, analytics, auth, webhook
node test-admin.mjs  # inbox, statuses, quote maths, prices, customers
```

They run against Miniflare, the same runtime Cloudflare uses, with a throwaway
database. Nothing touches the live site.

## Deploying it, once per machine

1. **Create the pieces** (either in the dashboard or with the CLI):
   ```
   npx wrangler d1 create a3d
   npx wrangler r2 bucket create a3d-uploads
   ```
   Put the database id from the first command into `wrangler.toml`.

2. **Run the migration**
   ```
   npx wrangler d1 migrations apply a3d --remote
   ```

3. **Lock down the admin.** In Cloudflare Zero Trust, add a self hosted
   Access application for `a3dprinting.com/admin` with a policy that allows
   exactly one email, a3dprinting.cw@gmail.com, using the one time PIN login.
   Copy the team name and the application audience tag into `wrangler.toml`
   as `CF_ACCESS_TEAM` and `CF_ACCESS_AUD`. Until those are filled in the
   Worker refuses every admin request, which is the safe default.

4. **Turn on alerts.** Cloudflare Email Routing on the zone, then verify
   a3dprinting.cw@gmail.com as a destination address. Skip this and orders
   still arrive, you just do not get the email nudge.

5. **Deploy**
   ```
   npx wrangler deploy
   ```
   The DNS record for a3dprinting.com has to be proxied (orange cloud) or the
   routes never fire.

6. **Point the site at it.** In `js/config.js` on the website, set
   `apiBase: "https://a3dprinting.com/api"`. See `site-integration.md` for the
   exact change to `main.js`. Formspree can be cancelled after the first real
   request lands in the inbox.

## Secrets

Never in the repo. Set them with `wrangler secret put NAME`:

```
SENTOO_MERCHANT     merchant uid from the Sentoo portal
SENTOO_SECRET       value for the X-SENTOO-SECRET header
```

Until those exist the Worker runs `SENTOO_MODE=mock`: quotes still get a
payment link, it just points at a sandbox placeholder so the flow can be
clicked through end to end. Flip `SENTOO_MODE` to `live` when the real
credentials land and Sentoo has approved the integration.

Phase 2 adds `QBO_*` for the QuickBooks estimates and `GMAIL_*` for sending
the quote from the business address.

## Things that were deliberate

- **Money is integer cents in XCG.** No floats anywhere near a price.
- **The webhook trusts nothing.** Sentoo only sends a transaction id, so the
  handler fetches the real status, applies it once, and answers 200 even for
  unknown ids so their retry loop stops.
- **Analytics stores no personal data.** The visitor column is a salted hash
  of IP and user agent that rotates daily, there are no cookies, and admin
  paths are never recorded.
- **Uploads are checked server side** for extension and size. The browser
  limit is a convenience, not a control.
- **A broken mail setup cannot lose an order.** The alert is best effort and
  the request is saved first.
