# chillmypet

SvelteKit storefront for chillmypet.com — product detail page and checkout,
backed by Turso/libSQL, deployed to Cloudflare Workers.

## Quick start

```sh
npm install
cp .env.example .env      # optional; without it you get a local SQLite file
npm run db:migrate
npm run db:seed
npm run dev               # http://localhost:5173
```

Routes: `/` (landing), `/products/dog-life-jacket`, `/checkout`,
`POST /api/cart` (server-side re-pricing), `POST /locale` (language switch).

## Content and imagery

The layout follows standard e-commerce conventions, but **all copy is original
and the artwork is placeholder**. `src/lib/components/ProductImage.svelte` draws
a tinted SVG per colour rather than shipping photography — swap it for real
product images before launch. Nothing here reuses another store's brand name,
photos, or marketing text.

## Languages

Every customer-facing string lives in `src/lib/i18n/locales/<code>.json`.
**Adding a language is adding one file** — `src/lib/i18n/index.ts` discovers
packs with `import.meta.glob`, so no registry needs updating.

```sh
cp src/lib/i18n/locales/en.json src/lib/i18n/locales/fr.json
# translate the values, keep the keys
```

The new language appears in the header switcher automatically. Anything missing
from a pack falls back to English rather than rendering a raw key.

How it resolves per request: `src/hooks.server.ts` reads the `locale` cookie,
falls back to `Accept-Language`, and puts the result on `event.locals.locale`.
The layout load passes it to the client, and components build a translator with
`createTranslator(locale)`. Translators are created per render, never stored at
module scope — the server handles many locales concurrently.

Product copy is keyed by slug under `products.<slug>` in each pack; the database
holds only commerce data (prices, SKUs, stock). Colour names are keyed by code
(`product.colors.blue_camo`) so variants translate too. If the catalogue grows
past a handful of products, move product copy into a `product_translations`
table and keep the packs for UI chrome.

## Database

Turso in deployment, a local `local.db` file otherwise, so everything runs
before credentials exist. Schema lives in `src/lib/server/schema.sql`.

```sh
npm run db:migrate    # apply schema (idempotent)
npm run db:seed       # one product, 10 colours, 5 sizes, 50 variants
```

To point at Turso, set `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` in `.env`,
then re-run both commands to provision the remote database.

Two invariants worth preserving:

- **Prices are never trusted from the browser.** The cart stores prices for
  display, but `priceVariants()` re-reads them from the database on both the
  `/api/cart` summary and the checkout action.
- **Stock decrements are guarded.** `createOrder()` runs
  `update ... where id = ? and stock >= ?` inside a transaction and fails the
  order if `rowsAffected` is 0, so concurrent checkouts can't oversell.

## Meta pixel and Conversions API

Browser pixel and server-side Conversions API run together, deduplicated.

- **Public, in the repo:** the pixel id (`src/lib/analytics/meta.ts`), the base
  snippet and the `facebook-domain-verification` tag (`src/app.html`). All three
  are visible in page source anyway.
- **Secret, never in the repo:** `META_CAPI_ACCESS_TOKEN`. Set it as a Worker
  secret in production and in `.env` locally.

Events: `PageView` (initial load plus every client-side navigation),
`ViewContent`, `AddToCart`, `InitiateCheckout`, and `Purchase`.

**Deduplication.** The checkout action mints one `event_id` per order, sends it
to the Conversions API, and returns it to the browser, which fires
`fbq('track', 'Purchase', …, { eventID })` with the same value. Both copies
reach Meta and are counted once. Break that and every sale is counted twice.

**Advanced matching.** `src/lib/analytics/hash.ts` normalizes and SHA-256 hashes
email, phone, name, city, state, zip and country before sending;
`client_ip_address`, `client_user_agent`, `fbp` and `fbc` are sent unhashed, as
Meta requires. Two rules worth keeping:

- Absent fields are **omitted**, never sent as `null` — a null carries no signal
  and lowers the reported match quality.
- State and country are only sent when they are already 2-letter codes.
  Truncating "Texas" to "te" would hash to something matching nobody, which is
  worse than sending nothing. This is why the checkout country field is an ISO
  select rather than free text.

Tracking never affects orders: the Conversions API call happens after the order
commits, is dispatched via `waitUntil` so the customer never waits on Meta, and
any failure is logged rather than surfaced.

**Verifying.** Set `META_CAPI_TEST_EVENT_CODE` and watch Events Manager >
Test Events. To inspect the exact payload without contacting Meta, point
`META_CAPI_ENDPOINT` at a local server and place an order.

**Before taking EU traffic**, add a consent gate. The pixel currently loads for
everyone, and GDPR/ePrivacy require prior consent for advertising cookies.
`fbq('consent', 'revoke')` until granted is the usual approach.

## Payment

No payment provider is wired up. Placing an order writes it with status
`pending_payment` and the checkout page says so — **no card details are
collected anywhere**. Add a provider (Stripe, Cloudflare's payment partners)
before taking real orders, and move the status transition into its webhook.

## Testing

```sh
npm run check                  # svelte-check
npm test                       # CAPI normalization + hashing, offline
npm i --no-save playwright     # not a dependency; deploys stay lean
npm run dev                    # in another shell, with a seeded DB
npm run test:e2e
```

`npm test` runs `tests/capi.test.ts`, which pins the advanced-matching rules
against a reference SHA-256. Those bugs are invisible in production — Meta
accepts wrong hashes happily and simply matches nobody.

If Playwright can't find a browser (sandboxes often ship their own), point it at
one: `CHROMIUM_PATH=/path/to/chromium npm run test:e2e`.

The end-to-end script drives a real browser through add-to-cart, cart
persistence across reload, out-of-stock variants, shipping-method totals,
checkout validation failure and recovery, a real order, and the language
switch. It writes an order to whichever database `.env` points at, so run it
against local SQLite, not production. Screenshots land in `tests/screenshots/`.

## Deploying

```sh
npm run build
npx wrangler deploy
```

Or push to `main` and let `.github/workflows/deploy.yml` do it, once
`CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` are set as repository
secrets. Give the token the "Edit Cloudflare Workers" template plus
**Zone → DNS → Edit** on chillmypet.com so it can attach the custom domains.

Set the database secrets on the Worker too:

```sh
npx wrangler secret put TURSO_DATABASE_URL
npx wrangler secret put TURSO_AUTH_TOKEN
npx wrangler secret put META_CAPI_ACCESS_TOKEN
```

### Pointing chillmypet.com at the Worker

`wrangler.toml` declares `chillmypet.com` and `www.chillmypet.com` as custom
domains, so `wrangler deploy` creates the DNS records itself — but only once the
domain is an active zone on the same Cloudflare account. If you registered it
elsewhere, add the site in the Cloudflare dashboard and update the nameservers
at your registrar first. Until then, deploys fail with "zone not found".

Verify with:

```sh
curl https://chillmypet.com/api/cart -X POST -d '{"lines":[]}'
```
