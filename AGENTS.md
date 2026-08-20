# Working on this repo

Orientation for an AI agent picking this up cold. Read `README.md` for what the
project does; this file covers **how to change it without breaking things**.

## Shape

```
packages/ecomwithai/    the open-source framework — EDIT HERE
packages/funnel-core/   block runtime: manifests, $ref binding, page layout
packages/blocks-dr/     direct-response block library — A COPY, see below
apps/storefront/        BFF: SvelteKit UI, language packs, routes
```

`packages/ecomwithai` is the editable copy of the framework, and the public repo
at **https://github.com/vishvadlamani/ecomwithai** is a publishing artifact
produced from it by `npm run sync:framework`. That direction matters: extending
the framework and running real traffic through it happen against the same files,
so they cannot drift. Never edit the public repo directly — a commit made there
is reverted by the next sync.

Publishing a change: edit here, `npm run sync:framework`, then commit and push in
the clone at `/home/user/ecomwithai`. The framework is **Apache-2.0** while this
repo is private and unlicensed, so anything you move into `packages/ecomwithai`
you are publishing under that licence.

npm workspaces. Run everything from the repo root:

```sh
npm install
npm run db:migrate && npm run db:seed
npm run dev            # http://localhost:5173
npm run check          # svelte-check, all workspaces
npm test               # offline unit tests
```

Browser tests need a running dev server and a seeded DB:

```sh
npm i --no-save playwright
npm run test:e2e       # BASE_URL= and CHROMIUM_PATH= to override
npm run test:store     # the block-rendered /store pages, product → order
```

`test:e2e` and `test:store` want a dev server with **no** `STRIPE_SECRET_KEY`:
both place an order and read the confirmation off the page, which with payments
on is a redirect to Stripe instead. `test:payments` wants the opposite — see
Deploying.

## The one rule

**Domain logic goes in `packages/ecomwithai`. Presentation goes in
`apps/storefront`.**

The framework must never import a UI framework, read `process.env`, or touch a
Cloudflare API. It is published to other people: anything chillmypet-specific
that leaks in becomes their problem too. Configuration is injected. This is what lets a module be lifted
into its own Worker later, and what keeps the package runnable on Node, Deno,
Bun or a container. If you find yourself reaching for `$env` or `platform`
inside the package, the thing you're building belongs in the BFF instead.

Routes should stay thin: validate input, call a service off `locals.commerce`,
shape the response. `hooks.server.ts` already resolved the tenant and built the
services — a route should never construct one.

## Invariants — breaking these is a bug, not a refactor

**Prices are never trusted from the browser.** The cart holds prices for
display only. `catalog.priceVariants()` re-reads them server-side on both
`/api/cart` and the checkout action. If you add a purchase path, re-price there
too.

**Stock decrements stay guarded.** `orders.create()` runs
`update ... where id = ? and store_id = ? and stock >= ?` in a transaction and
fails when `rowsAffected` is 0. Replacing that with read-then-write reintroduces
overselling under concurrency.

**Tenant scoping is not optional.** Every query filters by `store_id`. A missing
filter is a cross-store data leak, not a display bug. The isolation suite in
`packages/ecomwithai/src/commerce.test.ts` exists to catch this — keep it green,
and extend it when you add a module.

**Meta events dedupe on `event_id`.** For Purchase the id is *derived* from the
order number by `purchaseEventId()`, not minted per call — the server event fires
from the Stripe webhook and the browser event from the success page, two requests
that cannot pass a value to each other. Break that and every sale counts twice.

**A discounted order needs a coupon on the Stripe session.** Line items sum to
subtotal plus shipping, and `handleWebhook` asserts the session total equals the
order total — so a bundle order without one is charged the *full* amount and
then has its own payment refused as a mismatch. `startCheckout` creates a
single-use coupon for exactly `order.discountCents`. If you add another kind of
discount, it goes through the same path or it reintroduces this.

**A conversion is reported when money moves, not when a row is written.** With
payments on, Purchase fires from the webhook on `action === 'order_paid'` — a
branch the framework only returns once, guarded by the event-id dedup table.
Reporting at order creation counts every abandoned checkout as a sale, and Meta
optimizes spend against whatever you tell it.

**Tracking must never fail an order.** The CAPI call happens *after* the order
commits, dispatches through `waitUntil`, and logs failures rather than
surfacing them. Do not move it inside the try block that owns the order.

**Advanced-matching fields are omitted, never null.** And `state`/`country` are
only sent as 2-letter codes — truncating "Texas" to "te" hashes to a value that
matches nobody. `hash.test.ts` pins these rules.

## Gotchas that already cost debugging time

**`waitUntil` must be called as a method.** `const w = platform.context.waitUntil`
then `w(p)` throws `Illegal invocation` on the Workers runtime. This 500'd every
order until it was caught.

**The framework ships TypeScript source, not a build artifact.** Node runs its
tests with `--experimental-strip-types`, which rejects **parameter properties,
enums, and namespaces**. Don't use them in `packages/ecomwithai`. Vite handles
the app side via `ssr.noExternal`. Run `npm run typecheck` — the framework is
consumed as source, so a type error reaches users directly.

**i18n translators must be per-render.** `createTranslator(locale)` in a
component or request, never a module-level singleton — the server handles many
locales concurrently and a shared one leaks across requests. Same reasoning
applies to any new per-request state.

**`.gitignore` patterns containing a slash anchor to the repo root.** `/build`
and `tests/screenshots/` silently stopped matching when files moved into
workspace directories, and build output nearly got committed. Use `**/` or a
trailing-slash-only pattern.

**Svelte effects that write state they also read will loop.** `cart.clear()` is
deliberately idempotent because `persist()` reads `lines`; an unconditional
write re-triggered the effect calling it. `effect_update_depth_exceeded` in the
console means you've done this somewhere.

**Don't delete `local.db` while the dev server is running.** It holds the file
handle, keeps writing to the unlinked inode, and you'll chase phantom failures.
Restart the server after reseeding.

**Browser tests can't see SSR bugs.** Playwright hydrates before it asserts, so
all 39 of them passed against a product page whose server-rendered HTML said
"Sold out" with no variant selected. Anything that must be right in the *first*
response — stock state, meta tags, canonical URLs, structured data — needs an
assertion on the raw bytes. `tests/e2e.mjs` opens with a block that `fetch`es the
HTML and never touches the browser; put such checks there.

**A deploy is not visible everywhere at once.** Immediately after
`wrangler deploy`, a plain request can still be served the previous version — I
spent a while proving a fix worked before realising the fix was already live and
the response was stale. Verify with a cache-busting query string, or retry for a
minute, before concluding a deploy didn't take. Confirm against the version id
that `wrangler deployments list` reports.

## The block framework — how the storefront pages are built

`/products/[slug]` and `/checkout` are not hand-written pages any more. They are
**data**: an ordered array of blocks in a manifest under `$lib/store`, bound to
live commerce data in `+page.server.ts`, rendered by `PageLayout`. The
hand-written versions they replaced are in the history, not the tree. `/store`
and `/store/checkout`, where they were built, now 308 to the real URLs.

```ts
const resolve = createRefResolver({ product, bundles, stock, … });
const { definition, version } = bindDefinition(STORE_PAGE, resolve);
```

**Always `bindDefinition`, never `funnelVersion` + `resolveRefs` by hand.** Both
orders render identically, but versioning *after* binding mints a new version
every time stock or a price moves, so no two conversions share a version and the
funnel's own reporting goes quietly useless. Pass both `definition` and
`version` to the layout; omitting `version` makes it hash the bound definition,
which is the same bug.

A prop can be `{ $ref: 'product.price' }` instead of a literal — refs resolve
server-side and unresolvable ones are dropped, so the block's own default wins
rather than rendering "undefined" at a customer. A block can also declare
`requires: ['bundles.tiers']` and be omitted entirely when that data is missing,
which is how one manifest serves a catalogue.

The nine loaders in `src/lib/store/*.ts` are the whole data contract — 19
reference paths, each backed by a real query against `locals.commerce`. Prices
are **pre-formatted strings** (`"$93"`, `"Free"`), because currency and locale
are the host's business, not the block's. `pages.ts` maps a slug to the manifest
that renders it: a manifest is per-product (its FAQ, gallery and size chart are
one product's), so an unmapped slug is a 404 even when the product exists.

**The scarcity bar is a marketing number, not inventory.** Stock is maintained
outside this system, so `loadStock` reads `stock_sold_pct` from store settings
(default 70) rather than counting the `stock` column — a bar computed from this
database reported 0% sold on a store that had sold units elsewhere. It is
display only, and it cannot cause an oversell: `orders.create()` still holds and
decrements real stock in a transaction, and that is what decides whether a
variant is buyable.

**One announcement strip, not two.** The site layout's promo bar stands down on
any page whose data carries a `definition`, because those pages bring their own
from the manifest. Two strips saying the same thing read as a bug and cost the
two lines of a landing page that matter most.

**Manifest copy is English.** The checkout's headings are bound from the
language packs via a `copy` namespace, so that page reads in one language. The
product page's marketing prose — bullets, FAQ answers, the guarantee — is still
literals, so a Spanish visitor gets a translated title, prices and checkout with
English body copy. Fixing it is the same `copy` pattern plus translations.

**`packages/blocks-dr` and `packages/funnel-core` are copies.** There is no
registry between this repo and the project they came from, so anything you
change there diverges silently and permanently. Fix blocks upstream and re-copy.
Two additive exceptions exist and are worth knowing about rather than
rediscovering: `blocks-dr/package.json` gained a `./subdivisions` export (the
host needs `countryForm` to know whether a country requires a state), and
`workspace:*` became `*` because that protocol is pnpm-only and npm links the
workspace siblings anyway.

**Tailwind emits nothing for a package it cannot see.** `app.css` carries
`@source` lines for both packages plus the `--color-fx-*`, `--text-*`,
`--tracking-*`, `--radius-*` and `--spacing-gutter` tokens the blocks reference
by name. Delete either and the page renders as unstyled HTML while types pass
and the build succeeds. Inside a block, use utility classes (`class="text-17"`)
and never `var(--text-17)` in hand-written CSS: Tailwind tree-shakes theme
variables, so a token only becomes a real custom property once a generated
utility references it.

### The two seams, and what stays host code

Blocks state intent and stop. `track(event, subject, props)` and
`submit(action, subject, payload)` are the only ways out, and both are the
host's.

**Navigation must never become a block prop.** A `href` or `redirectTo` on the
bundle picker puts routing in a manifest and couples every block to a router.
"Buy now" calls `submit('add_to_cart', …)` with the full selection; turning that
into cart lines and `goto('/store/checkout')` is `+page.svelte`'s job. The same
goes for analytics destinations, API endpoints and currency formatting.

Deliberately NOT blocks, because a checkout that looks complete and silently
cannot take money is the worst failure this page has:

- **Card entry.** Unknown block types are skipped by design. `CardFields.svelte`
  mounts next to the blocks, and both checkouts post to the same
  `$lib/server/checkout.ts` — the fields differ, what a sale means does not.
- **The cross-form check.** Each form validates only its own fields and none of
  them has a submit button, so nothing on the page knows the address is missing
  an email except the thing that posts the order. It sits by the pay button.
- **Country and name mapping.** The blocks write a display name (`Canada`) and
  one `fullName`; the order takes an ISO code and two name fields. That
  translation happens in the host — `isCountryCode` rejects the rest.
- **Server-side field errors.** The action validates again and can disagree with
  the page. Its `fieldErrors` are rendered into the same list, or the button
  posts, comes back rejected, and visibly does nothing.

Contact and shipping fields land in host state as they are typed, under
`fullName, email, phone, country, address, address2, city, state, zip,
shippingMethod, bundle` — `state` normalised to an ISO subdivision code on the
way in. The adapter must be `$state`: its reads are methods precisely so a live
host returns a fresh value per call, and a plain object leaves the sticky bar
frozen on whatever it saw first.

`/api/address` proxies Google Places server-side so the key never reaches the
browser. Without `GOOGLE_PLACES_API_KEY` it degrades to manual entry, and in dev
serves a small Canadian fixture — deliberately, because a missing env var must
not take checkout down.

## Adding things

**A language:** drop `apps/storefront/src/lib/i18n/locales/<code>.json` next to
`en.json`, translate the values, keep the keys — that covers UI chrome and the
colour names under `product.colors.<code>`. **Product copy is no longer in the
packs**: titles and descriptions live in `product_translations` and the FAQ in a
`content.faq` metafield, both per locale, so add a row in the seed for the new
locale too.

**A store:** `SEED_STORE_ID=x SEED_STORE_DOMAIN=x.com npm run db:seed`, then add
the domain to `apps/storefront/wrangler.toml`. One Worker serves all tenants;
the `Host` header picks which. No code change.

**A domain module:** create `packages/ecomwithai/src/<name>/index.ts` exporting
an interface plus a `create<Name>Service({ db, storeId })` factory, add a subpath
to the package `exports`, and compose it in `createCommerce()`. Follow the
existing modules — interface first, implementation second. Then
`npm run sync:framework`.

**Splitting a module into its own Worker:** write a second implementation of the
same interface that forwards over a Service Binding, and swap it at
`createCommerce()`. Call sites don't change. Don't do this without a concrete
reason; it costs a network hop and a deploy pipeline.

## State of play

Working: product page, cart, checkout, orders, customers, multi-tenancy, i18n
(en/es), Cloudflare deploy pipeline. The store now runs on the framework:
catalogue, options, translations and metafields all come from
`packages/ecomwithai`.

The block-rendered pages ARE the storefront: `/products/dog-life-jacket` is the
page the campaign lands on and `/checkout` is where it pays. The bundle picker
adds real cart lines, the checkout prices through `/api/cart`, the Payment
Element mounts under the shipping method, and Place order runs `placeOrder`.

⚠️ **The invented reviews do not ship, and that is deliberate.** The 22
testimonials that came with the block library are written words attributed to
named people who never said them, the 4.9-from-1,127 rating was never counted,
and "500+ dogs already have theirs" was never true. On a page nobody sees that
is placeholder copy; in front of shoppers it is a fake testimonial under the
FTC's rule on consumer reviews (16 CFR 465), which carries per-violation
penalties. `REVIEWS_ARE_REAL` in `$lib/store/reviews-wall.ts` is the single
switch: false, and the loaders return nothing, every block that needs review
data declares `requires` and drops out, and the page renders without them.
Put real customer text in those arrays and flip it, and the rating, the hero
quotes and the wall all come back. Do not flip it to make the page look
fuller.

Meta tracking is **fully live**: the browser pixel and the Conversions API both
fire, deduplicated on `event_id`. The CAPI token is set on both Workers and was
verified end to end against Meta's real API — payload built by the framework,
`events_received: 1`, no warnings. Note the token's `debug_token` scopes read
`read_ads_dataset_quality` only and a `GET /{pixel_id}` returns "Missing
Permission"; that is expected. Posting to `/{dataset_id}/events` is a
dataset-level grant, separate from the pixel-read scope, so don't take a failed
metadata read as proof the token can't send.

Payments are **live on production**, and checkout is one page: Stripe's Payment
Element renders inline under the shipping method, and a single Place order
button creates the order, mints a payment intent and confirms it against the
fields already filled. No redirect, no second step.

That is Stripe's **deferred intent** flow — `elements({ mode: 'payment', amount })`
renders before an order exists, `elements.submit()` validates, then
`confirmPayment` runs against the intent the action returned. `submit()` before
`confirmPayment` is required in this mode; skipping it fails at confirm time.

**The method list has to be scoped in two places.** The payment intent takes
`payment_method_configuration`, but in deferred mode the Payment Element draws
its list *before* any intent exists, so it reads the `paymentMethodConfiguration`
passed to `elements()` in the browser. Restricting only the intent changes what
can be charged, not what is shown — which is exactly how Amazon Pay survived
being turned off once already.

Which methods appear is scoped by `STRIPE_PAYMENT_METHOD_CONFIGURATION`
(`pmc_1U3QlJBbNuiab9E2mZmVymgE` — card, Apple Pay, Google Pay, Link, Cash App;
Amazon Pay off). Do **not** change the account default instead: the Stripe
account is shared with another business, and its default configuration is
theirs.

The form posts `cardReady`. When Stripe.js could not mount — an ad blocker on
`js.stripe.com` is the usual reason on paid social — it is `0` and the action
uses the hosted page instead, because an intent with nothing to confirm it is a
dead end. `/api/checkout/session` serves the same fallback for an order that
already exists, and only for orders still in `pending_payment`: order numbers are
guessable, and a settled one must not be handed a fresh payment page.

Stripe.js is loaded with three attempts and a backoff before the inline form
gives up. Most failed loads are a flaky connection, not an ad blocker, and
treating the two alike sends a payable customer to a redirect they didn't need.

Do not reach for `initEmbeddedCheckout`. It was tried first, and current
Stripe.js wants `fetchClientSecret` rather than a raw `clientSecret` — passing
the secret throws, which on a live store looks exactly like a bad publishable
key. The Payment Element is the right tool for an inline form anyway. Checkout redirects to Stripe's hosted page
and the order becomes `paid` only when a signed webhook says so; no card details
touch this application. Staging deliberately has **no Stripe keys**, because it
shares production's database — a card test there would be a real charge. With
`commerce.payments` null it falls back to the old confirmation screen.

⚠️ **The Stripe account is not ChillMyPet's.** It is `acct_1Au2A6BbNuiab9E2`,
"Idea to Run" (`me@devyngreen.com`), used with the owner's agreement as a
temporary arrangement until ChillMyPet has its own. Consequences to keep in
mind: settlements land in that account, refunds and chargebacks are theirs to
absorb, and `STRIPE_STATEMENT_DESCRIPTOR=CHILLMYPET` exists so buyers recognise
the charge — that account's own descriptor reads `IDEA TO RUN AI EMPLOYE`. When
ChillMyPet's own account is ready, swap three secrets and re-point the webhook;
no code changes.

`npm run test:payments` drives that whole path against a mock Stripe and a mock
Conversions API — no account, no keys, nothing charged. Run it for any change to
checkout, the webhook, or conversion reporting.

Not built, in rough priority order:

1. **Tax.** Nothing. EU VAT/OSS and US nexus are genuinely hard — use Stripe Tax
   rather than building it.
2. **Consent gate.** The pixel loads for everyone. GDPR/ePrivacy require prior
   consent for advertising cookies before taking EU traffic.
3. **Admin.** No way to fulfil, refund, or look up a customer.
4. **Transactional email.** No order confirmation is sent. Once payments are on
   Stripe emails a payment receipt — that is not an order confirmation.
5. ~~**Payments.**~~ Live, on a borrowed Stripe account — see above.
6. ~~**DNS.**~~ Done — chillmypet.com and www are live on the `chillmypet`
   Worker, HTTPS enforced.

## Live environment

| | |
|---|---|
| Production | `chillmypet` Worker → chillmypet.com, www.chillmypet.com |
| Staging | `chillmypet-staging` → workers.dev, no custom domain |
| Database | Turso `chillmypet-vish.aws-us-west-2.turso.io` (group `default`) |

Both Workers hold `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` and
`META_CAPI_ACCESS_TOKEN` as secrets, and **both point at the same database** — a
write test against staging is a write against production data. Clean up after
yourself, or add a separate database for staging before doing anything
destructive.

Staging has **no Stripe keys**, so it falls back to the pre-payment flow: an
order there completes without payment and reports Purchase immediately. That is
survivable only because staging also sets `META_CAPI_TEST_EVENT_CODE`, so its
Purchase events land in Events Manager > Test Events instead of ads reporting. Keep it set:
without it, a checkout test on staging is a fabricated conversion in the numbers
the ad account optimizes against. Change the value to whatever code Events
Manager shows you when you want to watch a run live.

Migrations run from a machine with the credentials, not from the Worker:

```sh
export TURSO_DATABASE_URL=libsql://chillmypet-vish.aws-us-west-2.turso.io
export TURSO_AUTH_TOKEN=...
npm run db:migrate     # idempotent, create-if-not-exists
```

`npm run db:seed` deletes and recreates the product. It is safe on an empty
catalogue, and **refuses to run** once an order line references one of those
variants — `order_items.variant_id` has no ON DELETE action, so order history
wins. On a throwaway database (after an e2e run, say) delete the file and reseed;
against a real one, migrate the catalogue instead.

## Deploying

`wrangler.staging.toml` deploys to `chillmypet-staging.<subdomain>.workers.dev`
with **no custom domains**, so it can never take the live domain down. Use it to
verify a build before touching production:

```sh
cd apps/storefront
npm run build && npx wrangler deploy -c wrangler.staging.toml
```

The production config (`wrangler.toml`) declares chillmypet.com and www as
custom domains. Deploying it points the live domain at whatever you just built,
in one step, with no staged rollout — so the store must be able to serve a
request first. That means `TURSO_DATABASE_URL` set as a Worker secret: on
Workers `@libsql/client` resolves to its web build, which rejects `file:` URLs
outright, so without it every request throws before any route runs.

## Content and assets — provenance

Product copy (the `product_translations` and `content.faq` rows written by
`seed.js`), the variant availability matrix, and the photography in
`apps/storefront/static/products/` were taken from **floatpaw.store** on the
owner's explicit instruction, after they stated they had verified the licensing.

Two things a future agent should know rather than rediscover:

- floatpaw.store is itself a clone of **aquapaw.co**, a real brand. Seven of the
  ten images still carry their origin in the filename
  (`https://aquapaw.co/cdn/shop/files/Blue.jpg`), and the page referenced
  aquapaw 518 times. This was raised with the owner, who chose to proceed. If
  the question resurfaces, aquapaw.co is the party to check with — not FloatPaw.
- Deliberately **not** copied: the `FloatPaw™` name (a trademark question, which
  "it's not copyrighted" does not answer) and `contact@floatpaw.store` (it would
  route this store's customers to theirs). Store branding stays ChillMyPet, and
  the support address is `contact@chillmypet.com`.

The block library arrived with a third asset set, and one of them shipped a
competitor's mark: `static/size-chart.webp` carried the **FloatPaw** wordmark
across the top. The image is gone; `static/size-chart.svg` replaces it — same
table, ChillMyPet branding, text in an SVG so it stays sharp at any width.

**The measurements on it are the manufacturer's, and that is deliberate.** Both
stores dropship the same factory jacket, so the supplier's table is the one a
dog gets fitted against. The rows that were in `seed.js` were a tidied
approximation of it and were wrong — they have been corrected in `content.js`
to the supplier's figures, overlapping ranges and all. Do not "fix" the
overlaps or round the XL's 75–110 cm span. On a flotation device a size that
rides up is an animal in the water in a jacket that does not hold it.

Still placeholders, and known to be: `product-floatly.webp` (a supplier photo,
no visible branding), the customer UGC in `static/reviews/` standing in for
product photography, and `avatar-floatly.webp`, which only renders if the
spotlight quotes are switched back on.

Don't add further third-party branding, photography, or marketing text without
the owner confirming rights for that specific source.

## Conventions

Tabs, single quotes, no semicolon-free style — match the file you're in.
Comments explain *why*, not *what*; several in this codebase record constraints
that aren't visible from the code (the `waitUntil` binding, the state
normalizer, the idempotent `clear()`). Keep that habit.

Commit messages: what changed and why it matters, not a file list.

Verify before claiming done: `npm run check && npm test && npm run build`, plus
`npm run test:e2e` for anything touching checkout, cart, or tracking.
