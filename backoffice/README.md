# A3D Printing back office

Everything from "someone fills in the quote form" to "paid, start printing",
running on Cloudflare and owned entirely by A3D. No Formspree, no third party
analytics, no plugin subscriptions.

```
app.a3dprinting.com/admin              the back office, behind Cloudflare Access
app.a3dprinting.com/api/quote-request  the site's forms post here, files land in R2
app.a3dprinting.com/api/e              privacy friendly page view beacon
app.a3dprinting.com/api/webhooks/sentoo payment status callbacks
app.a3dprinting.com/api/health         are we alive
```

The marketing site stays on GitHub Pages exactly where it is. The Worker lives
on its own subdomain, so nothing about a3dprinting.com's DNS had to change.

## The chain, end to end

1. A customer submits the quote form. The request, the customer and any STL or
   photo are saved, and the customer gets a reference like `A3D-0007`.
2. It shows up in the back office inbox. Open it, add lines from the price list
   (or type your own), and the total adds itself up.
3. Press **Send**. The quote email goes out from a3dprinting.cw@gmail.com with
   the lines, the total, and a **Pay** button. The payment link is built from
   the quote total, so the amount can never drift from what was quoted.
4. The customer pays. The order flips to **paid** by itself, three ways over:
   Sentoo's webhook, a poll every five minutes in case the webhook is lost, and
   a manual *mark as paid* button for the day something goes sideways.

## What is in here

| Path | What it does |
|---|---|
| `src/index.js` | router, public intake, admin API, Sentoo webhook, cron poller |
| `src/access.js` | verifies the Cloudflare Access assertion, fails closed |
| `src/admin-html.js` | the back office UI, one file, no build step |
| `src/sentoo.js` | Sentoo client, with a mock mode until credentials arrive |
| `src/gmail.js` | sends from the business address, builds the quote email |
| `src/email.js` | new request alerts, through the same Gmail connection |
| `migrations/0001_init.sql` | the schema |
| `test.mjs`, `test-admin.mjs` | 25 local tests, no cloud account needed |

## Running the tests

```
npm install
node test.mjs        # public intake, uploads, analytics, auth, webhook
node test-admin.mjs  # inbox, statuses, quote maths, send, payment, prices
```

They run against Miniflare, the same runtime Cloudflare uses, with a throwaway
database. Nothing touches the live site.

## What is already live

- D1 database `a3d`, migrated.
- R2 bucket `a3d-uploads`.
- Worker `a3d-backoffice` on `app.a3dprinting.com`, cron every 5 minutes,
  workers.dev route deliberately off.
- Cloudflare Access application on `app.a3dprinting.com/admin`, one policy,
  one allowed email, one time PIN. Team domain `a3dprinting.cloudflareaccess.com`.
- The website's forms post here (`apiBase` in `js/config.js`).

## Secrets

Never in the repo. Set them with `wrangler secret put NAME`, or in the
dashboard under the Worker's settings:

```
SENTOO_MERCHANT      merchant uid from the Sentoo portal
SENTOO_SECRET        value for the X-SENTOO-SECRET header
GMAIL_CLIENT_ID      Google Cloud OAuth client
GMAIL_CLIENT_SECRET
GMAIL_REFRESH_TOKEN  one time consent, then it refreshes itself
QBO_CLIENT_ID        Intuit app, for QuickBooks estimates
QBO_CLIENT_SECRET
QBO_REFRESH_TOKEN
```

Until Sentoo's exist the Worker runs `SENTOO_MODE=mock`: quotes still get a
payment link, it just points at a sandbox placeholder so the whole flow can be
clicked through. Flip `SENTOO_MODE` to `live` when the real credentials land
and Sentoo has approved the integration.

Until the Gmail secrets exist, **Send** does not fail: it saves the quote, makes
the payment link, and hands it back so it can be pasted into an email by hand.

## Things that were deliberate

- **Money is integer cents in XCG.** No floats anywhere near a price.
- **The webhook trusts nothing.** Sentoo only sends a transaction id, so the
  handler fetches the real status, applies it once, and answers 200 even for
  unknown ids so their retry loop stops.
- **Access covers `/admin` only**, so the public form can still post to
  `/api/quote-request`. Every admin route verifies the Access token itself and
  refuses when the settings are missing, so the lock does not depend on one
  dashboard toggle staying right.
- **Analytics stores no personal data.** The visitor column is a salted hash of
  IP and user agent that rotates daily, there are no cookies, and admin paths
  are never recorded.
- **Uploads are checked server side** for extension and size. The browser limit
  is a convenience, not a control.
- **A broken mail setup cannot lose an order.** The alert is best effort and the
  request is saved first.
