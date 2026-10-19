# Working on this repo

Orientation for an AI agent picking this up cold. Read `README.md` for what the
project does; this file covers **how to change it without breaking things**.

## Shape

```
packages/ecomwithai/    the open-source framework — EDIT HERE
packages/funnel-core/   block runtime: manifests, $ref binding, page layout
packages/blocks-dr/     direct-response block library — A COPY, see below
apps/storefront/        BFF: SvelteKit UI, language packs, routes
landing/retired/        the redirect both retired landing pages (pages.dev) serve:
                        every request → chillmypet.com/products/christmas-tree-costume
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

**Every pixel is initialised in one place, and that is what keeps counting
honest.** `pixelSnippet` in `hooks.server.ts` inits `META_PIXEL_ID` plus
`META_EXTRA_PIXEL_IDS` (comma-separated, wrangler.toml) and fires one
`PageView`. Because `fbq('track', …)` reports to every initialised pixel, one
call gives each of them exactly one event — so nothing in the app needs
`trackSingle`, and adding a pixel needs no code. Initialise one late, on a
single page, and that stops being true: the base snippet's PageView has already
gone without it while every later event double-counts on the pixels that were
there from the start.

**`META_PIXEL_ID` must be the pixel the ad account optimises against.** It is
the only one the Conversions API reports to — `primaryPixelId` feeds both
`pixelSnippet` and the `meta` config — because a CAPI access token is scoped to
a single dataset. Every other pixel in `META_EXTRA_PIXEL_IDS` gets browser
events only, which is the half that iOS and ad blockers eat, and Purchase is
the event that dies most. This was live for a month with the ad account's pixel
in the extras list: the campaign reported no conversions the whole time, while
the unused pixel collected clean server-side data. If you change
`META_PIXEL_ID`, generate a matching token for that dataset in the same change,
and run `npm run meta:check` to prove the token reaches it. `deploy.yml` runs the
same check before every build, against the repository secret.
Neither failure is loud: with no token `send()` returns `not_configured` and
posts nothing, and with a token belonging to another dataset Meta rejects the
event — both only reach `console.error`, because tracking must never fail an
order. Events Manager, not the logs, is where you notice.

The roster now reads `META_PIXEL_ID = 1341978141149107` (ad account
`1550461850095009`, portfolio "Vish Ads") and nothing else.
`META_EXTRA_PIXEL_IDS` is set, and empty: the retired CZK account's
`1363695699271757` was removed on 2026-10-11, and an unset variable would fall
back to the database setting, which may still list it. `wrangler.toml` carries the
full which-id-is-whose table — read it before touching any of these numbers.

**The dataLayer is the container's whole view of the app.** GTM tags cannot
reach into the store, so `$lib/analytics/datalayer.ts` pushes GA4 ecommerce
events — `view_item`, `add_to_cart`, `begin_checkout`, `add_payment_info`,
`purchase` — beside each Meta event, from the same data. Each push nulls
`ecommerce` first, because Google's data model merges pushes and the previous
event's items otherwise leak into the next one; `tests/store-flow.mjs` counts
the nulls against the payloads to keep that true. `purchase` carries the order
number as `transaction_id`, which is what GA4 dedupes a re-sent sale on.
**Do not build a Meta tag on it.** Meta stays on the pixel in `hooks.server.ts`:
a container-published pixel double-counts against it, and no GTM tag can carry
the derived Purchase `event_id` that keeps the browser and CAPI halves as one
sale.

**GTM is a second publishing surface, not just a tag.** `GTM_CONTAINER_ID`
loads `GTM-T446VNH9` on every page. Anything published inside that container
runs with the same reach as this codebase, by whoever holds container access —
and a Meta pixel published in it would double-count against the ones the
snippet already initialises.

What the container holds, as published on 2026-10-18 (version 7):
- A GA4 Google tag for `G-YCFPQ38SXP`, which sends page_view (DOM Ready).
- A GA4 event tag on the "Shop events only" trigger: custom events matching
  `view_item|add_to_cart|begin_checkout|add_payment_info|purchase`, with
  **Send Ecommerce data** on (source: Data Layer), so `currency`, `value`,
  `items` and `transaction_id` come from the push's `ecommerce` object. Its own
  parameters are only `user_data`, `event_id`, `first_party_collection` and
  the `_fbp`/`_fbc` values. Its `transport_url` is empty, so there is no
  server-side GTM.

**Never map ecommerce fields by hand in that tag.** It came from Meta's
Conversions API gateway template, whose variables read `eventModel.value`,
`eventModel.currency`, `eventModel.items` and `eventModel.transaction_id`:
the shape of a gtag() call, not of this store's `ecommerce` pushes. Until
version 7 the tag sent those, so every GA4 event had no value or items and
every purchase had no order number. GA4 showed purchases at $0 revenue (on
17–18 Oct: 17 purchases, $0) and could not dedupe a reloaded success page.
The `eventModel.*` variables are still in the container, unused; a
parameter row pointing at one of them brings the bug back. Verified on the
live page: the `view_item` hit carries `cu=USD`, `epn.value` and `pr1`.
- One **paused** custom-template tag. Leave it paused unless you know it is not
  a Meta tag.

A new dataLayer event reaches GA4 only once its name is added to that trigger
in GTM. Before version 6 the event tag fired on `gtm.dom` and on every event,
so GA4 got a fake `gtm.dom` event and every page view twice; version 5 dropped
the event tag entirely and with it every shop event. Verify a container change
by reading the published `gtm.js` (its `version`, `predicates` and `rules`)
and capturing the GA4 hits (route `/qndl/ga/` and `/g/collect`). GA4 batches,
so wait ~10 s before reading them.

**The pixel leaves page views to the site** (`hooks.server.ts`,
2026-10-18): `fbq.disablePushState=true;fbq.allowDuplicatePageViews=true;`
before the inits. Without the first, the pixel fires its own PageView on a
client-side navigation (costume page → payment page) under an id of its own
and swallows ours, so browser and server copies never deduplicate; without
the second, it drops our next PageView as a repeat. `tests/e2e.mjs` checks
both. The payment page's `<title>` is "Checkout · …", not the product's, as
GA4's page reports group by title.

**Google tag gateway runs through Cloudflare on the path `/qndl`** (set up
2026-10-08 in Vish's Cloudflare account). GA4 hits go first-party to
`chillmypet.com/qndl/ga/g/c` instead of google-analytics.com, which ad
blockers and Safari's tracking prevention leave alone. The container itself
loads from there too: `GTM_GATEWAY_PATH = "/qndl"` in `wrangler.toml` makes the
snippet request `/qndl/gtm.js`, so a blocker aimed at googletagmanager.com no
longer stops GA4 before it starts. If that request errors, for example because
someone removed the route in Cloudflare (a setting, invisible from this repo),
the snippet loads googletagmanager.com instead, in the same page view, and
`gtm.js` is pushed only once. Verified in Chromium for gateway up, gateway
down and no gateway. Staging omits the variable because it has no gateway. The
noscript iframe stays on Google, since the gateway does not serve `ns.html`.
If the path ever changes in Cloudflare, change the variable with it.

`tests/e2e.mjs` fails "no pixel is initialised twice" if a Meta tag is ever
published in the container again. Locally the GTM checks need the dev server
started with `GTM_CONTAINER_ID=GTM-T446VNH9`: the seed sets no container.

**Every browser event has a server copy, and they share an `event_id`.**
`track()` mints one id, hands it to `fbq` as `eventID`, and posts the same id to
`/api/track`, which sends the Conversions API copy using the cookies, address
and user agent of that request. The exception is the SSR snippet's PageView: it
never reaches `track()`, so `hooks.server.ts` mints the id, writes it into the
inline script, and sends its own copy for `text/html` responses only. Without
that, five of the six events the browser fires had no server half at all, which
Events Manager reports as the server sending fewer events — and the half that
goes missing to iOS and ad blockers is the one worth having. `/api/track`
refuses `Purchase` and ignores any `user_data` in its body: a sale is reported
from the order, and a public endpoint must not be able to claim identity.

**The SSR PageView's server copy needs the browser's ids before the browser has
them.** It leaves before `fbevents.js` has run, so on a first visit there is no
`_fbp` yet, and on an ad click the pixel mints `_fbc` at a different millisecond
from the server. `metaBrowserIds()` (below) writes both before `resolve`
(SvelteKit puts cookies on the response inside it). The pixel adopts a
well-formed cookie it finds, so both
halves carry the same `fbp`/`fbc` from the first request. The same check keeps
the server PageView to real page loads, and only on a 200. Crawlers (Meta's own
fetches every ad's landing page), monitors, scripts and the scanners probing
`/wp-login.php` read the HTML without ever running the pixel, so each one was a
server-only PageView matched on an IP and a user agent. The dataset showed it:
10.4K PageViews against 89 ViewContents on a site whose landing page fires
ViewContent on every view, at a 3.2/10 match quality. `NON_BROWSER` must never
match the Facebook and Instagram in-app browsers (`FBAN`, `Instagram`), which
is where every ad click opens.

**Testing the live pixel.** `fbevents.js` sends nothing in an automated or bot
browser: launch Chromium with `--disable-blink-features=AutomationControlled`,
and keep the browser's own user agent plain, because Meta's bot list matches
`monitor` too. To stop the server's first PageView reaching Meta, add
`monitor` only to the document request's `user-agent` (a Playwright route),
and fulfil `facebook.com/tr` and `/api/track` locally.

**Don't put `original_event_data` on a live event.** It describes the past
acquisition a *delayed* event belongs to, and it has its own `event_id` that
Meta dedupes on. The framework sent it on every event, without that id, from
the first commit, and Events Manager reported 0% of server PageViews carrying an
event ID and 0% browser/server coverage on dataset `1341978141149107`, even
though the top-level `event_id` was correct the whole time. It now goes out only
beside `attribution_data`, and then it carries the same id. `hash.test.ts` pins
both. That fix reached `main` on 2026-10-10 but chillmypet.com only on
2026-10-11 at 22:24 UTC (`/_app/version.json` gives a deploy's build time), so
Meta's 7-day figures span both sides of it until about 2026-10-19.

**When Events Manager says server events have no dedupe key, check delivery
before the payload.** On 2026-10-11 it reported, for ViewContent on
`1341978141149107`, 0% of server events with an event ID and 0% coverage. Every
sender was checked against that: the storefront's `track()` → `/api/track`, the
landing pages' senders of the time (both retired since), all put the
browser's `eventID` on the server copy as `event_id`. Nothing else posts to the dataset: no
Zaraz, no server-side GTM (the container's GA4 tag carries an `event_id` for
GA4 only). A correct payload reading as 0% means old events in the window, or
server events not arriving at all. In that order:

1. `GET /api/meta-status` on chillmypet.com. It asks
   Meta, with an empty batch, whether *that deployment's* token may post to its
   dataset, which is the token nobody can read back. `accepted` (200) or not
   (503, with Meta's reason, token redacted). Cached five minutes per isolate.
2. `npm run meta:dedupe`, or the "Meta deduplication report" workflow in
   Actions: Meta's own per-event figures from the Dataset Quality API, against
   the goals of 95% of server events with `event_id` and 75% coverage.
3. Coverage is a 7-day average, so after a fix, wait the week.

Coverage also counts browser events whose server copy never left: a beacon
held back (the retired Christmas landing page waited up to 3 s for `_fbp`)
leaves with a visitor who closes the page in that window. Send waiting copies
on `pagehide`/`visibilitychange`, never only on a timer.

**`fbc` and `fbp` come from Meta's Parameter Builder, once per request.**
`$lib/server/meta-browser-ids.ts` runs `capi-param-builder-nodejs` in
`hooks.server.ts` before `resolve`, on every request, writes `_fbc`/`_fbp` back
as first-party cookies and puts the values on `locals.metaBrowserIds`; every
CAPI call reads them through `attributionFrom`. Events Manager kept flagging
the hand-built `fb.1.<ms>.<fbclid>` as a "modified fbclid" on PageView,
ViewContent and AddToCart. The builder appends a tag naming itself, which is
how Meta knows the click id arrived intact, and it handles the cases the old
code did by hand: a stale `_fbc` from an earlier click is replaced by the
URL's, and a beacon with no `fbclid` of its own takes it from its referrer.
Send its values verbatim: no minting from `fbclid`, no lowercasing or
trimming, no percent-encoding (the cookie is written with an identity
`encode`), and keep `url.search` on any redirect a landing URL can hit. PR #53
once resolved a merge by deleting this file in favour of the hand-built
version; don't. `tests/payment-flow.mjs` replays a stale cookie against a new
click through the page and a beacon.

**Meta events dedupe on `event_id`.** For Purchase the id is *derived* from the
order number by `purchaseEventId()`, not minted per call — the server event fires
from the Stripe webhook and the browser event from the success page, two requests
that cannot pass a value to each other. Break that and every sale counts twice.

**InitiateCheckout counts checkouts started, not views of `/checkout`.** Its
guard is keyed on the cart's contents and kept in `sessionStorage`, because the
cart it describes lives in `localStorage` and outlives the page. A plain
per-mount `let` was there first, and it counted a reload, a back-navigation and
the bounce back from Stripe's cancel url as fresh starts on an unchanged cart —
which is how the dataset came to hold roughly six InitiateCheckouts for every
AddToCart, a ratio no real funnel produces. Re-entering the page with the same
lines stays silent; a genuinely different cart, or a new session, fires again.
`tests/e2e.mjs` reloads `/checkout` and asserts nothing fired.

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

**The receipt has to re-ask, because Stripe redirects before the webhook lands.**
`/checkout/success` reads `paid` once in its load, and the customer arrives the
moment the card is authorised — routinely ahead of the webhook that flips the
order. So the page polls `invalidateAll` with a backoff for 90s and fires
Purchase when it flips; without that it sits on "processing" and the browser
half of the sale is simply never sent, because nobody reloads a receipt. Keep
the poll out of a `$effect`: `invalidateAll` replaces `data`, which re-runs the
effect and resets its own backoff and deadline. `tests/store-flow.mjs` replays
this by putting a real order back to `pending_payment` and paying it while the
page is open — the only way to make the race deterministic in a browser test.

**Tracking must never fail an order.** The CAPI call happens *after* the order
commits, dispatches through `waitUntil`, and logs failures rather than
surfacing them. Do not move it inside the try block that owns the order.

**Advanced-matching fields are omitted, never null.** And `state`/`country` are
only sent as 2-letter codes — truncating "Texas" to "te" hashes to a value that
matches nobody. `hash.test.ts` pins these rules.

**Every event names the visitor with one `external_id`, and it is 64 hex
characters on purpose.** `ensureVisitorId()` in `$lib/server/purchase.ts` mints
a random id into the httpOnly `cmp_vid` cookie in `hooks.server.ts`, before
`resolve()`. The same string goes onto every `fbq('init', …)` and onto every
Conversions API copy, so Meta can tie a ViewContent, an InitiateCheckout and the
Purchase to one person on a landing page where nobody has typed an email yet.
Events Manager asked for exactly that coverage on ViewContent. The shape is what
makes the two halves agree: the pixel sends a value that looks like a SHA-256
digest as it is and hashes anything else, and `buildUserData` follows the same
rule. Change the id to a UUID and the browser copy carries its hash while the
server copy carries something else, and they stop matching without any error.
The id is random, never derived from the person. Like `_fbp`, it is an
advertising identifier: the consent gate (Not built, below) has to hold this
cookie back too. It is only ever minted here: a `?vid=` in a link is ignored
(the retired Christmas landing page used to hand its own over that way).

**The webhook's Purchase carries the buyer's address and user agent through
Stripe.** The webhook is a request from Stripe, so it has none of the customer's
cookies, IP or user agent. `attributionMetadata()` packs `fbp`, `fbc`,
`external_id`, `client_ip` and `client_ua` from the checkout request into the
intent or session metadata, and `attributionFromMetadata()` unpacks them for the
Purchase. Before this the Purchase went out with no `client_user_agent`, which
Meta lists as required for website events. Such events are accepted but may not
be used for optimisation, and Events Manager scored Purchase's match quality at
0. Stripe refuses a whole request when any metadata value is over 500
characters, so a longer value is left out rather than failing a checkout. Any new
path that creates an intent or session must pass this metadata too. The hosted
fallback in `/api/checkout/session` was missing it.

**A returning shopper's events carry their email, phone, name and address too.**
`$lib/server/identity.ts` keeps `cmp_em`, `cmp_ph`, `cmp_fn`, `cmp_ln`,
`cmp_ct`, `cmp_st`, `cmp_zp` and `cmp_country`: SHA-256 digests of what a
shopper gave at checkout, normalized exactly as Purchase normalizes them. Name
and address joined email and phone after Events Manager flagged Last Name
coverage on PageView at 4.55%. The pixel's `fbq('init')` carries the same
digests, each shape-checked again before it is written into the script. They
are written by the checkout action and never by `/api/track`, so the next
visit's PageView and ViewContent carry them.
`buildUserData` passes a 64-hex value through untouched; hash it again and it
matches nobody. Phones get a calling code (`withCallingCode`) before hashing, in
the cookie and on Purchase alike, or the same person hashes two ways.

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

**A Stripe → Meta "partner integration" double-counts every sale, and it is
not ours to switch on.** Stripe can post Purchase events straight to a Meta
dataset. It sounds like free redundancy and is the opposite: Meta dedupes on
`event_id`, this app derives Purchase's from the order number via
`purchaseEventId()`, and Stripe mints its own — different ids, so no dedupe, so
every sale counts twice and the ad account optimises against inflated numbers.
It was worse while payments ran through a Stripe account shared with another
business: such a connection would also have reported **their** sales as
ChillMyPet conversions. Payments are on ChillMyPet's own account now (see
Payments below), but the double-count is unchanged. Conversions come from this
codebase, from the webhook, on `action === 'order_paid'`. If you find one of
these connected, disconnect it at the Stripe end rather than filtering at the
Meta end.

**No Payment Link sells anything any more.** The two hoodie landing pages
that charged through ChillMP Payment Links were retired on 2026-10-18 (see
"The retired landing pages"); every sale now goes through this app's
checkout, so the storefront's webhook is the only Purchase source.

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

**The scarcity bar is a marketing number, not inventory, and no page shows it
any more** (the life jacket's went with its redesign on 2026-10-17; see
below). If one ever comes back: stock is maintained
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

**Production has no Places key, so the checkout shows the plain address form.**
The manifest's `lookup` is a ref (`address.lookup`) that the checkout loader
only provides with a key or in dev. It used to be unconditional: with no key
the page offered one "Start typing your address" box that could never suggest
anything, and the country select stayed hidden behind an "Enter address
manually" link that only appeared after three characters. The country now
starts on United States and can be changed; e2e and store tests run in dev, so
they still drive the lookup path against the fixture.

**Never touch `sessionStorage` or `localStorage` outside a try.** Where a
browser blocks site data (Safari's "Block All Cookies", some in-app browsers)
even `typeof sessionStorage` throws a SecurityError. Both block pages read
their state bag at component init, and until 2026-10-16 the `typeof` sat
outside the try: the product page crashed on hydration (no size, no Add to
cart) and the checkout lost its form fields. The cart already caught its own
errors; with storage blocked it lives in memory, which survives the client-side
navigation from product page to checkout.

## Adding things

**A language:** drop `apps/storefront/src/lib/i18n/locales/<code>.json` next to
`en.json`, translate the values, keep the keys — that covers UI chrome and the
colour names under `product.colors.<code>`. **Product copy is no longer in the
packs**: titles and descriptions live in `product_translations` and the FAQ in a
`content.faq` metafield, both per locale, so add a row in the seed for the new
locale too.

**A product:** a definition in `apps/storefront/scripts/<slug>.js` (the
`ProductDefinition` shape in `catalog.js`: translations, options, media,
variants, metafields), listed in `scripts/products.js`; a manifest in
`$lib/store`, mapped in `pages.ts`; photos under `static/products/<slug>/`, then `npm run images` for their small copies
(`christmas: true` on its `PRODUCT_PAGES` entry also lists it on `/christmas`);
and a browser test like `tests/christmas-tree-costume.mjs`. The seed writes it on a
fresh database, the Worker adds it to a live one, and `check-live.js` fails the
deploy if its page does not answer. Nothing else to register: `/catalog` and the home
page read the catalogue.

**Taking a product off sale:** delete its script, manifest, `pages.ts` entry,
photos and test, and list it in `scripts/retired-products.js` with the slug
its links should go to (`movedTo`). Deleting alone is not enough: `products.js`
never removes a row, so the live store would keep selling it to an old link or
a saved cart. Listed there, the Worker's sync archives the row (`status =
'archived'`, which the catalogue, cart and checkout read as gone; orders keep
their lines), `/products/<slug>` and its checkout answer 308 to the new
product with the query string kept, a checkout drops the product's lines from
a cart saved in the browser (`/api/cart` no longer prices them, and
`Checkout.svelte` removes what it was not priced), and `check-live.js` checks
the redirect after each deploy. The Christmas Pouch Hoodie went this way on 2026-10-18.
Never reuse a retired product's slug or SKU prefix (`CMP-XH-`): old orders
still carry them.

**Renaming a product, or changing its description:** edit the product's script
and add `{ slug, locale, field, from, to }` to `scripts/copy-changes.js` in
the same commit (title, subtitle or description). The catalogue sync and
`db:products` apply it where the field still reads `from` exactly, so it runs
once and leaves copy edited by hand alone. Keep the slug: the URL is in ads and
links. The costume became the **Pet** Christmas Tree Costume this way on
2026-10-17 (owner's call: it fits small dogs and cats); its URL is still
`/products/christmas-tree-costume`.

**Changing a price:** set `PRICE_CENTS` in the product's script and add
`{ slug, fromCents, toCents }` to `scripts/price-changes.js` in the same
commit. The Worker's catalogue sync applies it on the first request after
the deploy, and `npm run db:products` applies it by hand. Each change moves
only variants still at `fromCents`, so it runs once, and a price someone set
by hand in the meantime is left alone. Placed orders keep their unit price;
carts are re-priced by the server, so nobody is charged the old price.
Bundle cards and their savings follow on their own (they are the quantity
breaks applied to the unit price). `catalogue.test.ts` pins the guard.

**A store:** `SEED_STORE_ID=x SEED_STORE_DOMAIN=x.com npm run db:seed`, then add
the domain to `apps/storefront/wrangler.toml`. One Worker serves all tenants;
the `Host` header picks which. No code change.

**A different ad account:** the store reports to whichever dataset
`META_PIXEL_ID` names, so moving accounts is config plus one secret, in this
order. Do it in this order or the store spends the gap reporting nothing.

1. In Events Manager, find the dataset the new ad account optimises against.
   Meta merged "pixel" and "dataset" into a single object, so that one id is
   both — a dataset showing no connected pixel is not missing one, it just has
   never been sent a browser event.
2. On that dataset: Settings > Conversions API > **Generate access token**.
3. `npx wrangler secret put META_CAPI_ACCESS_TOKEN` on **both** `chillmypet` and
   `chillmypet-staging`.
4. Move the outgoing id into `META_EXTRA_PIXEL_IDS` and put the new one in
   `META_PIXEL_ID`, in `wrangler.toml` and in `seed.js`'s `SETTINGS`. Demote,
   don't delete: an old pixel costs nothing and its history stays warm.
5. Deploy staging, place a test order, and confirm in Events Manager > Test
   Events that Purchase arrives **twice over** — once `Browser`, once `Server`,
   collapsed into one event. One copy alone means the token and the id disagree.
6. Check domain verification separately. `meta_domain_verification` in `seed.js`
   holds one token, and a domain verifies to **one** business portfolio at a
   time — so moving to an account under a different portfolio may need the
   domain released from the old one and re-verified, which is what Aggregated
   Event Measurement needs to attribute at all. The meta tag changes with it.

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

The block-rendered pages ARE the storefront: `/products/life-jacket` is the
page the campaign lands on and `/checkout` is where it pays. The bundle picker
adds real cart lines, the checkout prices through `/api/cart`, the Payment
Element mounts under the shipping method, and Place order runs `placeOrder`.

**The life jacket page wears the shop's look since 2026-10-17** (`theme:
'tree'`), on the owner's instruction, and lost its sales-page furniture on the
same day: the per-visitor 15-minute countdown, the "Today only: 30% off"
strip, the "% sold" bar, the "Ironclad guarantee" seal and every struck-through
price. A countdown that restarts for each visitor and a discount off a price
the jacket never sold at ($63.97) are exactly what the FTC treats as
deceptive. It is $44.99 with no compare-at (`seed.js`, and `price-changes.js`
for the live row), its bundle cards read `bundles.plain` and say their saving
in words, and below the hero it has the Christmas pages' trust strip, FAQ row,
"real inbox" cards, photo wall and closing band. Its purchase mechanics did
not change: the `bundles` picker with its colour select, Buy now, the sticky
bar, the first size in stock (`pickSize: false`). `tests/e2e.mjs` asserts the
countdown, "today only", "% sold" and was-prices stay gone. The size chart
(`static/size-chart.svg`) is recoloured to the shop's pine; its numbers are
unchanged.

The Christmas products are built differently from the life jacket in three
ways worth knowing:

- **The buyer picks the size.** `PRODUCT_PAGES` entries carry `pickSize`. Off
  (the life jacket), the host buys the first size in stock in the chosen
  colour; on (the costume and the reindeer hoodie, sized for a particular
  pet), the host refuses to add anything until a size is chosen and asks the
  picker to prompt instead. The design fills option 1, the slot the cart and
  checkout call `colour`, so nothing downstream changed. Its codes have
  entries under `product.colors.<code>` in both language packs, or the
  checkout prints the key. (`red_santa` and `green_stocking` stay there for
  the retired pouch hoodie's past orders.)
- **Their blocks are the host's.** `design_size_picker`, `design_gallery`,
  `size_guide` and `benefit_cards` live in `$lib/blocks` and are registered in
  `$lib/store/blocks.ts`, not in `packages/blocks-dr` (a copy). The picker and
  gallery share the choice through funnel state (`design`, `size`), and the
  host writes `size_prompt` when someone taps buy without a size.
- **The "order by" strip** reads `CHRISTMAS_DELIVERY.cutoff` in
  `$lib/store/christmas.ts`, a config value that `christmas.test.ts`
  re-derives from the shipping promise (4 business days + 12 days, worst
  case) and that a `christmas_cutoff` store setting overrides without a
  deploy. Once the date has passed the strip drops out through `requires`.

A product is a script (`scripts/christmas-tree-costume.js`), listed in
`scripts/products.js`. `db:seed` writes it on a fresh database. A live one
gets it from **the Worker itself**: `$lib/server/catalogue.ts` runs once per
isolate, on the first request after a deploy, handed to `waitUntil` so it
never sits on a request's path. It reads `sqlite_master` once and runs
`applySchema` only when a table or index is missing, then adds every product
in `products.js` the store lacks, and never rewrites one it has.
`npm run db:products` is the same list, run by hand. A new product goes on
that list in the same change as its manifest in `pages.ts`.

`/products/christmas-tree-costume` is the product the Christmas ad sells: a
hooded tree cape for small dogs and cats, red or green, S–L **by the pet's
weight** (`pickSize: true`, `theme: 'tree'`, the real delivery cut-off, no
countdown chips, no stock bar, no was-price, no reviews), defined in
`scripts/christmas-tree-costume.js` and
listed in `products.js`, so the Worker adds it to the live store on the first
request after the deploy and `check-live.js` proves the page answers.
`tests/christmas-tree-costume.mjs` drives it to a placed order. Three things to
know:

- **The size guide's columns follow the product.** `sizeGuideTable()` in
  `$lib/store/garment-sizes.ts` reads `specs.size_chart` and emits a table
  whose columns are what the rows carry: chest and length for a person's
  garment, weight bands for a pet's costume, plus neck and back length the
  moment a costume row carries `neckCm` or `backLengthCm`. The costume ships
  the supplier's weight bands and nothing else — never fill in another
  seller's measurements.
- **The price is $27.99, the reindeer hoodie's** (owner's instruction,
  2026-10-17: one price for the Christmas dog outfits). It was $28.50, the
  first reference store's figure. It has no compare-at on purpose. A price
  change is two edits in one commit: `PRICE_CENTS` in the product's script
  (a fresh seed) and an entry in `scripts/price-changes.js` (a live store,
  which `products.js` never rewrites). See "Changing a price" below.
- **It looks like littletreepups.com, on the owner's instruction.** Done on
  2026-10-16 from that page's measured styles: the `tree` theme in
  `pages.ts` (not `christmas`), `$lib/styles/tree-theme.css` for the cream
  and pine palette, Poppins, the hairline accordions and the site chrome
  (`+layout.svelte` adds `tree-chrome` and lifts the page's delivery strip
  above the header, hiding the in-page copy, so it stays one strip), plus
  opt-in looks on the shared blocks: `design_gallery` `hint` (plain frame,
  "Swipe to explore 1 / 5"), `design_size_picker` `look: 'pills'` (pills,
  bundle cards, full-width pine button), `size_guide` `look: 'band'`. A
  manifest that sets none of these gets the blocks' default looks. `story`, `photo_pair` and
  `closing_cta` are host blocks used only here. Only the look came across:
  none of that shop's words, photos, ratings, struck prices or pre-ticked
  add-ons.
- **The bundle cards are the store's real quantity breaks.** They read
  `bundles.plain` (the tiers without the undiscounted "was" total) and say
  their saving in words. Every unit in a bundle is the colour and size
  picked; the host adds `units` of that variant, and the server applies the
  break at `/api/cart` and on the order, as for any cart. The chosen tier
  lives in funnel state as `costume_bundle`, not `bundle`, so a 3-pack chosen
  on the life jacket cannot carry over, and the sticky bar reads the same
  field so it shows and buys what the cards show.
- **It opens on green, on the tabby** (owner's call, 2026-10-17):
  `leadDesign: 'green'` in `pages.ts` puts green first in the picker and the
  gallery, and the gallery's green photo is `cat.jpg`; `cardImage` makes the
  tabby the listing photo too (cards, sticky bar, bundle cards, link
  previews). The hosts' fallback for "no colour chosen" reads `leadDesign`
  as well (`data.leadDesign` on both product pages), because the picker shows
  that colour chosen: a buyer who leaves it and picks a size must get green,
  and before that fallback they got the catalogue's first colour, red.
  `one-page-checkout.mjs` and `checkout-recovery.mjs` drive exactly that.
- **Colour fills the design slot.** The picker's `designLabel` reads "Colour",
  its codes are `red` and `green`, which both language packs already name,
  and `item_variant` reaches GA4 as `green / M`. SKUs are `CMP-XT-<COLOUR>-<SIZE>`
  (XT: Xmas tree).

`/products/christmas-hoodie` is the other Christmas product, the **Christmas
Hoodie** (the "Reindeer Christmas Dog Hoodie" until 2026-10-18): a red plush hoodie with
antlers on the hood and a tree patch on the back, S–XL, one colour, built
exactly like the costume (`tree` theme, same blocks and rules), defined in
`scripts/christmas-hoodie.js` and tested by `tests/christmas-hoodie.mjs`.
Two things differ:

- **It has no size chart, on purpose.** The reference store (littletreepups.com,
  on the owner's instruction, look only) sells S–L with its own figures; this
  listing is S–XL and the supplier's table has not arrived. The metafields are
  empty, so the size guide says how to measure and shows its `pending` note.
  When the table arrives the live row needs a migration: `products.js`
  never rewrites a product it has. (A price change has its own path,
  `scripts/price-changes.js`.)
- **The price is a placeholder too**: $27.99, the reference store's figure, no
  compare-at.

The picker's single-colour case gives the sizes the rest of the row
(`.options.single`), and the bundle cards' saving line names its unit through
`unitsNoun` ("with 2 hoodies"); it used to say "costumes" on every page.

`/products/santa-costume-with-gift` is the third Christmas product, the **Santa Costume
with Gift**: a red plush Santa suit with a matching hat and plush
arms holding a wrapped present, S–L, one colour, $27.99 like
the others (the owner's call, 2026-10-18; their working name was "Christmas
Pet Costume_2"). Built exactly like the Christmas Hoodie, no size chart for the same reason, defined
in `scripts/santa-costume-with-gift.js`, tested by `tests/santa-costume-with-gift.mjs`
(in `test:store`). SKUs `CMP-SP-RED-<SIZE>`; its bundle tier lives in
`santa_bundle`. It is last on `/christmas`.

**An ad for it is expected.** Land it on `/products/santa-costume-with-gift`, so
the page shows the product the ad shows. The page's first screen holds the
photo, price and all three sizes at 390×664, og:image is the dog photo (the
link preview), and `/products/santa-costume-with-gift/checkout` answers for an ad
that should open on the form. It has no `checkout: 'shop'`, so Add to cart
goes to `/checkout`; set it, as the costume has, if the owner wants the ad's
buyers on a payment page of its own. Optimise for AddToCart or Purchase,
never AddPaymentInfo. The photos' rights for ads are unconfirmed
(provenance, below), and the hat being included is read from the photos
only: confirm both with the owner before the ad runs.

`/products/santa-outfit` is the fourth Christmas product, the **Santa Outfit**
(2026-10-19, from two supplier photos the owner sent): a red Santa outfit in
two styles, S–L, $27.99 like the others (the owner's call), no size chart
yet. Built like the Santa Costume with Gift, defined in `scripts/santa-outfit.js`,
tested by `tests/santa-outfit.mjs` (in `test:store`). Last on `/christmas`.
**The design slot holds a style, not a colour:** the owner asked for one
product, red, S/M/L, and the two photos are two different outfits, so the
buyer picks `santa_suit` (hat, belted jacket, trousers) or `santa_dress`
(collar, ruffled skirt, sash), both red. The picker's `designLabel` reads
"Style", both codes are named under `product.colors.<code>` in both language
packs, SKUs are `CMP-SO-<SUIT|DRESS>-<SIZE>`, and its bundle tier lives in
`santa_outfit_bundle`. Both swatches are the same red: the label and the photo
tell them apart. It was first built as the "Santa Cat Costume" on a branch
that never reached `main`; that name broke the rule below, so it never went
live and needs no slug change. Its photos (`static/products/santa-outfit/`,
a ginger cat in the suit, a tabby in the dress) were supplied as screenshots,
re-encoded with no metadata, and look AI-generated, with source and licence
unstated: the same caveat as the Santa Costume's photos, so ask before an ad.

**No "pet", "dog" or "cat" anywhere a shopper reads (the owner's rule,
2026-10-18, tightened the same evening from "pet, never dog or cat").** That
covers product names, URLs, descriptions, page copy, FAQs, the header, footer
and tab titles, in both languages (no "perro", "gato", "mascota" either): the
Christmas Tree Costume (`christmas-tree-costume`), the Christmas Hoodie
(`christmas-hoodie`), the Santa Costume with Gift (`santa-costume-with-gift`)
and the Life Jacket (`life-jacket`). Write "little one", "they" or "them"
instead. The brand ChillMyPet stays, and `\bpets?\b` does not match inside
it. Photo alt text still says what the photo shows (a poodle, a tabby): it
describes the picture for screen readers and image search, on the owner's
call. The placeholder reviews in `reviews-wall.ts` still say "dog"; they are
not shown (`REVIEWS_ARE_REAL` is false), and their words were left alone.
`tests/santa-costume-with-gift.mjs` checks the visible text of the home page,
`/christmas`, `/catalog`, every product page, `/contact` and two policies, and
each Christmas product test checks its own page.

**Renaming a product's URL** goes through `scripts/slug-changes.js`, never
through its script alone (`products.js` adds by slug, so that would open a
second, empty product beside the one selling). The sync renames the live row
in place first, so stock, SKUs, photos and order lines carry over, and the
old URL and its checkout answer 308 to the new ones with the whole query
string: same product, same sizes, so `?size=`, `fbclid` and utm tags arrive.
Every rename so far is listed there, and an old URL reaches the newest one
in a single hop however many renames lie between (`currentSlug()` in
`pages.ts`): `dog-christmas-costume` and `pet-christmas-costume` →
`christmas-tree-costume`, `reindeer-dog-hoodie` and `christmas-pet-hoodie` →
`christmas-hoodie`, `santa-pet-costume` and `pet-santa-costume` →
`santa-costume-with-gift`, `dog-life-jacket` → `life-jacket`. The live
costume ad still links to `dog-christmas-costume` and lands through that
redirect; point it at the new URL when the ad is next edited. Copy changes
that ride with a rename name the new slug, because renames run first.
Photos keep their folders (`static/products/<old slug>/`): the live media
rows point there, and nobody reads a file path.

**`/christmas` is the page the Christmas ads can share.** It lists every
product whose `PRODUCT_PAGES` entry has `christmas: true` and which has a row
in the store, in catalogue order, each card linking to its product page. A new
Christmas product is listed by setting that flag; nothing else. It buys
nothing itself: size, bundle and AddToCart stay on the product pages, so the
conversion path the tests pin is the only one. It wears the tree chrome (the
layout reads `theme` and `announcement` off its data, since it has no
manifest), hides the header links on a phone like a product page, and lays
the cards out as rows on a phone so the first screen shows more than one
product with its price. The header's Catalog menu links to it once it has a product.

**The header is Home, Catalog and Contact** (since 2026-10-17, on the owner's
instruction, after littletreepups.com's menu). Catalog is a `<details>`
disclosure opening onto All products (`/catalog`) and Christmas
(`/christmas`, once it has a product); a tap opens it, and a tap elsewhere,
Escape or a navigation closes it. The products are no longer links in the
bar: four names did not fit on one row, and the catalogue's cards are where
the menu leads instead. Things to know:

- **`unlisted` hides a product from the shop, not from the web.** A product
  carrying it stays off the menu, `/`, `/catalog` and `/christmas`, while
  its page, its checkout and any link straight to it keep working, and
  `check-live.js` still fetches it. Nothing carries it today (the pouch
  hoodie did, until it was retired). To take a product off the web too,
  retire it (see "Taking a product off sale").
- **One row, like a shop's.** The menu on the left, the name in the middle,
  the language and the cart (a bag icon with the count) on the right. Below
  768px the menu folds behind a ☰ button (`.phone-menu`, a `<details>` like
  Catalog) that drops a panel with the pages and the language switch. A
  checkout has neither: there the language switch takes the left slot so
  the name stays centred. `tests/e2e.mjs` drives both menus.
- **The bag opens the basket, not the checkout** (since 2026-10-18).
  `CartDrawer.svelte` is a `<dialog>` from the right with each line's
  photo, − + stepper (`QuantityStepper`, the checkout's), Remove and price,
  the subtotal and bundle discount from `/api/cart`, and Checkout. The bag
  is still `<a href="/checkout">`, so it works without JavaScript and the
  tests that read its count keep finding it; the click handler opens the
  drawer instead. Before, the only − + were under the address and card
  fields on `/checkout`. A re-price that fails before anything is shown (an
  error status, an HTML error page such as a 1101, a dropped connection, or
  no answer within 10 s) shows a message with Checkout and Try again, never
  an endless "Loading…" (the owner found one on 2026-10-19). Lines the
  server no longer prices leave the cart, as on the checkout, so the count
  matches the lines. `tests/cart-drawer.mjs` (in `test:store`) pins both.
- **The whole site wears the tree chrome** (cream, pine, Poppins, the
  delivery strip above the header, the green footer), except a product page
  with a skin of its own (the life jacket's sales page) and the one-page
  checkouts under `/products/`. The rule
  is `treeChrome` in `+layout.svelte`; a page without its own strip gets
  the layout load's `siteAnnouncement`, the Christmas delivery line.
  `Collection.svelte` / `ProductGrid.svelte` are the cards for `/`,
  `/catalog` and `/christmas`. Christmas products sort first.
- **The footer** is the name and a line, then Shop, Help and Legal columns,
  then the payment marks the checkout really offers (Visa, Mastercard, Amex,
  Apple Pay; see Payments for why not Google Pay or Discover).
- **The header and footer CSS is global, in `app.css`.** A `<style>` block in
  `+layout.svelte` stamps a hash class on every element of the layout, and
  the tests match chrome class names (`tree-strip`, `shop-header`) on the
  raw HTML. Keep the layout free of scoped styles. `tree-theme.css` only
  sets the `--site-*` and `--footer-*` colours for the tree look.
- **`/checkout` is in the shop's colours too** (`.tree-checkout` in
  `tree-theme.css`): the library's forms draw with the `fx` tokens, so the
  class swaps the tokens and the pay button's colour. Nothing about how the
  checkout behaves changed.
- **The home page opens on a hero** of three photos, each linking to its
  outfit: the tabby in the green costume (`cat.jpg`, AI-styled; its "AI-styled
  image" label came off on the owner's call of 2026-10-18), the
  reindeer hoodie and the red costume. All three tiles are square, like the
  photos (2026-10-18): the two small ones were 4:3 and cut the antlers and
  paws off. The two-dog scene (`duo.jpg`) that
  stood there first was taken down on the owner's call, and is off the
  costume's gallery too; it stays on disk only.
- **Cards can show a treated photo** (`cardImage` in `pages.ts`). The life
  jacket's is `card-sailboat.jpg`: its catalogue photo, a cut-out on pure
  white, multiplied onto the warm backdrop of the Christmas studio shots so
  it no longer sits as a white tile among cream ones. Same photo, same
  product, only the backdrop changed.
- **Product pages carry a `trust_strip`** under the buy box (free US
  shipping, 30-day returns, secure checkout, real people reply), and the
  "who you're buying from" cards use line icons by name from
  `$lib/line-icons.ts` instead of emoji. Only promises the policy pages
  already make go in either.

**Two skins since 2026-10-17: the brand's, and Christmas.** The owner
supplied the logo (`static/brand/`: `logo.png` paw and wordmark side by side
for the header, `logo-light.png` with the navy turned white for the dark
Christmas footers, `logo-white.png` all white (the teal "mypet" turned
white) for the brand's teal footer, `logo-stacked.png` as supplied, and the teal-circle paw as the tab
and home-screen icons; the tab icon before that was SvelteKit's default
logo) and asked for its colours everywhere except the Christmas pages.
So:

- **The brand skin** is navy `#0b3c49`, teal `#14a3b0` (`#0e8590` under white
  text), orange `#ff6b2c` and white, set in DM Sans. It is the tree look
  with its `--tree-*` colours re-pointed (`.brand-skin` in `tree-theme.css`),
  so every rule built on those names follows.
- **Its colours are "Teal"** (2026-10-18), the owner's pick from four
  previews of the real pages, rendered by injecting each palette into the
  dev server. Built to that preview exactly, and `tests/e2e.mjs` pins it:
  - the round logo's teal `#12858f` (`--brand-teal-band`) for the bands:
    the home banner (full width, white title and text, a peach `#ffd9c4`
    eyebrow), the life jacket's trust band, and the footer with
    `logo-white.png`;
  - navy for what you press, prices and titles (`--tree-green` is navy
    here, `--tree-green-deep` `#072a33` its hover), the life jacket's
    manifest accents included;
  - the orange for the small headings over titles (`--tree-red`), the cart
    count, and the home banner's first button, which has navy lettering
    because white on that orange is too faint (2.8:1);
  - white header and a navy strip; the header's own marks (the current page,
    menu hover) stay teal `#0e8590`.
  - `static/size-chart.svg` (the life jacket's) is drawn in the same teal
    and navy.
- **The creative pass of 2026-10-18** (the owner: "make it look like a
  professional designer's"). Layout and finish, not colour; all in
  `tree-theme.css` unless named, so the Christmas pages get the layout parts
  too:
  - a two-column row's left side is `position: sticky` from 768px (the
    gallery beside the buy box, a section title beside its questions), so
    there is no screen of empty page under the photos;
  - headings `text-wrap: balance`, paragraphs `pretty` (no lone last word),
    and a heading block's title has room before what it introduces;
  - the brand skin draws the heading block's grey eyebrow in the orange, as
    the home page's;
  - the life jacket's photo wall is the reviews block's carousel with square
    photos (manifest): a swipeable row with a peek on a phone, a grid of
    eight from 768px (CSS, scoped to `ul.snap-x:has(> li > article)`; the
    gallery's thumbnail strip is also a `ul.snap-x`, of buttons, and must
    not match);
  - the size chart picture keeps 720px on a phone and scrolls sideways, with
    a "Swipe the chart" line under it;
  - the brand skin's `/checkout` reads in DM Sans (its component sets Poppins);
  - `Collection.svelte`'s promises are an icon row on a tinted panel;
    `ProductGrid.svelte` shows six swatches then "+N"; the home label reads
    "The Christmas collection"; the footer says "small pets".
  - the home banner's orange button has no outline (its fill is the edge),
    and "All products" a half-pixel white line drawn as an inset
    `box-shadow`, because Chrome rounds a border under 1px up to 1px.
- **Christmas keeps the pine, cream and Poppins**: `/christmas` and the
  products `pages.ts` flags `christmas` (costume, reindeer hoodie) put
  `festive: true` in their data, and `+layout.svelte` leaves `.brand-skin`
  off for them. Everything else in the tree chrome wears the brand: home,
  `/catalog`, contact, policies, `/checkout`, the life jacket. A new
  Christmas product is festive by setting its `christmas` flag; nothing
  else.
- The layout loads the font the skin needs (DM Sans or Poppins), so a page
  must not load its own. The life jacket's manifest accents are the brand
  navy; the Christmas manifests keep pine.
- `tests/e2e.mjs` asserts the logo, the tab icon, and which pages wear which
  skin.

**Sizes read metric first, pounds beside.** The costume's size note and
FAQ say `1.5–2.5 kg (3–6 lb)`, like its table; the tables in
`garment-sizes.ts` and `sizes.ts` already print both units, and the life
jacket's chart carries cm/in and kg/lb.

**A card can show its whole photo** (`cardFit: 'contain'` in `pages.ts`).
The life jacket's card photo is a side-on dog, and a phone's narrow card
cropped its nose and tail; `card-sailboat.jpg` is now cropped square around
the dog and shown whole, over its own backdrop colours.

**Every sized product also has a one-page checkout** at
`/products/<slug>/checkout` (`/products/christmas-hoodie/checkout`):
the product's delivery strip, photos, title and picker, then the checkout's
contact, address and shipping blocks, then the same card fields and pay
button. It is a second way in for an ad that should land on the form; the
product page and `/checkout` are unchanged. A product with `checkout: 'shop'`
(the costume) gets the payment-only `shop` look below instead.
Things to know:

- **The costume ad's URL is the product page, and paying is a page of its
  own** (the owner's call, 2026-10-18). For one day (PR #68) the costume's
  URL redirected to its one-page checkout; the owner wants two screens: the
  product page with no card fields at `/products/christmas-tree-costume`,
  and a payment page at `/products/christmas-tree-costume/checkout` that
  does not look like the product page. So the redirect and its `landing`
  flag are gone, and the costume has `checkout: 'shop'`. On a product with
  that look, the product page's Add to cart opens
  `/products/<slug>/checkout?design=&size=[&bundle=qty-N]&added=1` instead
  of `/checkout` (`payAt` from the product page's load). The bundle-card
  path (the life jacket) still goes to `/checkout`. `fbclid` still becomes
  `_fbc` on the product page's first response
  (`tests/christmas-tree-costume.mjs` checks it); `?details=1` means nothing
  any more, and is harmless if an old link carries it.
- **An empty cart says so in the payment box.** Stripe's fields mount only
  for an amount above zero, and with nothing in the cart the box used to
  read "Loading secure payment…" forever (an owner's phone found it). It now
  reads `checkout.paymentEmpty`, or `paymentPick` on a one-page checkout.
- **Composed, not authored.** `onePageCheckout()` in
  `$lib/store/one-page-checkout.ts` takes the strip, gallery, h1 and picker
  from the product's manifest and the fields from `CHECKOUT_PAGE`, so copy,
  sizes and bundle cards cannot drift from the product page. Only
  `pickSize` products get one: the life jacket's picker doesn't name a
  variant, so its URL is a 404.
- **One checkout, two pages.** `$lib/components/Checkout.svelte` is the whole
  checkout (re-pricing, cross-form check, card fields, InitiateCheckout,
  AddPaymentInfo) and both pages render it; both actions are `placeOrder`.
  Change checkout behaviour there, never in a page.
- **Choosing is adding.** The picker's button is off (`button: false`), and
  the page keeps the cart equal to what the picker shows: a size fills it,
  a bundle sets the quantity, no size takes the line out. Other products in
  the cart are left alone and charged with it.
- **The events are paced for a page that is both.** ViewContent on arrival;
  one AddToCart per page view, on the first choice the buyer makes there
  (choices restored from the product page were reported there);
  InitiateCheckout once per session, keyed on the page rather than the cart
  and held until a name or email is typed, so trying three sizes is not
  three checkouts started. Purchase is unchanged: the webhook, the order's
  derived id. `tests/one-page-checkout.mjs` pins all of it.

**The costume's checkout has a look of its own, `shop`** (built 2026-10-17
for the since-retired pouch hoodie; `docs/christmas-checkout.md` has the
reference it copies, the comparison that chose it, and every departure).
`PRODUCT_PAGES[…].checkout = 'shop'` turns it on per product: since
2026-10-18 the costume, whose product page's Add to cart opens it (above).
So the ad's path is `/products/christmas-tree-costume` → Add to cart →
`/products/christmas-tree-costume/checkout`; `/checkout` is the cart's own
checkout, for a basket reached from the cart icon. The header there is the
logo, centred, and a padlock. Things to know:

- **Markup, not behaviour.** `Checkout.svelte` takes `look`; pricing, the
  cross-form check, the card fields, the events and the post are the same
  code for both looks, and the default look renders as before. The shop
  look's fields are host blocks (`shop_contact`, `shop_delivery`,
  `shop_method`), which ask for first and last name separately and post them
  as `firstName`/`lastName`, so "Mary Ann" is not split at its first space.
  They write the same host-state keys as the library's forms, plus
  `firstName`/`lastName` (and `fullName`, joined, for the draft capture and
  InitiateCheckout).
- **Errors live under the fields.** `$lib/checkout-fields.ts` is the one set
  of rules the blocks show and the pay button checks. Pay with something
  missing writes a fresh `checkout_attempt` token to state; each block shows
  its messages once the token changes from what it was when the block
  mounted, and the host focuses the first `aria-invalid` field.
- **The link carries the choice.** `?design=&size=` is set into state before
  any block mounts (so the server renders the picker folded), and only codes
  the product sells are taken; `bundle=qty-N` sets the bundle too. The
  picker folds in either layout (`pills` included) once both are chosen,
  and the line says the count ("Size: M · 2 costumes"). `added=1` means
  the sender reported the ViewContent and the AddToCart, and this page then
  reports neither for the view. Once read, those four leave the address bar
  (`replaceState` on the next tick after `afterNavigate`: on a page opened
  straight from a link the router is still starting, and calling it any
  sooner throws and stops the page hydrating), so the buyer sees the plain
  `/products/<slug>/checkout`; an ad's `fbclid` and utm tags stay (the
  owner's call, 2026-10-18). A reload restores the choice from the session,
  and a `checkout-reported:<slug>` session flag, read back only on a reload,
  keeps the page as quiet as `added=1` did. A `?vid=` in the link is ignored: the retired
  Christmas landing page used it to hand over its visitor id, and since
  2026-10-18 `ensureVisitorId` only mints its own.
- **The Payment Element's box reserves its finished height** (316px stacked,
  236px from 440px wide, measured with `SHOP_APPEARANCE`), so the pay button
  does not move while Stripe.js loads. Change the appearance, measure again.
  The reserve stays until the buyer picks a tab other than Card (Apple Pay
  is one line of text and sat in a screen of empty box, 2026-10-18); it
  can't end on Stripe's `ready`, which comes before the final height.
- **Pay calls Stripe's `elements.submit()` first, before the order is
  posted** (`submitOrder` in `Checkout.svelte`, `submit` from
  `CardFields`). With Apple Pay chosen, `submit()` is what opens the
  payment sheet, and Safari opens it only from the tap itself. Until
  2026-10-18 it ran after the server's round trip, when the tap no longer
  counted, so Apple Pay could not have worked. A failed submit (an
  incomplete card, a closed sheet) cancels the post, so no order row is
  made. `confirm` then only calls `confirmPayment`. Don't put an `await`
  ahead of it. `shop-checkout.mjs` checks the order with a stand-in
  Stripe.js.
  `CardFields` now also calls `elements.update({ amount })` when the total
  changes after mounting (a second unit, a bundle), on every
  checkout.
- **Text 16px and up, fields 60px, every target 44px.** The test walks every
  visible text node and fails on anything smaller.

`tests/shop-checkout.mjs` (in `test:store`) drives it as the Facebook app on
an iPhone. With `PAYMENTS_BASE_URL` set to a second dev server holding
`STRIPE_PUBLISHABLE_KEY` and a dummy secret key, it also loads the real
Stripe.js to check the button stays put, that the form offers no Link,
Google Pay or Discover, and that a blocked js.stripe.com leaves the hosted
fallback.

**The first screen on a phone is a budget, and the tests hold it.** The ads
open in the Facebook app, which leaves an iPhone about 390×664. Oct 3–16 sent
175 landing-page views and got no AddToCart, from pages whose first screen was
a three-row header, the strip and a photo, with the price and sizes below it.
Now the product pages and the one-page checkout fit the price, the colours
and the size buttons inside 664px, and `tests/christmas-tree-costume.mjs` and
`tests/one-page-checkout.mjs` measure it. What pays for it, so nobody puts it
back by accident:

- **The header is one row on a phone**: ☰, the name, the cart, at most 64px
  (`tests/e2e.mjs`). Both checkouts drop the menu everywhere (a link out of
  a checkout is a way to not pay). The language switch is in the ☰ panel on
  a phone, and in the bar on a checkout.
- **The `hint` gallery swaps its thumbnail strip for arrows and a counter on a
  phone**, and trims the frame to 1:0.92 (the costume photos have 3% of
  backdrop above the star and 8% below the paws). Arrows walk the colours'
  photos too, and landing on one chooses it — that is the gallery's rule, so
  frame and picker never disagree.
- **The `pills` picker puts its tagline below the sizes on a phone**, and the
  costume's columns sit 12px apart there.
- **Shipping is Standard only, since 2026-10-17.** Express promised 2–3
  business days that a dropshipped order cannot keep, so the owner took it
  off. `SHIPPING_RATES` in `$lib/store/shipping-rates.ts` is the one table:
  the checkout's options, its total, the method `placeOrder` accepts, and
  `createCommerce({ shippingRates })` in hooks, so `orders.create()` prices
  against it. A posted `method=express` is charged as Standard
  (`test:payments` posts one). The framework's `DEFAULT_SHIPPING_RATES`
  still lists Express; don't read rates from it in this app.
- **`/checkout` opens on a "Your order" box** (photo, colour, size, total)
  — `/api/cart` lines carry `image`. Each line has its own − n + buttons
  (`QuantityStepper.svelte`), Remove, and Change back to *its* product. The
  cart lives in localStorage for good, so a basket can arrive holding last
  summer's life jackets under a Christmas costume; before 2026-10-17 the only
  way to change that at checkout was a small Remove at the foot of the page,
  and the box's single Change went to whichever product was first. On a
  one-page checkout the picker's own line has no Remove (the picker owns it)
  and, where bundle cards set the count (the costume, the reindeer hoodie),
  no quantity buttons. The shop look opens its folded phone summary by itself when
  the cart holds another product, because that line is charged too.
  `tests/basket-edit.mjs` pins all of it.

**Photos are served as small copies.** `static/resized/{200,800}/products/…`
holds WebP copies of every product photo, made by `npm run images` (sharp)
and committed, because the Worker serves files and cannot resize.
`resized(src, width)` in `$lib/resized.ts` points at them: thumbnails, bundle
cards and the checkout box use the 200px copy, the main photo gets the 800px
one through `srcset`. `resized.test.ts` fails when a photo has no copies.

That was chillmypet.com's state on 2026-10-12: the live Worker answered `No
product at "<slug>"` for a new product — the manifest's own 404 reads `No page
manifest` — so the code had shipped and the row had not, and the ads kept
landing on a Payment Link page instead. `deploy.yml` was meant to run
`db:migrate` and `db:products` first, but that needs the database's token as
a repository secret, and the repository's owner does not hold it: the Turso
account is Vish's. So the step skipped, and once a token for another database
was saved under that name it failed with a 401 and blocked the release
instead. The Worker holds the right token because it serves every page from
that database, which is why the sync lives there now. Three things keep code
and rows together. The Worker's sync. `deploy.yml`, which after the deploy
runs `scripts/check-live.js` to fetch every product page on chillmypet.com
and fails the run if one is not a 200 within four minutes, so code without a
row is a red run rather than a quiet 404. And the shop's own pages, built
from the catalogue (`loadCollection` in `$lib/store/collection.ts`): `/`,
`/catalog` and `/christmas` show a card for every product that has both a row
and a manifest, so a product missing from the live database is a missing
card, never a dead link. A product left out of them on purpose says so with
`unlisted: true` in `pages.ts`; see "The header" below.

**Where the Christmas ad lands, since 2026-10-16:**
`/products/christmas-tree-costume` on chillmypet.com, and its Add to cart opens
`/products/christmas-tree-costume/checkout`. Nothing else is advertised. The
reasons a storefront page beats a landing page, for an audience that is
mostly women 55+ on the Facebook app: the brand's own domain in the address
bar instead of `pages.dev`; a real cart, so AddToCart, InitiateCheckout,
AddPaymentInfo and Purchase are four separate signals; Apple Pay, Link and
Klarna inline on the one checkout page; an order row, the admin queue and
the confirmation email; and every fbc, dedupe and webhook guarantee in this
file. One real order and refund has still not been run end to end.

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

Meta tracking is **built and proven, and mid-move between ad accounts.** The
browser pixel and the Conversions API both fire, deduplicated on `event_id`, and
the whole path was verified end to end against Meta's real API — payload built
by the framework, `events_received: 1`, no warnings.

⚠️ **Whether each site's token is for this dataset has never been confirmed.**
The config has pointed at dataset `1341978141149107` since 2026-09-16, but the
token on the Workers was generated for the retired `1363695699271757`, and
nothing records it being replaced. A token is scoped to one dataset, so a stale one means every
server event is refused, silently, into `console.error`, while browser events
keep arriving. Check it, don't assume it: open
`https://chillmypet.com/api/meta-status` (see "When Events
Manager says server events have no dedupe key" above). Anything but
`"server_events": "accepted"` means: generate a token for `1341978141149107`
(Events Manager → the dataset → Settings → Conversions API → Generate access
token), `wrangler secret put META_CAPI_ACCESS_TOKEN` on `chillmypet` and
`chillmypet-staging`, and update the repository
secret. Note the token's `debug_token` scopes read
`read_ads_dataset_quality` only and a `GET /{pixel_id}` returns "Missing
Permission"; that is expected. Posting to `/{dataset_id}/events` is a
dataset-level grant, separate from the pixel-read scope, so don't take a failed
metadata read as proof the token can't send.

⚠️ **Never send a card number with the live publishable key**, test card
included. The live key (`pk_live_…`, public, in `wrangler.toml`) is for the
Payment Element and nothing else. On 2026-10-17 a measuring run called
Stripe.js with it and `4242 4242 4242 4242`; Stripe refused the raw card
(`invalid_request_error` on `POST /v1/payment_methods`, "unsupported for
publishable key tokenization") and the owner found it in Workbench → Errors.
Measuring the live Payment Element is fine; typing or posting a card into it
is not. Leave raw card tokenization off in Stripe's integration settings,
whatever the error message suggests: that refusal is a guard. Card tests go
against the mock Stripe of `test:payments`, or a Stripe test-mode key, never ChillMP's live
account.

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

Which methods appear is scoped by `STRIPE_PAYMENT_METHOD_CONFIGURATION`, and on
production it is deliberately **unset**: both call sites then fall back to the
account's own default, `pmc_1U3NfSJOsB1nguzljz7ADcR4`, which is ours to edit in
Stripe → Settings → Payment methods. That is where to switch a method on or
off, not here. As of 2026-10-07 it has card, Apple Pay, Link and Klarna on for
USD buyers (Bancontact, BLIK, EPS, MB Way, Pix and Satispay are also on but only
show in their own currencies) and **Google Pay off** — it was on under the old
account, so Android shoppers lost it in the move. Redirect methods such as
Klarna work because `CardFields` confirms with a `return_url` and
`redirect: 'if_required'`.

**Link is hidden in code, and that is the one exception.** `CardFields`
creates the Payment Element with `wallets: { link: 'never' }`, on the owner's
instruction of 2026-10-17: a shopper signed into Link sees their own Link
email at the top of the payment box, and the owner did not want it there. So
the configuration still has Link on, and turning it on there will not bring it
back to the inline checkout; delete the option for that. The hosted fallback
page reads the configuration only, so it still offers Link until it is
switched off in Stripe → Settings → Payment methods.

A wallet needs the domain as well as the configuration. Read through the
Stripe API on 2026-10-12: `chillmypet.com` and `www.chillmypet.com` are
registered payment method domains on ChillMP with Apple Pay, Google Pay, Klarna
and Link active, so Apple Pay really does render in the Payment Element on an
iPhone, and Google Pay is off only because the configuration says so. The
`payment_badges` row on both product pages shows Apple Pay beside the cards for
that reason, and `tests/christmas-tree-costume.mjs` asserts Google Pay's badge stays
absent — add it to both manifests only after turning the method on in Stripe.

Do **not** use `pmc_1UGKEnJOsB1nguzl8TDgEoLT`, even though the dashboard API
lists it as a "Default". It belongs to a connected application
(`ca_Swgjj07BVs6HeEHEehhBS5taE2VK9Tcj`), not to the account, and this app's own
keys are not entitled to it.

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

**Payments run on ChillMyPet's own Stripe account since 2026-10-07:
`acct_1U3NewJOsB1nguzl`, "ChillMP".** It is registered in **CZ**, charges USD,
has charges and payouts enabled, and its own statement descriptor is
`CHILLMYPET`. Its endpoint for this app is `we_1UFU0bJOsB1nguzl4AwL0RK6` →
`https://chillmypet.com/api/stripe/webhook`, subscribed to all seven events in
`README.md` plus `charge.dispute.created` and `radar.early_fraud_warning.created`
(which the handler acknowledges and ignores). The switch was verified by the
publishable key the live checkout ships (`pk_live_51U3NewJOsB1nguzl…`) and by a
signed `customer.created` probe that the live webhook accepted (200, `ignored`)
while it rejected a wrong secret (400). A real order and refund has not been run
yet; until one has, treat the end-to-end path as unproven.

Before that, from launch to 2026-10-07, payments ran on a **borrowed account**:
`acct_1Au2A6BbNuiab9E2`, "Idea to Run", used with its owner's agreement. Every
order paid before the switch settled there, so **refunds and chargebacks for
those orders still happen in that account**, not ChillMP, and that account's
webhook (if it still points here) now fails our signature check. A refund
issued there will not release stock or mark the order refunded here.

**Stripe embeds the account in its object ids, so an id from one account is
meaningless on another.** The account id and every object minted on it share a
fragment: `JOsB1nguzl` for ChillMP, `BbNuiab9E2` for the old account. That is
also the fastest way to tell from outside which account the live site uses:
look for the fragment in the checkout page's `pk_live_`. On a key that predates
the format, look at any `pmc_` id on the page. A leftover id from the old
account is the one value that fails at the customer, not in a log. It happened
during this switch, for about a minute: the new keys were live while
`STRIPE_PAYMENT_METHOD_CONFIGURATION` still named the old account's
configuration.

**The swap is configuration, not code, and it is four secrets, not three.**
They live on the `chillmypet` Worker (Cloudflare → Workers & Pages → chillmypet →
Settings → Variables and Secrets), not in `wrangler.toml`. The production Worker
holds `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
`STRIPE_STATEMENT_DESCRIPTOR`, `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` and
`META_CAPI_ACCESS_TOKEN` as secrets.

⚠️ **`STRIPE_PUBLISHABLE_KEY` is the exception: it is public, and it lives in
`wrangler.toml`.** It goes to every visitor's browser, so whatever value it holds
is published. On 2026-10-09 a dashboard edit set it, as a plain-text variable,
to a `whsec_…` webhook signing secret. Every `/checkout` page then carried that
secret in its HTML, and the card form could not mount, so every buyer was sent to
the hosted page. It was found on 2026-10-10. Pinning the real `pk_live_` key in
`wrangler.toml` means each deploy overwrites whatever the dashboard holds. Never
type a secret into this name. The webhook secret that leaked has to be rolled
in Stripe (Developers → Webhooks → the endpoint → Roll secret) and the new value
set where that endpoint's secret lives. `wrangler secret delete` needs `--name` and no
`--force` flag; when it fails, the secrets you just set are already live. Set
and remove in one go, or remove first. To move to yet another account, follow
the same steps (ordered):

1. `wrangler secret put` **`STRIPE_SECRET_KEY`** from the new account, on the
   production Worker only — staging has no Stripe keys on purpose (see Live
   environment) — and change **`STRIPE_PUBLISHABLE_KEY`** in `wrangler.toml` to
   the new account's `pk_live_` key in the same deploy.
2. **Clear `STRIPE_PAYMENT_METHOD_CONFIGURATION`**, or create a new
   configuration on the new account and use that id. Clearing is the better
   default: both call sites pass it only when set, so an empty value falls back
   to the account's own default — and that default was only ever unsafe to rely
   on because the account was *shared*. Once the account is ours, its default is
   ours to set in the dashboard. A stale id from the old account is the one
   value here that fails at the customer, not in a log.
3. Create the webhook endpoint on the new account, subscribe it to all seven
   events listed in `README.md` — `payment_intent.succeeded` above all, since
   the inline Payment Element settles through an intent and not a session — and
   `wrangler secret put` its **`STRIPE_WEBHOOK_SECRET`**. A secret from the old
   account's endpoint fails every signature check, which reads as orders simply
   never turning paid.
4. Keep **`STRIPE_STATEMENT_DESCRIPTOR=CHILLMYPET`** unless the new account's
   own descriptor already reads ChillMyPet to a buyer. It is not about who owns
   the account; it is about what the shopper recognises on their statement.
5. Run `npm run test:payments` before and after. It uses a mock Stripe, so it
   proves the code path, not the credentials — verify those with one real
   low-value order that you then refund.

Do **not** connect the new account's Stripe→Meta integration while swapping.
See the partner-integration gotcha above: it double-counts against the
Conversions API events this codebase already sends.

⚠️ **A sale settles from two directions, and `settleOrder` is where they meet.**
It is the only code that sets an order to `paid`, and it has exactly two
callers: `handleWebhook`, when Stripe tells us, and `reconcile`, when
`/checkout/success` asks Stripe directly about an order it is about to render as
unpaid. Both assert the same amount against the order row, both go through
`processOnce`, and `settleOrder` refuses an order already marked paid — which is
what makes them idempotent against *each other*, so whichever arrives second
reports no conversion and one sale stays one sale. Keep that refusal: without
it, a webhook landing after a reconciled receipt is a second `order_paid` and a
second Purchase.

The second caller exists because the first is one delivery from silence. The
inline Payment Element settles on **`payment_intent.succeeded`** and never
creates a Checkout Session, so an endpoint subscribed only to
`checkout.session.completed` — which is what the README told you to do until
this was found, having been written for the hosted-page flow — hears nothing
about any real order. That failure is invisible from in here: the card is
charged, the order stays `pending_payment`, the receipt reads "processing", and
neither half of the Purchase pair fires (the browser event needs `data.paid`,
the server event needs `action === 'order_paid'`). Nothing logs, because nothing
arrived.

Reconciliation covers it but does not replace the subscription: a customer who
closes the tab at 3-D Secure never loads the receipt, and only the webhook will
ever settle that order. If Events Manager is missing Purchase while Stripe shows
successful charges, check the endpoint's event list first. The full set the
handler acts on is in README.md under Payment.

`npm run test:payments` drives that whole path against a mock Stripe and a mock
Conversions API — no account, no keys, nothing charged. Run it for any change to
checkout, the webhook, or conversion reporting. It does cover this path — it
signs a `payment_intent.succeeded` event and asserts the order settles and the
conversion reports — which is the point worth remembering: it posts that event
to the endpoint itself, so it proves the handler works and can never tell you
whether Stripe is configured to deliver it. A green suite is not evidence of a
live subscription.

Not built, in rough priority order:

1. **Tax.** Nothing. EU VAT/OSS and US nexus are genuinely hard — use Stripe Tax
   rather than building it. More pressing since the Stripe account that takes the
   money is Czech: the seller of record is now an EU business, so EU VAT applies
   to its own sales, not only to EU shoppers. Settle that with an accountant
   before scaling ad spend.
2. **Consent gate.** The pixel loads for everyone. GDPR/ePrivacy require prior
   consent for advertising cookies before taking EU traffic. As with tax, an EU
   merchant cannot treat this as somebody else's market.
3. **Admin — built, switched off.** `/admin` lists the queue to ship (paid,
   unshipped, oldest first) and every order, searches by order number or
   email, and marks an order shipped with carrier and tracking, which emails
   the customer. It is a 404 until `ADMIN_PASSWORD` is a Worker secret, then
   HTTP Basic auth against it; no pixel, container or server PageView runs on
   it. Shipping is a row in `fulfillments`, **not** an order status: the
   payment module reads `status = 'paid'` as settled, so a shipped order that
   moved off `paid` could be settled — and reported — again. Run
   `npm run db:migrate` against production before first use; the storefront
   itself never reads that table. Refunds are still issued in Stripe.
   `npm run test:admin` covers it.
4. **Transactional email — built, switched off.** `$lib/server/email.ts` sends
   an order confirmation through Resend, beside the Purchase event, on the
   three paths that report a sale (webhook, receipt reconcile, no-payments
   checkout). Each runs once per sale, which is what keeps it to one email;
   `test:payments` counts them. It sends nothing until `RESEND_API_KEY` is a
   Worker secret, and the sending domain (`orders@chillmypet.com` by default)
   must be verified in Resend first. Replies go to `EMAIL_REPLY_TO`
   (`wrangler.toml`): contact.chillmypet@gmail.com, the support inbox every
   page names (owner's confirmation, 2026-10-17). `contact@chillmypet.com`,
   which the Christmas pages and landing pages used to show, is not read. The admin's "Mark shipped" sends a
   shipping notification the same way.
5. ~~**Payments.**~~ Live, on ChillMyPet's own Stripe account since 2026-10-07
   — see above.
6. ~~**DNS.**~~ Done — chillmypet.com and www are live on the `chillmypet`
   Worker, HTTPS enforced.

## Abandoned-checkout reminders

One reminder email to a shopper who typed their email at checkout and left
without paying. Built and tested; like every other email it sends nothing until
`RESEND_API_KEY` is set (see "Transactional email" above).

- **Capture.** `/checkout` posts `{email, fullName, lines}` to
  `/api/checkout/draft` 1.5s after the shopper stops typing a valid email, and
  again whenever the cart changes. The endpoint always answers 204. Drafts live
  in `checkout_drafts`, one row per address per store; lines are variant ids and
  quantities only, re-priced when the email is built. The note under the email
  field ("If you don't finish, we'll send one reminder") and the privacy
  policy's "Checkout reminders" section are what make this fair to a shopper in
  the EU, which matters because the seller of record is Czech. Keep both if you
  change the timing or add a second email.
- **The rules live in the framework** (`packages/ecomwithai/src/recovery`, tested
  in `recovery.test.ts`): due an hour after the last touch and only within 48h;
  at most one reminder per address in 30 days however many carts it starts;
  never after a paid order from that address placed since the draft; never to an
  address in `email_suppressions`; `claim()` succeeds once, so racing sweeps
  cannot both send; drafts are deleted 30 days after their last touch. An order
  left in `pending_payment` (pressed pay, never paid) still counts as abandoned.
- **Nothing schedules the Worker.** `$lib/server/recovery.ts` `sweepSoon` runs
  a sweep in `waitUntil` on a document request, at most once per isolate every
  10 minutes, and `/api/recovery/sweep` (GET or POST, 60s pause per isolate)
  lets anything outside ping it; the owner's hourly Apps Script that fills the
  ChillMyPet Ads sheet does. Both are safe to leave public: they can only send
  reminders already due, each once, and return counts. A Cloudflare cron
  trigger would be cleaner, but needs a wrapper entry with a `scheduled`
  handler (adapter-cloudflare only exports `fetch`) and a free cron slot on
  Vish's account, which holds many other Workers.
- **The email** (`renderCheckoutReminder` in `email.ts`) is English only, like
  the others: product photo, lines, subtotal, the Christmas cut-off line while
  `loadChristmasDelivery` still returns one, a "Finish my order" button to
  `/checkout/restore/<token>`, and an unsubscribe link to
  `/email/unsubscribe/<token>` plus a `List-Unsubscribe` header. Resend's
  idempotency key is `checkout-reminder/<token>`.
- **Restore** writes the draft's lines into the cart (`cart.replace`) and its
  email into the checkout's `store-state`, then goes to `/checkout`, which
  re-prices as always. **Unsubscribe** is a button that POSTs JSON to
  `/api/email/unsubscribe`, never the page's GET: mail scanners open every link.
  There is no one-click `List-Unsubscribe-Post`, because SvelteKit's CSRF check
  rejects a form POST with no Origin, which is what mail providers send.
- `npm run test:recovery` drives all of it in a browser against a mock Resend
  (dev server with `RESEND_API_KEY=re_test EMAIL_API_ENDPOINT=http://127.0.0.1:12113`
  and no Stripe key).

## Live environment

| | |
|---|---|
| Production | `chillmypet` Worker → chillmypet.com, www.chillmypet.com |
| Staging | `chillmypet-staging` → workers.dev, no custom domain |
| Database | Turso `chillmypet-vish.aws-us-west-2.turso.io` (group `default`) |
| Payments | Stripe `acct_1U3NewJOsB1nguzl` ("ChillMP"), live since 2026-10-07 |
| Meta dataset | `1341978141149107` (browser + CAPI), the only pixel. Removed 2026-10-11: `28272021345717397` (nobody could say whose it was) and `1363695699271757` (the retired CZK account's; nothing running used it) |
| Retired landing pages | `chillmypet-christmas.pages.dev` and `chillmypet-hoodie.pages.dev`, Cloudflare Pages on the owner's account (below). Since 2026-10-18 both serve `landing/retired/`: every request 302s to `/products/christmas-tree-costume` (query kept), `/api/*` answers 410, no pixel. Published on merge by `deploy-retired-landing.yml` |

**Which Cloudflare account holds what.** Everything chillmypet.com runs on is
in **Vish's** Cloudflare account, alongside many unrelated Workers. That covers
the `chillmypet` and `chillmypet-staging` Workers, all their secrets, and the
domain itself. chillmypet.com was registered through Cloudflare Registrar on
2026-08-08 and expires 2027-08-08. The business owner has a separate,
newer Cloudflare account that serves nothing for chillmypet.com. Never add
chillmypet.com there through "Connect your domain": it would issue new
nameservers for a domain that is already live elsewhere. The
two retired landing page projects, `chillmypet-hoodie` and
`chillmypet-christmas`, are on account `5fef1d1dbb6eaee72fdfc2b26a61a386`
(checked 2026-10-07 — the repo's `CLOUDFLARE_WORKERS` token lists Vish's
account's Pages projects, and they are not among them). The
`OWNER_CLOUDFLARE_API_TOKEN` repository secret reaches it, so their redirect
publishes on merge (`deploy-retired-landing.yml`). Moving the store
into the owner's account is possible, but it is a planned migration (domain
transfer between accounts, Worker and secrets re-created, custom domain
re-bound), not a dashboard click. When in doubt about which account serves the
site, change a value and watch the live page: the Stripe fragment trick above
answers it in seconds.

### Ads, and the pages they land on

All current advertising is in the Meta ad account **Vish Kanada**
(`act_1550461850095009`, USD). As of 2026-10-18 one campaign runs:

| Campaign | Ad set | Lands on | Optimises for | State |
|---|---|---|---|---|
| Christmas 2026 Campaign (`52545254634260`) | Christmas 2026 Ad Set, ad "Christmas Pet Costume Ad" | `/products/dog-christmas-costume`, which 308s to `/products/christmas-tree-costume` since 2026-10-18 | **AddToCart** on `1341978141149107` | **Live** since 16 Oct, $5/day, no end date, US 18+, Advantage+ audience |

Everything else is paused or ended and stays off unless the owner asks: the
four hoodie campaigns (!Christmas Hoodie Campaign!, Christmas Hoodie
Campaign, Hoodie Campaign, Hoodie Campaign - Copy), which landed on the two
retired landing pages, New Traffic Campaign (`/products/dog-life-jacket`,
ended 20 Sep) and two that never served. The last hoodie campaign spent
$34.98 on 10–12 Oct for 152 link clicks and no AddToCart; 91 of the clicks
were women 55+, nearly all on phones in the Facebook app. Its Christmas page
was optimised for AddToCart while selling through Payment Links, where the
add and the checkout were the same tap — one reason the ad now lands on the
storefront, where they are separate events.

Earlier, the old ad account `act_1431226177195979` (CZK) ran four "Dog Vest"
ads to `/products/dog-life-jacket`, optimising for Purchase or
InitiateCheckout on `1363695699271757`. That pixel is no longer on any page,
so don't restart those ads there.

**Never optimise a Payment Link page for AddPaymentInfo.** The card is typed on
Stripe's page, which reports nothing to the pixel, so the event can never fire
and Meta spends against a goal nobody can reach. Two of the paused hoodie
campaigns still have it; they are not to be restarted.

**A zero in Ads Manager is not evidence that tracking broke.** On 2026-10-11,
17 clicks and no AddToCart looked like a fault and was not. The way to tell:
drive the live page as an ad click with every pixel hit and server copy
answered locally, follow it to the payment form and stop before paying.

**Where to read the numbers.** The Supermetrics connector reads the Meta ad
accounts and GA4 property `557080165` ("Chillmypet"). Its Meta access is
**read-only**: write access is not enabled for this team, so campaign changes
through it are refused, and those go through Ads Manager. GA4 runs only on
chillmypet.com through GTM. A click on an old ad that still points at a
retired landing page reaches chillmypet.com through its 302, with the
`utm_*` tags and `fbclid` kept.

### The retired landing pages

Two static shops on Cloudflare Pages sold the hoodies outside this app,
through Stripe Payment Links on ChillMP, with pixels and Conversions API
workers of their own: `chillmypet-hoodie.pages.dev` (the Pouch Pet Hoodie,
off sale since 2026-10-09) and `chillmypet-christmas.pages.dev` (the
Christmas Pouch Hoodie). On the owner's call of 2026-10-18 both products
were retired, so the costume is the only Christmas product an ad can lead
to and only chillmypet.com reports to the dataset. Their sources, tests,
deploy workflows and the hoodie ad's creative are gone from the repo
(the history has them).

Both addresses now serve `landing/retired/`, published to both projects by
`deploy-retired-landing.yml` on merge (`OWNER_CLOUDFLARE_API_TOKEN`): every
page request 302s to `/products/christmas-tree-costume`, query string kept
less `design`, `size` and `added`, and `/api/*` answers 410 Gone. No pixel
runs there. A 302, not a 301, because a browser keeps a permanent redirect
and the addresses may serve something else one day.

⚠️ **Left to do in Stripe (ChillMP), by hand:** deactivate the Christmas
page's eight Payment Links (`plink_1UOEWYJOsB1nguzlJXtjB3lf` …
`plink_1UOEYtJOsB1nguzlezFxeKMv`; the Pouch Pet Hoodie's
`plink_1ULu2aJOsB1nguzlIzkLcmZG` is already off), and delete the webhook
endpoint that points at `chillmypet-christmas.pages.dev/api/stripe-webhook`,
leaving chillmypet.com's `we_1UFU0bJOsB1nguzl4AwL0RK6` as the only one. Until
then a buyer holding an old link can still pay for a hoodie with no order
row here, and the endpoint's deliveries fail with 410.

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

The test code only reroutes the *server* copy. The browser pixel has no such
switch, so `wrangler.staging.toml` pins `META_PIXEL_ID`, `META_EXTRA_PIXEL_IDS`
and `GTM_CONTAINER_ID` to empty — `??` keeps an empty string, so staging loads
no pixel and no container instead of inheriting production's from the shared
store row. Leave them empty; set `META_PIXEL_ID` for one run when you want to
watch it in Test Events.

The Worker applies the schema itself on its first request after a deploy
(`$lib/server/catalogue.ts`: one read of `sqlite_master`, and `applySchema`
only when something is missing), so a merge is enough. By hand, from a machine
with the credentials:

```sh
export TURSO_DATABASE_URL=libsql://chillmypet-vish.aws-us-west-2.turso.io
export TURSO_AUTH_TOKEN=...
npm run db:migrate     # idempotent, create-if-not-exists
```

`npm run db:seed` deletes and recreates the life jacket and every product in
`products.js`. It is safe on an empty catalogue, and **refuses to run** once an
order line references one of those variants — `order_items.variant_id` has no ON DELETE action, so order history
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

**Merging to `main` deploys.** `.github/workflows/deploy.yml` checks, tests,
builds and runs `wrangler deploy` on every push to `main`. `CLOUDFLARE_API_TOKEN`
and `CLOUDFLARE_ACCOUNT_ID` are repository secrets since 2026-10-11: run
38184138598 (the merge of PR #40) deployed version `7780424a…` to chillmypet.com
and www, which is where the paragraph that used to stand here — the secrets were
missing and production shipped by hand — stopped being true. Two consequences.
A merge is a release, so review a pull request as one. And the database has to
keep up with the code: the Worker does that itself on its first request after
the deploy (`$lib/server/catalogue.ts`; see "A product is a script" under
State of play for why it is not a CI step), and the workflow then fetches every product
page on the live site and fails if one does not answer 200. The fallback stays: if
the Cloudflare secret ever goes missing the run posts a "chillmypet.com was NOT
deployed" warning on its summary page instead of failing, and a green run with
that warning means production did not change. `/_app/version.json` on the live
site gives a deploy's build time when you need to know what is running.

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
  the support address is `contact.chillmypet@gmail.com`.

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

A design added without a photo renders a box labelled "Placeholder", never
another design's picture.

The Christmas Tree Costume's five photos
(`static/products/dog-christmas-costume/`) were supplied by the owner in chat on
2026-10-12 as screenshots of a supplier listing, with the instruction to use
them. Their original source and licence were not stated: ask before treating
them as cleared for ads. They carry no third-party branding and EXIF was stripped. What
the page serves is a treatment of them, not the originals. On 2026-10-16 all
five were redone from the originals in one pass (ca96a07 has them as supplied):
cut out locally with rembg's BiRefNet-lite (run in the sandbox, so no photo
left the machine; it keeps the white pom-poms that u2net punched holes in),
the loose pom-pom props the supplier scattered round the product dropped, and
each set on the same generated warm studio backdrop. The dog shot stands on a
floor sweep with a contact shadow; the three flat-lays lie on a surface with a
top-light shadow; the hood close-up keeps the supplier's framing. The product
pixels are the supplier's, with levels, +7% saturation and light sharpening
only. Gallery shots are 1540x1379 (the gallery's 1100:985 frame at retina
size), the grid shots 1400 square. `hero-both.webp` is the red dog and the
green costume from the same cut-outs, side by side on a transparent
background; it is no longer on the page but is kept for ads.

On 2026-10-16 the owner replaced the costume page's photos with
littletreepups.com's (same dropshipped product; the owner's call). Taken from
that page and re-encoded as plain JPEGs with no metadata: `worn-red.jpg` (now
their red studio shot, so the catalogue's listing image, the sticky bar, the
bundle cards and og:image all show it), `green-studio.jpg` (the gallery's
green, via the gallery's `photos` override, since the catalogue's green row is
still the flat-lay), `details.jpg`, `duo.jpg`, `cat.jpg`, `living-room.jpg`,
`shih-tzu.jpg`, `schnauzer.jpg`. Not taken: their size-guide graphic (their
wordmark and their measurements) and their colour graphic (it promises a
colour per pet inside a bundle, which ours does not do). Their lifestyle shots
are AI-styled; the page said so under the photo pair until the owner had the
line taken off (2026-10-18), and its note now gives only the size range. The
older supplier treatments (`red.jpg`, `green.jpg`, `green-back.jpg`,
`hood-detail.jpg`) stay on disk because catalogue media rows point at them. Nothing about the product was generated or altered: it
is the real costume on a plain background. Its copy was written here.

The Santa Costume's two photos (`static/products/santa-pet-costume/`,
`dog.jpg` a French bulldog, `cat.jpg` a ginger cat) were supplied by the
owner in chat on 2026-10-18 as screenshots, with the instruction to add the
product. Re-encoded as plain JPEGs with no metadata, otherwise untouched.
They look AI-generated (the same staged room, identical props) and their
source and licence were not stated: the same caveat as the hoodie's applies,
so ask before treating them as cleared for ads. Its copy was written here.

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
