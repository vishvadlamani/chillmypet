# chillmypet

Multi-store commerce on Cloudflare Workers. A shared domain package plus one
backend-for-frontend per storefront.

```
packages/commerce/     domain modules — catalog, customers, orders, stores, meta
apps/storefront/       SvelteKit BFF: UI, language packs, routes that compose modules
```

## Quick start

```sh
npm install
npm run db:migrate
npm run db:seed
npm run dev            # http://localhost:5173
```

## Architecture

**`@chillmypet/commerce` owns the domain.** Every module is exposed as an
interface — `CatalogService`, `CustomerService`, `OrderService`, `StoreService`,
`MetaService` — with a local, in-process implementation. Nothing in the package
imports a framework or reads `process.env`; configuration is injected, because
the storefront Worker and a standalone module Worker read their environment
differently.

**The storefront is the BFF.** Its `+page.server.ts` files and API routes
compose modules for this specific UI: shaping responses, validating forms,
handling locale. Business rules live in the package; presentation concerns live
in the app. `hooks.server.ts` resolves the tenant and hands routes a ready
`locals.commerce`, so a route handler never constructs a service itself.

**Splitting a module into its own Worker** means writing a second implementation
of its interface that forwards over a [Service
Binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/)
and swapping it in at `createCommerce()`. Call sites don't change. Doing that
before there's a reason to costs a network hop and a deploy pipeline for
nothing, so the module boundaries are drawn now and the split happens when it
pays.

The package ships TypeScript source rather than a build artifact — `exports`
points at `.ts`, Vite transpiles it via `ssr.noExternal`, and Node runs the
tests with `--experimental-strip-types`. That means **no parameter properties,
enums, or namespaces** in the package: type stripping rejects them.

## Multi-tenancy

`store_id` is on every table, denormalized so each query filters by tenant
without a join. Tenants resolve from the `Host` header in `hooks.server.ts`,
falling back to `DEFAULT_STORE_ID` (default `chillmypet`) so localhost and
preview URLs work without a hosts-file entry.

Per-store config lives in the `stores` table: domain, default locale, currency,
Meta pixel id and domain-verification token. Adding a store is a row plus its
catalog — no code change.

`packages/commerce/src/tenancy.test.ts` pins the isolation guarantees: one store
cannot read, price, or order another's variants, and the same email is a
separate customer per store with separate order history. **A leak here is a data
breach, not a bug** — keep those tests green.

## Adding a store

```sh
SEED_STORE_ID=otherstore SEED_STORE_DOMAIN=otherstore.com npm run db:seed
```

Then add its domain to `apps/storefront/wrangler.toml` routes. One Worker serves
every store; the `Host` header picks the tenant.

## Languages

Every customer-facing string lives in
`apps/storefront/src/lib/i18n/locales/<code>.json`. **Adding a language is
adding one file** — packs are discovered with `import.meta.glob`, so no registry
needs updating.

```sh
cp .../locales/en.json .../locales/fr.json   # translate values, keep keys
```

The new language appears in the header switcher automatically, and missing keys
fall back to English rather than rendering a raw key. Locale resolves per
request from cookie, then `Accept-Language`, then the store's default.
Translators are built per render, never stored at module scope — the server
handles many locales concurrently.

Product copy is keyed by slug under `products.<slug>`; the database holds only
commerce data. Colour names are keyed by code (`product.colors.blue_camo`) so
variants translate too. Past a handful of products, move product copy into a
`product_translations` table and keep the packs for UI chrome.

## Content and imagery

Product copy and photography were imported from floatpaw.store at the owner's
direction. See the provenance note in [AGENTS.md](./AGENTS.md#content-and-assets--provenance)
before adding or changing product assets.

Images live in `apps/storefront/static/products/<slug>/<colour>.jpg` and are
referenced per colour via `product_colours.image_path`, so a store without
photography falls back to the tinted SVG placeholder in `ProductImage.svelte`.

## Database

Turso in deployment, a local `local.db` file otherwise, so everything runs
before credentials exist. Schema: `packages/commerce/src/db/schema.sql`.

Two invariants worth preserving:

- **Prices are never trusted from the browser.** The cart stores prices for
  display, but `catalog.priceVariants()` re-reads them on both the `/api/cart`
  summary and the checkout action.
- **Stock decrements are guarded.** `orders.create()` runs
  `update ... where id = ? and store_id = ? and stock >= ?` inside a transaction
  and fails if `rowsAffected` is 0, so concurrent checkouts can't oversell. The
  customer row is created inside that same transaction — no customer for an
  order that rolls back.

## Meta pixel and Conversions API

Browser pixel and server-side Conversions API run together, deduplicated.

- **Public:** pixel id and domain-verification token, stored per store and
  injected into `<head>` by `hooks.server.ts`. Both appear in page source anyway.
- **Secret:** `META_CAPI_ACCESS_TOKEN`, a Worker secret. Never in the repo.

Events: `PageView` (initial load plus every client-side navigation),
`ViewContent`, `AddToCart`, `InitiateCheckout`, `Purchase`.

**Deduplication.** The checkout action mints one `event_id` per order, sends it
with the CAPI Purchase, and returns it to the browser, which fires
`fbq('track', 'Purchase', …, { eventID })` with the same value. Break that and
every sale is counted twice.

**Advanced matching.** `packages/commerce/src/meta/hash.ts` normalizes and
SHA-256 hashes email, phone, name, city, state, zip and country;
`client_ip_address`, `client_user_agent`, `fbp` and `fbc` go unhashed, as Meta
requires. Absent fields are **omitted, never sent as `null`** — a null carries no
signal and lowers match quality. State and country are only sent as 2-letter
codes, since truncating "Texas" to "te" hashes to something matching nobody;
that's why the checkout country field is an ISO select.

Tracking never affects orders: the CAPI call happens after the order commits,
dispatches via `waitUntil` so the customer never waits on Meta, and logs rather
than surfaces failures.

**Verifying.** Set `META_CAPI_TEST_EVENT_CODE` and watch Events Manager > Test
Events. To inspect the exact payload without contacting Meta, point
`META_CAPI_ENDPOINT` at a local server and place an order.

**Before taking EU traffic**, add a consent gate. The pixel currently loads for
everyone, and GDPR/ePrivacy require prior consent for advertising cookies.

## Payment

No payment provider is wired up. Orders are written with status
`pending_payment` and the checkout page says so — **no card details are
collected anywhere**. Add a provider before taking real orders and move the
status transition into its webhook. Tax (EU VAT/OSS, US nexus) is not handled
either; use Stripe Tax rather than building it.

## Testing

```sh
npm run check      # svelte-check across workspaces
npm test           # hashing + tenant isolation, offline

npm i --no-save playwright     # not a dependency; deploys stay lean
npm run dev                    # in another shell, with a seeded DB
npm run test:e2e
```

`npm test` runs offline unit tests: the Meta normalization rules against a
reference SHA-256, and tenant isolation against a throwaway SQLite file. Both
classes of bug are invisible in production — Meta accepts wrong hashes happily,
and a tenancy leak looks like working software.

The browser test drives add-to-cart, cart persistence, out-of-stock variants,
shipping totals, checkout validation and recovery, a real order, every pixel
event, and the language switch. Override the target with `BASE_URL`, and point
Playwright at a browser with `CHROMIUM_PATH` if it can't find one. It writes
orders to whichever database `.env` points at — run it against local SQLite.

## Deploying

```sh
npm run build
npm run deploy
```

Or push to `main` and let `.github/workflows/deploy.yml` run it, once
`CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` are repository secrets. Give
the token the "Edit Cloudflare Workers" template plus **Zone → DNS → Edit** on
each store domain.

Worker secrets:

```sh
cd apps/storefront
npx wrangler secret put TURSO_DATABASE_URL
npx wrangler secret put TURSO_AUTH_TOKEN
npx wrangler secret put META_CAPI_ACCESS_TOKEN
```

### Pointing a domain at the Worker

`apps/storefront/wrangler.toml` declares custom domains, so `wrangler deploy`
creates the DNS records — but only once the domain is an active zone on the same
Cloudflare account. If you registered elsewhere, add the site in the dashboard
and update nameservers at your registrar first. Until then, deploys fail with
"zone not found".
