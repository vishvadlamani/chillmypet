# The shop checkout look

`checkout: 'shop'` in `pages.ts`: a checkout laid out like a hosted shop
checkout. Since 2026-10-18 it is the costume's,
`https://chillmypet.com/products/pet-christmas-costume/checkout?design=…&size=…&added=1`,
where the product page's **Add to cart** goes. It was built on 2026-10-17 for
the Christmas Pouch Hoodie, whose landing page's Buy now sent buyers to it;
that hoodie and its landing page were retired on 2026-10-18 (AGENTS.md, "The
retired landing pages"), so the parts below about the landing page are
history. This file holds what the reference looked like, which way it was
built and why, and where the build departs from the reference on purpose.

## The reference, measured 2026-10-17

The owner pointed at a Shopify checkout session on another shop
(`www.nifry.store/checkouts/cn/…`). The link still loaded; Shopify answered
it with a 302 to a fresh session token. It was opened in Chromium at
**390×664** (an iPhone in the Facebook app) and **1280×900**. Its layout was
written down below, with computed styles. Only the layout came across. Its
logo, product, words, prices and policies did not: AGENTS.md's provenance
rule. Screenshots of it are in the pull request, not in this repo.

Type throughout: the system stack (`-apple-system`, renders like Inter),
**14px** body at 1.35 line height, black text, `#707070` for secondary text,
`#005bd1` for links and the button. Field borders 1px `#dedede`, radius
12px. Page white, summary panel `#f5f5f5`. Gutter 14px on a phone.

| Section | Phone (390) | Desktop (1280) |
|---|---|---|
| Header | 67px. Logo centred, bag icon on the right linking to the cart. | 66px, full width, bottom border, same arrangement. |
| Order summary | A 64px grey bar right under the header: "Order summary ⌄" in link blue on the left, the total (18px) on the right. Tapping opens it in place: 64px photo with a black quantity badge, name, price; Subtotal; Shipping "Enter shipping address"; **Total** with a small grey "EUR" before the amount. | The right half of the page from x=690, grey, content 400px wide from x=730: the same lines, never folded. |
| Express pay | "Express checkout" (14px grey, centred), then Shop Pay full width, PayPal and Google Pay half each, all 48px, radius 12. A line with "OR" under them. | One row of three 48px buttons, then "OR". |
| Contact | "Contact" h2 600 20px, "Sign in" link on the right. Email field 47px, label inside, help icon. A checkbox "Email me with news and offers", **ticked in advance**. | Same, left column 500px wide (x 150 to 649). |
| Delivery | "Delivery" h2. Country select (label raised, value under it), then first name, last name, address, apartment (optional), postal code, city, phone (help icon). Every field full width, 12px apart. | First and last name side by side; postal code and city side by side. |
| Shipping method | h2 at 16px/600. A grey box: "Enter your shipping address to view available shipping methods." | Same. |
| Payment | "Payment" h2, then "All transactions are secure and encrypted." in grey. A bordered accordion: Credit card (selected radio, card logos, "+2"), opening a grey panel with card number, expiry, security code, name on card, and "Use shipping address as billing address" ticked; then a PayPal row. | Same. |
| Save info | "Save my information for a faster checkout" (a Shop account opt-in), "Not now". | Same. |
| Totals by the button | Photo, "Total", "1 item", "EUR €59.95 ⌄". | Not repeated: the summary is beside the form. |
| Pay button | "Pay now", 50px, full width, `#005bd1`, white 600 14px, radius 12. | Same, 500px. |
| Footer links | Refund policy, Shipping, Privacy policy, Terms of service, Legal notice, Contact: 14px link blue, underlined, wrapping. | Same. |
| Discount field | **None**: this shop has the discount code box switched off (no "discount" or "gift card" anywhere in the page). | None. |

**Errors.** Pressing Pay now with nothing filled posts nothing. Each
missing field gets a 2px red border (`#d91c1c`) and a red 14px message
under it: "Enter an email", "Enter a first name", "Enter a ZIP / postal
code" and so on, card fields included. The first one is focused, with a
soft red ring. There is no summary at the top or by the button.

## Two ways to build it, and the one taken

**(a) A new checkout inside the landing page on Cloudflare Pages**: Stripe's
Payment Element with a deferred PaymentIntent created by a Pages function.

**(b) Send Buy to chillmypet.com's existing one-page checkout** and lay that
page out like the reference. **Taken.**

What decided it is everything AGENTS.md treats as invariant, and where each
already exists:

| | (a) Pages function | (b) chillmypet.com |
|---|---|---|
| Order row, admin queue, confirmation email | None. The Pages project is on the owner's Cloudflare account and cannot reach the Turso database (Vish holds that token). | Yes. |
| Prices re-checked on the server | Would have to be written again (a price table in the function). | `/api/cart` and `placeOrder`. |
| Stock decrement guarded | No stock at all. | `orders.create()`'s guarded update. |
| Purchase from the webhook, event id derived from the order | A second webhook and a second id scheme (a PaymentIntent id). | `purchaseEventId()`, unchanged. |
| Browser and server events sharing one `event_id` | The landing page's own scheme. | The storefront's, already tested. |
| Link hidden, only the methods Stripe has on | Would have to be repeated. | `CardFields`: `wallets: { link: 'never' }`, the account's configuration. |
| Hosted fallback when Stripe.js is blocked | Would have to be written. | `cardReady=0`, tested. |
| Apple Pay | Needs `chillmypet-christmas.pages.dev` registered as a payment method domain on ChillMP, a Stripe settings change. | chillmypet.com is registered. |
| Address bar while paying | `…pages.dev` | `chillmypet.com` |

(b) covers what was asked (an on-page checkout in the reference's layout,
buying never leaving for buy.stripe.com) with every guarantee above in
place. (a) would have rebuilt half of them on a second stack. It is also
what AGENTS.md's "Where the Christmas ads should land, decided 2026-10-12"
argued for.

## What was built

`PRODUCT_PAGES[slug].checkout = 'shop'` gives that product's
`/products/<slug>/checkout` page the shop look (the costume today; the
reindeer hoodie keeps the default look). In order:

- **Header**: the logo centred, a padlock with "Secure checkout" where the
  cart would be. No
  cart, language switch or site footer: a link out of a checkout is a way
  not to pay.
- **Order summary**: on a phone a bar under the header ("Show order
  summary ⌄" and the total) that opens in place; on a desktop the right
  half, grey, sticky. Photo with quantity badge, design · size, price,
  subtotal, bundle discount when there is one, shipping, total with "USD".
- **The choice**: the picker, folded to one line ("Green · Size: M",
  Change) when the link carries a colour and size. Arriving without
  one, the whole picker shows.
- **Contact**: email, with the existing note under it (receipt, and the one
  reminder; that note is what makes the reminder fair to send).
- **Delivery**: country, first name, last name, address, apartment
  (optional), city, state, ZIP. Side by side on a desktop as in the
  reference; on a phone the town has its row and state and ZIP share one.
  Labels and required-ness follow the country (`countryForm`).
- **Shipping method**: a bordered list, Standard (Free) only since
  2026-10-17 (Express is off, see `SHIPPING_RATES`), with the Christmas
  cut-off line under it while it applies.
- **Payment**: Stripe's Payment Element in the page's colours and type,
  inside a box that holds its final height while Stripe.js loads.
- **Total by the button** (phone), **Pay $27.99**, then the policy links.

**Errors** are the reference's pattern: nothing posts, each missing field
turns red with its own message under it, focus goes to the first one and
the page scrolls there. One line by the button says the details are marked
above, since on a phone the button is two screens below the first field.
The server's own verdict (`fieldErrors`) is listed there too.

## Where it departs from the reference, on purpose

- **Text 16px and up, fields 60px.** The reference sets 14px text and 47px
  fields. The audience is mostly women over 55 on a phone. Every label,
  message and note here is 16px or more, inputs are 17px (iOS does not zoom
  on focus), and every button and link is at least 44px tall. The floating
  label stays 16px when it rises instead of shrinking to 12px, which is why
  the fields are taller.
- **No express-pay row.** The only wallet ChillMP has on is Apple Pay (Google
  Pay is off; Link is hidden on the owner's instruction; there is no PayPal
  or Shop Pay). Apple Pay is generally not offered inside the Facebook app's
  browser, where most of these buyers are (not verified on a device here),
  and in Safari it is already a tab in the Payment Element. An Express Checkout Element would show nothing to most
  buyers and duplicate the tab for the rest. It is also a second purchase
  path, an order built from a wallet's address, that would need its own
  tests. Left for a decision.
- **No pre-ticked "Email me with news and offers".** A box ticked in
  advance is not consent in the EU, and the seller is Czech. There is no
  marketing list to put anyone on either.
- **No "Sign in", no "Save my information".** There are no accounts.
- **No phone field.** It is the field people abandon on, and nothing in this
  flow uses it (AGENTS.md, checkout manifest).
- **Shipping methods show from the start.** The reference waits for an
  address because its rates depend on one. Ours are the same everywhere,
  and showing "Free" early is a reason to keep going.
- **No "Use shipping address as billing address" box.** Stripe's own form
  asks for the billing country and ZIP; handing it the shipping address
  instead (`billingDetails: 'never'`) has to be right on every confirm or
  the payment fails, and it cannot be tested without a live charge.
- **No discount field**, as in the reference. The bundle discount, when a
  buyer takes two, is a line in the summary.
- **ChillMyPet colours**: deep green `#173d2b` for the button, links and
  selected states, red `#b00020` for errors, cream `#f6f3ee` for the summary
  panel. Inter for type.

## The Payment Element does not move

Measured on the live checkout before this change, the payment box grew in
three steps as Stripe.js loaded (0, 192, 238, 381px on a phone) and pushed
the pay button down. Now its container reserves the finished element's
height: 316px stacked, 236px from 440px of width, where Stripe puts country
and ZIP side by side. `display: flow-root` keeps Stripe's own -4px margins
inside it. Measured with the real Stripe.js and the live publishable key:
the pay button stays at the same pixel from first paint to ready, at 390
and 1280 wide. `tests/shop-checkout.mjs` checks it when `PAYMENTS_BASE_URL`
is given. Change `SHOP_APPEARANCE` and the numbers go stale: measure again.
The test catches a box that grows while loading, not one reserved too tall.

## Tracking

- **AddToCart** is sent by the product page when Add to cart is tapped (the
  event the ad set optimises for). The link carries `added=1` and the
  checkout sends no AddToCart of its own for that page view, even if the
  size is changed there. One tap, one add. The product page sent the
  ViewContent too, so the checkout sends none.
- **InitiateCheckout** is sent once the email or name is typed.
- **AddPaymentInfo** fires when Pay is pressed, as on every chillmypet.com
  checkout.
- **Purchase** fires from the Stripe webhook with the order-derived event
  id, and from the receipt page under the same id.
- **The visitor** is chillmypet.com's own `cmp_vid`. (The landing page used
  to hand its id over as `?vid=`; since 2026-10-18 that is ignored.)
  `fbclid` and the `utm_` tags ride along, so the Parameter Builder builds
  `_fbc` from the click.

## Still to do

**One real order placed and refunded on ChillMP: not done.** It is a real
charge and a real Purchase in front of the ad set, so it is the owner's
call. Until it is done the inline payment path on ChillMP is unproven end
to end.

Also: chillmypet.com has no quiet mode. A test visit counts a real
PageView, ViewContent and (once an email is typed) InitiateCheckout.
