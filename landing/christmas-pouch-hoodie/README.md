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

**ViewContent** fires on load with the product slug, as on chillmypet.com.
Every event goes to dataset `1341978141149107`; the two extra pixels get the
browser half only. Nothing here goes through GTM.

## Secrets (Pages → chillmypet-christmas → Settings → Variables and Secrets)

| Name | State |
|---|---|
| `STRIPE_WEBHOOK_SECRET` | set, from `we_1UOEbvJOsB1nguzlbjDffhrK` |
| `META_CAPI_ACCESS_TOKEN` | **not set yet.** Events Manager → dataset 1341978141149107 → Settings → Conversions API → Generate access token. Until it is set, browser events still work, server copies are skipped, and the webhook answers 503 so Stripe retries each sale for up to three days and it is reported once the token exists. Redeploy after adding it. |
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
  way only the page's files are staged.
- Test the worker: `node landing/christmas-pouch-hoodie.test.mjs`.

## Content provenance

The two photos were supplied by the owner in chat as screenshots. Their original
source and licence were not stated; confirm before using them in ads. Copy is
original. There are no supplier measurements yet, so the size guide says so
rather than showing a chart.
