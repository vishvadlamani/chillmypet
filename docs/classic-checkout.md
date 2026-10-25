# The classic checkout

`/products/christmas-tree-costume/checkout`, since 2026-10-24: the
costume's payment page, where its product page's Add to cart goes (it was
the `shop` look before). Built from the owner's design "ChillMyPet - Classic
Christmas · Mobile - Christmas Tree Costume" (a PDF of a phone-width page,
sent in chat on 2026-10-24), with a desktop layout added on their request.

Since 2026-10-25 this is the shared template for **all six product
checkouts and `/checkout`**, on the owner's request. Product photos, designs,
sizes and quantity breaks remain catalogue-driven. The massager has no size
selector or fit advice; the basket keeps each line's quantity, Remove and
Change link. Non-seasonal products do not show a Christmas deadline.

The delivery truck is a real button, labelled in English and Spanish.
Click, tap, Enter or Space replays its journey and the stripe filling, without
moving keyboard focus, changing the basket or posting tracking events.
`prefers-reduced-motion` keeps the truck still, including after activation.
The mobile strip includes a short tap hint. This is a reusable application
template, implemented in the shared checkout component.

## What it is

One card on a white page:

- **A pine header** with the owner's logo (`/brand/logo-white.png`, not the
  design's mock wordmark) and "Secure checkout". The site's own header, cart, language switch
  and footer are off (`bareChrome` in `+layout.svelte`). A link out of a
  checkout is a way not to pay.
- **The order panel**, cream: "Congrats! You get FREE shipping!" over a
  candy-cane stripe with a truck at its end. On load the stripe fills and
  the truck drives along it, then the stripes keep sliding and the truck
  bobs. All of it stands still under `prefers-reduced-motion`. Then the
  product's photo (the gallery's photo for the chosen colour), name and
  tagline; **Colour, Size and Qty selects**; the size's weight band from the
  size guide's table; subtotal, bundle discount, shipping, total; and "A
  little peace of mind": fit (with all the size bands inline instead of a
  link out), arrival, returns.
- **The form**, paper white: the headline in Georgia, then numbered steps.
  1 Contact, 2 Delivery (apartment behind a link, city on its own row,
  state and ZIP side by side), 3 Shipping (Order placed → Tracking emailed →
  Delivered, then the two rates with **estimated arrival dates**), and
  4 Payment (Stripe's Payment Element in a bordered box). Shipping lists
  whatever `SHIPPING_RATES` offers, which is Standard only: the design's
  Express row was dropped with Express itself on 2026-10-17. Then the total
  again, the red Pay button, and the policy links.

On a phone the panel is the top of the card. Since 2026-10-25, a valid
selection is shown as colour · size · quantity with a **Change** button.
Change opens the existing selectors and focuses Colour; **Done** closes them.
An unchosen or unavailable size always leaves them open, and choosing a size
keeps them open until Done. No size or bundle is preselected. Other basket
lines remain visible with their own controls. The tagline and large
marketing intro are desktop-only; the phone starts its form with Contact.
Fit, arrival and returns advice starts collapsed, and its decorative heading
is desktop-only. The estimate directly under the total is the very same
server-calculated string used by the Standard shipping option. From 960px it sits
beside the form. It is not sticky: with the peace-of-mind card it is taller
than most windows, so it would only stick once its bottom was in view.

## Same checkout, new markup

`Checkout.svelte` renders it (`look: 'classic'`). Pricing, the cross-form
check, the card fields, InitiateCheckout, AddPaymentInfo, the post and
Purchase are the code every other look runs. The fields are the shop look's
blocks (`shop_contact`, `shop_delivery`, `shop_method`) with `look: 'classic'`
and a `step` number, so the validation rules, host-state keys, inline
errors, first/last name split and focus-the-first-error behaviour are the
shop look's, unchanged.

The selects write `design`, `size` and the product's tier field (`qty-N`)
into the same funnel state the product page's picker writes, and report
`design_selected`/`size_selected`/`bundle_selected` like the picker. So the
one-page page keeps the cart equal to them, the server prices it, and
AddToCart fires once per page view, exactly as for the picker. Quantity
offers the store's quantity breaks (1, 2, 3), so a 2 is the 7% bundle price
the server charges. The product page's hand-off link
(`?design=&size=&bundle=&added=1`) is read exactly as the `shop` look read
it: chosen on the server, no second ViewContent or AddToCart, the link
cleared from the address bar.

**Arrival dates** come from `arrivalWindow()` in `$lib/store/christmas.ts`:
today on the US west coast, plus the published promise (2–4 business days
to pack, then 5–12 days in transit), best to worst case.
`christmas.test.ts` pins them. The design's own dates were marked
illustrative; for an order on 22 October this gives Oct 31–Nov 9.

## Where it departs from the design, on purpose

- **No Apple Pay / G Pay buttons.** The design marks them "shown for
  illustration". Google Pay is off in the Stripe configuration. Apple Pay
  already appears as a tab inside the Payment Element where the device
  supports it. A separate express button would be a second purchase path
  (an order built from a wallet's address) needing its own tests. See
  docs/christmas-checkout.md for the same call on the shop look.
- **No "Billing address is the same as delivery" box.** Stripe's form asks
  for the billing country and ZIP itself. Feeding it the delivery address
  instead has to be right on every confirm, and that can't be tested
  without a live charge.
- **No "Tax, if applicable, calculated after address entry."** There is no
  tax calculation in this store, so the line would promise something that
  never happens.
- **The email note keeps the reminder promise** ("If you don't finish, we'll
  send one reminder") instead of the design's shorter line. It is what makes
  the abandoned-checkout email fair to send (AGENTS.md).
- **"On standard delivery."** instead of "On standard US delivery". Standard
  is free to every country the select offers.
- **No Express delivery row**: the store has no Express rate (above).
- **Sizes for this audience**: inputs and selects 52px tall at 17px (iOS does
  not zoom), every link and button at least 44px, nothing under 13px
  (kickers and "USD" are the 13px ones; body text is 15px and up).

## Tests

`tests/classic-checkout.mjs` (in `test:store`): the first response, the
phone (first screen, sizes, the truck moving and standing still), choosing,
bundle pricing, the product page's hand-off link, tracking, inline errors,
a placed order checked in the database, and the desktop layout.
`tests/checkout-template.mjs` covers every product and the basket, variant
editing, one-size behavior, matching arrival dates and the interactive truck.
The old one-page and shop layout suites are historical and no longer in
`test:store`; product, basket and recovery suites use the shared selectors.
With `PAYMENTS_BASE_URL`, the classic suite also loads
the real Stripe.js and checks that the Pay button stays put while the card
form loads, that cards are offered without Link, Google Pay or Discover, and
that a blocked js.stripe.com falls back to the hosted page.
