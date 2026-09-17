# chillmypet

Multi-store commerce on Cloudflare Workers. A shared domain package plus one
backend-for-frontend per storefront.

```
packages/ecomwithai/   the open-source framework (edit here; sync out to publish)
apps/storefront/       SvelteKit BFF: UI, language packs, routes that compose modules
```

This store runs on [ecomwithai](https://github.com/vishvadlamani/ecomwithai), the
Apache-2.0 framework extracted from it. Dogfooding is deliberate: the storefront
is the first real traffic the framework sees, and anything awkward here is a
framework bug.

## Quick start

```sh
npm install
npm run db:migrate
npm run db:seed
npm run dev            # http://localhost:5173
```

## Architecture

**`ecomwithai` owns the domain.** Every module is exposed as an
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

`packages/ecomwithai/src/commerce.test.ts` pins the isolation guarantees: one store
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

UI chrome lives in `apps/storefront/src/lib/i18n/locales/<code>.json`. **Adding
a pack is adding one file** — packs are discovered with `import.meta.glob`, so
no registry needs updating.

```sh
cp .../locales/en.json .../locales/fr.json   # translate values, keep keys
```

The new language appears in the header switcher automatically, and missing keys
fall back to English rather than rendering a raw key. Locale resolves per
request from cookie, then `Accept-Language`, then the store's default.
Translators are built per render, never stored at module scope — the server
handles many locales concurrently.

Product copy is **not** in the packs. Titles and descriptions live in
`product_translations` and structured blocks — size chart, FAQ — in
`product_metafields`, both keyed by locale, because they are catalogue data that
changes per store rather than interface text shared across all of them. So a new
language is one pack file *plus* a row per translated product; the seed writes
both. What the packs still carry for the catalogue is option-value labels
(`product.colors.blue_camo`), keyed by code so variant swatches translate
without duplicating a row per colour.

## Content and imagery

Product copy and photography were imported from floatpaw.store at the owner's
direction. See the provenance note in [AGENTS.md](./AGENTS.md#content-and-assets--provenance)
before adding or changing product assets.

Images live in `apps/storefront/static/products/<slug>/<colour>.jpg` and are
rows in `product_media`. An image tied to a swatch carries the
`option_value_id` it depicts, so selecting a colour scrolls the gallery to that
photo; `option_value_id` null means the shot is for the product as a whole. A
store without photography falls back to the tinted SVG placeholder in
`ProductImage.svelte`.

## Database

Turso in deployment, a local `local.db` file otherwise, so everything runs
before credentials exist. Schema: `packages/ecomwithai/src/db/schema.ts`.

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

There is **one** pixel. A second would take browser events and no server copy —
a CAPI token is scoped to a single dataset — so it would report only what iOS
and ad blockers let through. This store ran that way for a month with the ad
account's own pixel as the second one, and the campaign showed no conversions
the entire time.

Events: `PageView` (initial load plus every client-side navigation),
`ViewContent`, `AddToCart`, `InitiateCheckout` (once per cart per session, not
once per view of `/checkout`), `AddPaymentInfo`, `Purchase`.

**Deduplication.** Purchase's `event_id` is derived from the order number by
`purchaseEventId()` rather than minted per call: the server event fires from the
Stripe webhook and the browser event from the success page, two separate requests
that cannot hand each other a value. Break the pairing and every sale is counted
twice.

**Timing.** Purchase is reported when the payment settles, not when the order row
is written — otherwise every abandoned checkout is a conversion, and Meta
optimizes spend against whatever it is told. With no payment provider configured
there is nothing to settle, so it fires at order creation instead.

**Advanced matching.** `packages/ecomwithai/src/marketing/hash.ts` normalizes and
SHA-256 hashes email, phone, name, city, state, zip, country and `external_id`;
`client_ip_address`, `client_user_agent`, `fbp` and `fbc` go unhashed, as Meta
requires. Absent fields are **omitted, never sent as `null`** — a null carries no
signal and lowers match quality. State and country are only sent as 2-letter
codes, since truncating "Texas" to "te" hashes to something matching nobody;
that's why the checkout country field is an ISO select.

**Who a PageView is.** `apps/storefront/src/lib/server/identity.ts` is the one
source of that, for the browser pixel and the Conversions API alike. PageView is
the event with the least to say — nobody has typed into a form yet — so it is
scored on whatever the request itself carries, and left alone that is an IP and
a user agent:

| cookie | set by | carries |
| --- | --- | --- |
| `_fbc` | us, from `?fbclid=` | the click id, kept past the landing URL |
| `_fbp` | us, when Meta's script never ran | a browser id |
| `cmp_vid` | us, first request | `external_id`, an opaque visitor id |
| `cmp_match` | us, at checkout | hashed `em` and `ph`, for later visits |

Meta's own two are only set if `fbevents.js` ran, which for a visitor running a
blocker it did not — so both are minted server-side in their own format, which
their script then adopts rather than replaces. Ours are `httpOnly`: nothing in
the browser reads them, and the snippet is server-rendered and already holds the
hashes — page-readable would only buy a third-party script a way to lift them.

`cmp_match` holds digests, never plaintext — it is what the Conversions API
wants anyway, so nothing has to un-hash it, and a hash of an email is not the
leak an email is. The same digests go into `fbq('init', …)`, so the browser and
server halves of an event resolve to one person instead of two. A raw field
always beats a remembered hash, so a shared device cannot relabel someone else's
purchase.

Tracking never affects orders: the CAPI call happens after the order commits,
dispatches via `waitUntil` so the customer never waits on Meta, and logs rather
than surfaces failures.

**Verifying.** `npm run meta:check` asks Meta whether the token can actually
post events to `META_PIXEL_ID`, and exits non-zero if not. Run it after changing
either. It probes the events endpoint with an empty batch: Meta checks
authorisation before it validates the payload, so a token that is allowed to
post gets as far as "data must be non-empty" — which proves access while
sending no event and fabricating no conversion. It deliberately does not read
the dataset node instead, because that needs a permission a working Conversions
API token need not hold, and would fail on a token that was never broken.
It is also a step in `.github/workflows/deploy.yml`, which is what stops a
mismatched token from reaching production — that step reads
`META_CAPI_ACCESS_TOKEN` from repository secrets, so add it there or the deploy
stops on this check.

It exists because neither way of getting this wrong is loud. With no token
`send()` returns `not_configured` and posts nothing; with a token belonging to
another dataset Meta rejects every event. Both only reach `console.error`,
because tracking must never be able to fail an order — so without this the first
sign is a campaign reporting no conversions, weeks later.

For the payload itself: set `META_CAPI_TEST_EVENT_CODE` and watch Events Manager
> Test Events, or point `META_CAPI_ENDPOINT` at a local server and place an
order to inspect the exact body without contacting Meta.

**Before taking EU traffic**, add a consent gate. The pixel currently loads for
everyone, and GDPR/ePrivacy require prior consent for advertising cookies — all
four in the table above are that, including the two this app sets itself. A gate
belongs in `ensureIdentity`, which is the one place they are written.

## Payment

Complete and tested, but **no keys are set**, so `commerce.payments` is null and
checkout still ends at `pending_payment`. Turning it on is configuration, not
code:

```sh
cd apps/storefront
npx wrangler secret put STRIPE_SECRET_KEY
npx wrangler secret put STRIPE_WEBHOOK_SECRET      # from the endpoint you create
npx wrangler secret put STRIPE_STATEMENT_DESCRIPTOR            # e.g. CHILLMYPET
```

Set the descriptor if the Stripe account is not named ChillMyPet. It is what
appears on the card statement, and a buyer who doesn't recognise the line
disputes the charge — which costs the fee, the goods, and the dispute.
`STRIPE_STATEMENT_DESCRIPTOR` replaces the account default outright; the
`_SUFFIX` variant appends to a descriptor *prefix* and only works if the account
has one configured, so an account already at Stripe's 22-character limit needs
the full form.

Point a Stripe webhook endpoint at `https://<domain>/api/stripe/webhook` and
subscribe it to all seven events the handler acts on:

| Event | What it does |
|---|---|
| `payment_intent.succeeded` | **settles the inline card form — the default path** |
| `checkout.session.completed` | settles a hosted-page order |
| `checkout.session.async_payment_succeeded` | settles a delayed method |
| `checkout.session.expired` | releases stock on an abandoned order |
| `checkout.session.async_payment_failed` | releases stock on a failed delayed method |
| `charge.refunded` / `refund.created` | releases stock on a refund |

⚠️ **`payment_intent.succeeded` is the one that matters and the one that is
easy to miss.** With a publishable key set, the checkout action mints a payment
intent for the card form already on the page — it never creates a Checkout
Session, so `checkout.session.completed` never fires for a normal sale. An
endpoint subscribed only to the session events hears nothing about any real
order. Check the subscription list before trusting a quiet Events Manager.

**Reconciliation is the backstop, not a replacement.** Because that failure is
invisible from inside the app — the card is charged and the order simply stays
`pending_payment` — `/checkout/success` no longer only waits to be told. If the
order it is rendering is unpaid, it calls `payments.reconcile()`, which asks
Stripe what actually happened to the intent and settles the order if Stripe says
it succeeded, asserting the same amount the webhook does. The sale is then
reported from there, with the customer's own cookies and address attached —
better matching than the webhook, which is a request from Stripe and carries
none of them.

Both paths converge on one `settleOrder`, and it refuses to settle an order that
is already paid, so whichever arrives second reports nothing and a sale is
counted once. Keep the subscription correct anyway: a customer who closes the
tab at the bank's 3-D Secure step never loads the receipt, and the webhook is
the only thing that will ever settle that order.

With keys set and the inline form mounted, the checkout action creates the order
and returns a payment intent the page confirms in place. Only when the form
could not mount — `cardReady=0`, usually an ad blocker on `js.stripe.com` — does
it fall back to redirecting to Stripe's hosted page. Either way the customer
ends on `/checkout/success`, which reads the payment row rather than trusting the
query string, and shows "processing" until the webhook confirms. **No card
details reach this application either way.**

The conversion is reported when the payment settles, not when the order row is
written — otherwise every abandoned checkout is a sale as far as Meta is
concerned. Both halves share an event id derived from the order number, so the
browser event on the success page and the Conversions API event from the webhook
count once.

```sh
npm run test:payments   # whole flow against a mock Stripe and a mock CAPI
```

That test needs no Stripe account and charges nothing. It asserts the things
that are expensive to get wrong: an unsigned webhook is refused, a redelivery is
a no-op, underpayment does not settle an order, an unpaid order never renders as
paid, and the confirmation page — reachable by guessing an order number — shows
a receipt and not an address.

Tax (EU VAT/OSS, US nexus) is still unhandled; use Stripe Tax rather than
building it.

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

`META_CAPI_ACCESS_TOKEN` also goes in as a **repository** secret, which is the
copy `npm run meta:check` verifies in CI before a deploy is allowed through.
Setting it there needs repo admin, not a Cloudflare login. Keep the two in sync:
the CI check can only vouch for the copy it is given.

### Pointing a domain at the Worker

`apps/storefront/wrangler.toml` declares custom domains, so `wrangler deploy`
creates the DNS records — but only once the domain is an active zone on the same
Cloudflare account. If you registered elsewhere, add the site in the dashboard
and update nameservers at your registrar first. Until then, deploys fail with
"zone not found".
