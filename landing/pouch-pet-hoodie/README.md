# Pouch Pet Hoodie: standalone landing page

A stopgap so the hoodie can sell before `/products/pouch-pet-hoodie` is live on
chillmypet.com (which needs the catalogue row added with the store database's
credentials, see `npm run db:products`). It is static HTML with no build step and
no part of the storefront Worker: it does not read the store database and
nothing it sells lands there.

- **Checkout** is a Stripe Payment Link on the owner's own Stripe account. Size
  is a required custom dropdown field (XS–XL) on Stripe's page, and the shipping
  address is collected there.
- **Tracking** inits the same three pixels as `apps/storefront/wrangler.toml`
  and fires PageView + ViewContent, InitiateCheckout on the Buy click, and
  Purchase on `thank-you.html`. That fires only with Stripe's `session_id`, once
  per order, with the session id as `eventID`, and value is one unit ($49)
  because the redirect does not carry the quantity.
- **The server half of Purchase** is `functions/api/stripe-webhook.js`, a Pages
  Function at `/api/stripe-webhook`. See "The webhook" below.
- **`config.js` is the file to edit** for the Payment Link URL and the pixel
  ids.

## The Payment Link

Live on the **ChillMP** Stripe account (`acct_1U3NewJOsB1nguzl`), chosen by
the owner. It was named Milligram until the owner renamed it, and Stripe's
checkout page shows the account's name and branding. The descriptor suffix
`CHILLMYPET` is set so the charge is recognisable on a statement. The account
also carries the storefront's webhook endpoint
(`https://chillmypet.com/api/stripe/webhook`, seven events), so hoodie events
reach that endpoint too. It ignores them.

Do not also connect Stripe's own Meta integration on this account. It would
report each sale under an event id of its own, and Meta would count every
hoodie twice.

| | |
|---|---|
| Link | https://buy.stripe.com/fZu28sfbIgamgIe8tp1wY01 (`plink_1ULu2aJOsB1nguzlIzkLcmZG`) |
| Product | `prod_VMc9qoS3upuwT6`, "Pouch Pet Hoodie" |
| Price | `price_1ULu2LJOsB1nguzldpv94rU1`, $49 one-off |

- Quantity is fixed at **one**. A single Size field cannot describe two hoodies
  of different sizes, and it keeps the thank-you page's one-unit Purchase value
  true. A buyer who wants two places two orders.
- **Size** is a required dropdown (XS–XL). It is on the Checkout Session's
  `custom_fields` and in the Dashboard under the payment, and that is where
  fulfilment reads it.
- Shipping address and phone are collected; countries are the storefront's
  `COUNTRY_CODES` less the seven Stripe will not ship to (CU, FM, IR, KP, MH,
  PW, SY).
- **No shipping rate is attached.** The total is $49, which is what "free
  standard shipping" means. The note beside the address field repeats the
  page's delivery times.
- After payment Stripe redirects to
  `https://chillmypet-hoodie.pages.dev/thank-you.html?session_id={CHECKOUT_SESSION_ID}`.
  The product image is `https://chillmypet-hoodie.pages.dev/hoodie-black.jpg`.
  **Both need this folder published under that exact project name.** If
  Pages hands you a different host, edit the link's after-payment redirect and
  the product image in the Dashboard to match.

## The webhook

Browsers lose a share of Purchase events to iOS and ad blockers, so Stripe
also reports each sale server-side. On `checkout.session.completed` (when
`payment_status` is `paid`) and `checkout.session.async_payment_succeeded`,
the function verifies Stripe's signature. It then sends a Conversions API
Purchase to dataset **1341978141149107**, the ad account that runs the ads and
the same `META_PIXEL_ID` as the storefront.

- **One sale, not two.** The `event_id` is the Checkout Session id, which is
  what `thank-you.html` passes as `eventID`, so Meta merges the two halves.
- **Only hoodie sessions.** The Payment Link's metadata (`slug:
  pouch-pet-hoodie`) is copied to every session it creates. Anything without
  it is acknowledged and ignored. The storefront's own webhook on the same
  Stripe account still sees these sessions, and ignores them because no order
  stands behind them.
- **Failures retry.** Reporting is this endpoint's only job, so it answers
  503 when a secret is missing and 502 when Meta rejects the event. Stripe
  retries for three days and shows the failure in the Dashboard. Meta dedupes
  the retries on `event_id`.
- **Buyer details** (email, phone, name, city, postcode, country) are
  normalized and hashed by `packages/ecomwithai/src/marketing`, the same code
  the storefront uses.

It needs two Pages secrets:

| Secret | Where it comes from |
|---|---|
| `STRIPE_WEBHOOK_SECRET` | The `whsec_…` of the Stripe endpoint pointing at `https://chillmypet-hoodie.pages.dev/api/stripe-webhook`. This is its own endpoint, not the storefront's. |
| `META_CAPI_ACCESS_TOKEN` | Events Manager → dataset 1341978141149107 → Settings → Conversions API → Generate access token. A token for any other dataset is rejected. |

Set each one with `npx wrangler pages secret put <NAME> --project-name chillmypet-hoodie`.
Optionally, setting `META_TEST_EVENT_CODE` sends events to Events Manager →
Test events instead. Remove it after checking.

`npm run test:hoodie` signs fake Stripe events and stubs Meta, offline. It also
runs as part of `npm test`.

## To publish

Cloudflare Pages, project name **`chillmypet-hoodie`**, with the owner's own
account token in `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`:

```sh
npm run deploy:hoodie
```

`deploy.sh` stages only the files a visitor needs. Without it, the README and
the tests would be served as pages, and the webhook would not be built. Do not
drag and drop the folder into the dashboard: that publishes the page without
the webhook.

Retire it once the product page is live on chillmypet.com: deactivate the
Payment Link and point every ad at the real page.
