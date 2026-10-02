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
  per order, with the session id as `eventID`. It is browser-only (no CAPI), and
  value is one unit ($49) because the redirect does not carry the quantity.
- **`config.js` is the only file to edit**: the Payment Link URL and the pixel
  ids.

## The Payment Link

Live on the **Milligram** Stripe account (`acct_1U3NewJOsB1nguzl`), chosen by
the owner. That is neither ChillMyPet's own account nor the "Idea to Run"
account the storefront charges through, so these sales settle there and Stripe's
checkout page shows that account's name and branding. The descriptor suffix
`CHILLMYPET` is set so the charge is recognisable on a statement.

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

## To publish

Cloudflare Pages, project name **`chillmypet-hoodie`**:
`npx wrangler pages deploy landing/pouch-pet-hoodie --project-name chillmypet-hoodie`
with the owner's own account token, or drag-and-drop the zip's contents under
Workers & Pages → Create → Pages → Upload assets.

Retire it once the product page is live on chillmypet.com: deactivate the
Payment Link and point every ad at the real page.
