# Christmas Pouch Hoodie page

Live at **https://chillmypet-christmas.pages.dev**: a standalone page that
sells the Christmas Pouch Hoodie through Stripe Payment Links, the same shape
as the Pouch Pet Hoodie page in `landing/pouch-pet-hoodie` on the
`claude/eager-albattani-wgnbcn` branch. It is separate from the storefront on
chillmypet.com and shares no code or database with it.

| | |
|---|---|
| Cloudflare | Pages project `chillmypet-christmas`, account `5fef1d1dbb6eaee72fdfc2b26a61a386` (the owner's) |
| Stripe | ChillMP, `acct_1U3NewJOsB1nguzl`, live |
| Products | 8, one per design and size (`prod_VP2apRPGQEClji` … `prod_VP2bV3r43YVy6x`), $54.99 each |
| Payment Links | 8, listed in `config.js`; each one's metadata carries `slug` and `sku` |
| Webhook | `we_1UOEbvJOsB1nguzlbjDffhrK` → `/api/stripe-webhook`, `checkout.session.completed` and `checkout.session.async_payment_succeeded` |

## Design

Laid out on the MerryPaws product page at merryechoco.com, section by section,
with its type scale, colours and spacing measured at 1440 and 390 wide. The
Figma file holds both frames, the colour tokens and the components:
https://www.figma.com/design/y7HKSgoD144ytJIwmU1sva

What was **not** carried over, on purpose: a countdown to a sale that resets
(ours counts to the real Christmas cut-off), a struck-through "was" price, a
star rating, reviews and a "knock-off" comparison. There are no reviews to
show, and invented ones are fake testimonials. Their places hold benefit
cards, a safety note and a comparison with carrying your pet in your arms.
Every photo on the page is one of the two product shots; the close-ups zoom
them with CSS rather than adding images nobody has the rights to.

## How a sale flows

1. The shopper picks a design and a size on the page. There is no default size,
   and Buy asks for one.
2. Buy fires **AddToCart** and **InitiateCheckout** (browser pixel plus a
   `/api/event` server copy under the same event id; content id is the SKU,
   e.g. `CMP-XH-STOCKING-GREEN-L`), then opens that combination's Payment Link.
3. Stripe collects payment and the shipping address, then redirects to
   `thank-you.html?sku=…&session_id=…`, which fires the browser **Purchase**
   with the session id as its event id.
4. Stripe's webhook reaches `_worker.js`, which sends the server **Purchase**
   under the same session id with the buyer's hashed details. Meta keeps one.

Every event names the visitor with one `external_id`: `pixel.js` mints a random
64-hex id into the `cmp_vid` cookie, passes it to each `fbq('init')`, and the
worker sends the same string with each `/api/event` copy. Buy appends it to the
Payment Link as `client_reference_id`, the one value a link carries through to
the session, and the webhook's Purchase sends it back as `external_id`. That is
how the sale is tied to the visitor's earlier events. The webhook is Stripe's
request, so it has no IP, user agent, `_fbp` or `_fbc` for the buyer.

The webhook Purchase still lacks `client_user_agent`, which Meta lists as
required for website events. The fix needs somewhere to keep the browser's
details between InitiateCheckout and the webhook, such as a KV namespace bound
to this Pages project and keyed by the visitor id. That means setting something
up in the owner's Cloudflare account, so it has not been done.

Meta does not refuse a Purchase without it: chillmypet.com sent exactly that
for weeks, and Meta accepted every one and scored its match quality at 0 (see
AGENTS.md). So every failure the webhook meets is answered non-2xx, which
Stripe resends for three days and shows as a failing endpoint. That includes
a refusal Meta would repeat (code 100 and the like, `reason: meta_refused`),
because such a refusal is a bug in the event and hits every sale. Answered
2xx, the sales would be lost while Stripe reported success. A failure a resend
can fix, such as Meta down, a rate limit or a token someone needs to replace,
is `reason: meta_unavailable`. Meta's message is in `detail` either way,
readable in the Stripe Dashboard's delivery log.

## Testing it yourself: quiet mode

Open **https://chillmypet-christmas.pages.dev/?test** and a yellow banner says
test mode is on. For a day, or until **Turn test mode off** (`?test=off`), that
browser sends nothing to Meta, from the page or the thank-you page, and Buy
marks the Stripe checkout `client_reference_id=test_…`, so it is easy to tell
apart in the Dashboard. If a test checkout is paid, the webhook sees `test_`
and does not report it (`reason: test`). The Payment Links are live, so a
payment is real money: refund it in Stripe.

It is a `cmp_test` cookie set for the whole `chillmypet-christmas.pages.dev`
family, because Stripe sends every buyer back to the live thank-you page.
`_worker.js` also drops `/api/event` copies that carry it.

## Previews of a change

Every pull request that touches this folder gets a copy of the page at
**https://pr-&lt;number&gt;.chillmypet-christmas.pages.dev**, linked in a
comment on the pull request, through `.github/workflows/preview-christmas.yml`.
The page's tests run first, so a broken change shows up before it is approved
rather than after. A preview host is always in quiet mode, with a PREVIEW
banner: looking at a change never counts as a visitor, and buying from it is
marked `test_`. `deploy.sh` publishes previews only through `PREVIEW=pr-<n>`,
and refuses `main`, so a preview can never replace the live page.

**ViewContent** fires on load with the product slug, as on chillmypet.com. Its
server copy, like PageView's, waits up to 3 s for the pixel's `_fbp` so it can
carry it, and goes at once if the visitor leaves first: a bounce must not keep
the browser's half and lose the server's, which Meta counts against coverage.
Every event goes to dataset `1341978141149107`, the only pixel on the page.
Two more were taken off on 2026-10-11: `28272021345717397`, which was in no ad
account the owner can see and nobody could say whose it was, and
`1363695699271757`, the retired CZK ad account's, which nothing running used. Nothing here goes through GTM.

### Checked on the live page, 2026-10-11

With 17 clicks and no AddToCart reported, the live page was driven in a
browser as an ad click (iPhone Facebook in-app user agent, `fbclid` on the
URL), with every `facebook.com/tr` hit, every `/api/event` post and the
Payment Link answered locally, so nothing reached Meta or Stripe. Load sent
PageView and ViewContent to all three pixels with `external_id` and `fbc`,
plus their server copies. Picking a size and tapping Buy sent AddToCart and
InitiateCheckout under shared event ids about 120 ms before the redirect to
Stripe, with `client_reference_id` on the link. `thank-you?session_id=…`
sent Purchase with the session id as its event id. The eight links redirect
there, and Pages' 308 from `thank-you.html` keeps the query. So a zero in
Ads Manager means no ad visitor tapped Buy with a size chosen, not that the
event was lost. The ViewContent the ads report proves the page's events
reach the dataset and are credited to the ad.

A second run let Stripe load for real (Stocking Green, size L). The Payment
Link opened Stripe's checkout showing "Christmas Pouch Hoodie — Stocking Green,
size L", $54.99, with the shipping and card form, and the run stopped there.
That leaves one unpaid session in the Dashboard, which expires by itself. Each
such run does the same, so keep them rare. The other seven links were checked
through the API instead: all active, $54.99, each redirecting to `thank-you`
with its own SKU. Paying is the one step never run live. Proving it takes a
real purchase and a refund, which costs Stripe's fee and puts a fabricated
Purchase in front of the ad set, so it needs the owner's say-so.

## Ads that land here

As of 2026-10-11: "Christmas Hoodie Campaign - Copy" (Meta ad account Vish
Kanada, $10/day, 10–20 Oct), optimising for **Purchase** on
`1341978141149107`. The original "Christmas Hoodie Campaign" is paused and
still set to AddPaymentInfo, which this page can never send: the card is typed
on Stripe's page, which reports nothing to the pixel. Before restarting it,
switch its conversion event to Purchase, or to AddToCart or InitiateCheckout
for more signal at a small budget.

`chillmypet-hoodie.pages.dev` redirects here since 2026-10-11, query string
kept, so "link in bio" visitors from the hoodie Reels arrive here too.

There is no GA4 on this page. The ads' `utm_*` tags reach the URL but nothing
here reads them, and a visitor who clicks through to chillmypet.com shows in
GA4 as a referral from `chillmypet-christmas.pages.dev`. Ads Manager and
Stripe are the record of what happens here.

## Secrets (Pages → chillmypet-christmas → Settings → Variables and Secrets)

| Name | State |
|---|---|
| `STRIPE_WEBHOOK_SECRET` | set, from `we_1UOEbvJOsB1nguzlbjDffhrK` |
| `META_CAPI_ACCESS_TOKEN` | set. Confirmed 2026-10-11 from outside: an unsigned POST to `/api/stripe-webhook` answers `invalid_signature`, which the worker only reaches once both this and `STRIPE_WEBHOOK_SECRET` are present (without either it answers 503 and names the missing one). That proves the token exists, not that Meta accepts it: a token generated for another dataset is rejected into the logs, and Events Manager then reports this page's events as server events with no dedupe key and 0% coverage. **https://chillmypet-christmas.pages.dev/api/meta-status** answers which: it asks Meta with an empty batch (no event sent) and reads `"server_events": "accepted"` (200) or says why not (503). To replace it: Events Manager → dataset 1341978141149107 → Settings → Conversions API → Generate access token, set it here, then redeploy. |
| `META_TEST_EVENT_CODE` | optional, to watch events in Test Events; remove it afterwards |

## Changing things

- Prices, links, the Christmas cut-off date and the pixel list live in
  `config.js`. The cut-off is a value, worked out from the promise (4 business
  days + 12 days in transit, worst case): Mon 7 Dec 2026. The strip hides itself
  once that day is over in Los Angeles.
- A new size or design needs a Stripe product, a Payment Link with the same
  `slug`/`sku` metadata and the redirect pattern above, and an entry in `config.js`.
- Publish: merging a change to this folder publishes it, through
  `.github/workflows/deploy-christmas.yml`. That needs the
  `OWNER_CLOUDFLARE_API_TOKEN` repository secret, a token for account
  5fef1d1d… (the repo's `CLOUDFLARE_API_TOKEN` is for Vish's account and cannot
  reach this project). By hand: `CLOUDFLARE_API_TOKEN=… ./deploy.sh`. Either
  way only the page's files are staged. Before that, each pull request gets a
  preview (see above).
- Test the worker: `node landing/christmas-pouch-hoodie.test.mjs`.

## Content provenance

The two photos were supplied by the owner in chat as screenshots. Their original
source and licence were not stated; confirm before using them in ads. Copy is
original. There are no supplier measurements yet, so the size guide says so
rather than showing a chart.
