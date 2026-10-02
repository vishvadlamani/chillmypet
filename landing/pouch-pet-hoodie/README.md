# Pouch Pet Hoodie: standalone landing page

A stopgap so the hoodie can sell before `/products/pouch-pet-hoodie` is live on
chillmypet.com (which needs the catalogue row added with the store database's
credentials, see `npm run db:products`). It is static HTML with no build step and
no part of the storefront Worker: it does not read the store database and
nothing it sells lands there.

- **Checkout** is a Stripe Payment Link on the owner's own Stripe account
  ("ChillMP", `plink_1ULu2aJOsB1nguzlIzkLcmZG`, $49). Size is a required custom
  dropdown field (XS–XL) on Stripe's page, and the shipping address is collected
  there.
- **Colour** (Black, Gray, Pink, Cream) is picked on this page and sent as the
  link's `client_reference_id`. Stripe's page does not show it, and the Stripe
  product carries no colour and no photo on purpose, so a buyer of one colour
  is never shown another. Read the colour off the order in Stripe before
  fulfilling it.
- **Tracking** inits the same three pixels as `apps/storefront/wrangler.toml`
  and fires PageView + ViewContent, InitiateCheckout on the Buy click, and
  Purchase on `thank-you.html`. That fires only with Stripe's `session_id`, once
  per order, with the session id as `eventID`. It is browser-only (no CAPI), and
  value is one unit ($49) because the redirect does not carry the quantity.
- **`config.js` is the only file to edit**: the Payment Link URL and the pixel
  ids.

## Setup

1. The Payment Link exists (see above). Recreating it: product "Pouch Pet
   Hoodie", $49 one-off, no image, custom field Size (dropdown XS/S/M/L/XL,
   required), shipping address collection on. After payment, redirect to
   `https://<pages-host>/thank-you.html?session_id={CHECKOUT_SESSION_ID}`.
2. Put the link in `config.js`.
3. Publish this folder: Cloudflare Pages (`npx wrangler pages deploy
   landing/pouch-pet-hoodie --project-name chillmypet-hoodie` with the owner's
   own account token, or drag-and-drop under Workers & Pages → Create → Pages →
   Upload assets), or Netlify Drop.

Retire it once the product page is live on chillmypet.com: deactivate the
Payment Link and point every ad at the real page.
