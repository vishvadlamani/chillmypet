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
  per order, with the session id as `eventID`. Value is one unit ($49), which is
  exact: the Payment Link's quantity is fixed at one.
- **Server copies (Conversions API)** come from `_worker.js`, which Pages runs
  in front of the files (`_routes.json` limits it to `/api/*`). Every browser
  event is also posted to `/api/event` under the same id, and the worker sends
  it to Meta with the visitor's IP, user agent and `_fbp`/`_fbc`, so Meta keeps
  one of the two and the copy an ad blocker or iOS stops still arrives. The
  thank-you page posts its session id to `/api/purchase`; the worker asks Stripe
  whether that session is complete, paid and from this Payment Link, and only
  then sends Purchase with the buyer's hashed email, phone, name and address.
  `/api/event` refuses Purchase, so nobody can claim a sale through it. Only
  pixel `1341978141149107` (the one the ad set optimises against) gets server
  copies: a CAPI token belongs to one dataset. The other two stay browser-only.
- **Colour** (Black, Gray, Pink, Cream) is picked on this page, not on
  Stripe's: the swatches swap the photo and append
  `?client_reference_id=<colour>` to the Payment Link, which is the only value a
  Payment Link URL can carry. Fulfilment reads it from the Checkout Session's
  `client_reference_id` (also on the `checkout.session.completed` event). A
  session without one predates the colours and is Black. `?colour=pink` on this
  page's URL preselects a colour, for an ad per colour.
- **`config.js` is the only code to edit**: the Payment Link URL, the pixel
  ids and the colours (each a `hoodie-<colour>.jpg` beside it).

## Layout

Modelled on the structure of thehuggiez.com's pet hoodie page, which the owner
pointed at: a shipping strip, a gallery with one thumbnail per colour (the
thumbnails, arrows, swipe and swatches are all one choice, so the photo on
screen is always the colour sold), the buy box with details under the button,
three alternating photo-and-copy rows, size help, FAQ, the guarantee, and on
phones a buy bar that docks once the main button has scrolled away.

What that page has and this one deliberately does not: a sale countdown, a
"low stock" flag, a struck-through "was" price, customer reviews, a size chart
and a pet weight limit. There is no sale, stock is not counted here, the hoodie
has only ever been offered at $49 (the $55 link was live for hours, not a
genuine former price), nobody has reviewed it yet, and there are no
manufacturer measurements or load figures. Each would be a claim the page can't
back; add them when they are true, not to fill the page.

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

Cloudflare Pages, project name **`chillmypet-hoodie`**, production branch
`main`. Publish this folder **without this README**, which names the Stripe
account and is not part of the page.

Use the CLI, with a token for that account in `CLOUDFLARE_API_TOKEN`: copy the
folder minus `README.md` to `dist/`, then
`npx wrangler pages deploy dist --project-name chillmypet-hoodie --branch main`.
Without `--branch main` wrangler names the deploy after the git branch and it
lands as a preview, not on the live URL. Prefer this over a dashboard zip
upload, which is not guaranteed to pick up `_worker.js`: the page would look
fine and quietly send no server events.

### Secrets for the server copies

On the project: Settings → Variables and Secrets → Production, as **Secret**:

| Name | Where it comes from |
|---|---|
| `META_CAPI_ACCESS_TOKEN` | Events Manager → pixel `1341978141149107` → Settings → Conversions API → Generate access token. A token for any other pixel is rejected. |
| `STRIPE_SECRET_KEY` | Stripe Dashboard (the account holding the Payment Link) → Developers → API keys → Create restricted key, with **Checkout Sessions: Read** and nothing else. |
| `META_TEST_EVENT_CODE` | Optional. Set it to the code Events Manager → Test Events shows to watch a run live; delete it afterwards, or every event stays out of ads reporting. |

Secrets take effect on the next deploy, so deploy after adding them. Without
them the page works exactly as before and sends no server copies; the worker
logs why (`wrangler pages deployment tail`).

### Check it

- With a cache-busting query (`?cb=1`): a new photo should come back as
  `image/jpeg`, and a missing one falls through to the page as `text/html`.
- `curl -i -X POST https://chillmypet-hoodie.pages.dev/api/event -d 'x'`
  must answer **400**. A 405 or the page's HTML means the worker did not
  deploy.
- Events Manager → the pixel → Overview: PageView, ViewContent and
  InitiateCheckout should show both **Browser** and **Server**, with
  deduplication reported. Purchase shows Server from the first real order.

`node landing/pouch-pet-hoodie.test.mjs` runs the worker against mocked Meta
and Stripe; run it after any change to `_worker.js`.

Retire it once the product page is live on chillmypet.com: deactivate the
Payment Link and point every ad at the real page.
