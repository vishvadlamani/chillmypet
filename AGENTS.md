# Working on this repo

Orientation for an AI agent picking this up cold. Read `README.md` for what the
project does; this file covers **how to change it without breaking things**.

## Shape

```
packages/commerce/      domain: catalog, customers, orders, stores, meta
apps/storefront/        BFF: SvelteKit UI, language packs, routes
```

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
```

## The one rule

**Domain logic goes in `packages/commerce`. Presentation goes in
`apps/storefront`.**

The package must never import a framework, read `process.env`, or touch a
Cloudflare API. Configuration is injected. This is what lets a module be lifted
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
filter is a cross-store data leak, not a display bug. `tenancy.test.ts` exists
to catch this — keep it green, and extend it when you add a module.

**Meta events dedupe on `event_id`.** The checkout action mints one id, sends it
with the CAPI Purchase, and returns it so the browser fires
`fbq('track','Purchase', …, {eventID})` with the same value. Break the pairing
and every sale is counted twice.

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

**The commerce package ships TypeScript source, not a build artifact.** Node
runs its tests with `--experimental-strip-types`, which rejects **parameter
properties, enums, and namespaces**. Don't use them in `packages/commerce`.
Vite handles the app side via `ssr.noExternal`.

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

## Adding things

**A language:** drop `apps/storefront/src/lib/i18n/locales/<code>.json` next to
`en.json`, translate the values, keep the keys. It's auto-discovered via
`import.meta.glob` and appears in the header switcher. Missing keys fall back to
English. Product copy lives under `products.<slug>`; colour names under
`product.colors.<code>`.

**A store:** `SEED_STORE_ID=x SEED_STORE_DOMAIN=x.com npm run db:seed`, then add
the domain to `apps/storefront/wrangler.toml`. One Worker serves all tenants;
the `Host` header picks which. No code change.

**A domain module:** create `packages/commerce/src/<name>/index.ts` exporting an
interface plus a `create<Name>Service({ db, storeId })` factory, add a subpath to
the package `exports`, and compose it in `createCommerce()`. Follow the existing
modules — interface first, implementation second.

**Splitting a module into its own Worker:** write a second implementation of the
same interface that forwards over a Service Binding, and swap it at
`createCommerce()`. Call sites don't change. Don't do this without a concrete
reason; it costs a network hop and a deploy pipeline.

## State of play

Working: product page, cart, checkout, orders, customers, multi-tenancy, i18n
(en/es), Meta pixel + Conversions API, Cloudflare deploy pipeline.

Not built, in rough priority order:

1. **Payments.** No provider. Orders are written `pending_payment` and the
   checkout page says so — **no card details are collected anywhere**. Don't
   add a card form without a real processor behind it. Move the status
   transition into the provider's webhook.
2. **Tax.** Nothing. EU VAT/OSS and US nexus are genuinely hard — use Stripe Tax
   rather than building it.
3. **Consent gate.** The pixel loads for everyone. GDPR/ePrivacy require prior
   consent for advertising cookies before taking EU traffic.
4. **Admin.** No way to fulfil, refund, or look up a customer.
5. **Transactional email.** No order confirmation is sent.
6. **DNS.** chillmypet.com is not pointed at the Worker yet. `wrangler deploy`
   fails with "zone not found" until the domain is an active zone on the same
   Cloudflare account.

## Content and assets — provenance

Product copy (`products.dog-life-jacket` in the language packs), the variant
availability matrix in `seed.js`, and the photography in
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
