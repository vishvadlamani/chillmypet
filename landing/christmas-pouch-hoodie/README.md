# Christmas Pouch Hoodie page

Live at **https://chillmypet-christmas.pages.dev**: the page the Christmas
ad lands on. The buyer chooses a design and a size here; **Buy now** takes
them to **chillmypet.com's checkout for this hoodie**
(`/products/christmas-pouch-hoodie/checkout`), with that choice made, where
they pay on the page. Until 2026-10-17 Buy opened one of eight Stripe Payment
Links instead. Why it changed and what the checkout looks like:
`docs/christmas-checkout.md`. The page itself shares no code or database
with the storefront; the sale happens there.

| | |
|---|---|
| Cloudflare | Pages project `chillmypet-christmas`, account `5fef1d1dbb6eaee72fdfc2b26a61a386` (the owner's) |
| Stripe | ChillMP, `acct_1U3NewJOsB1nguzl`, live |
| Buy now | `https://chillmypet.com/products/christmas-pouch-hoodie/checkout?design=…&size=…&added=1&vid=…`, plus the visit's `fbclid` and `utm_*` (`config.js: checkout`) |
| Payment Links | 8 (`plink_1UOEWYJOsB1nguzlJXtjB3lf` … `plink_1UOEYtJOsB1nguzlezFxeKMv`) on products `prod_VP2apRPGQEClji` … `prod_VP2bV3r43YVy6x`. **No longer linked from the page**, still active in Stripe; deactivating them is a Stripe change for the owner |
| Webhook | `we_1UOEbvJOsB1nguzlbjDffhrK` → `/api/stripe-webhook`, `checkout.session.completed` and `checkout.session.async_payment_succeeded`. Only a sale through one of those links reaches it now |

## Who the page is for, and what it does about it

The ad "!Christmas Hoodie Ad!" (10–12 Oct 2026: 2,635 impressions, 152 link
clicks at 5% CTR, 123 landing page views, 0 AddToCart, 0 purchases, no real
checkout opened in Stripe) brings women of 55 and over, on an iPhone or
Android phone, inside the Facebook app. The page was walked as that visitor
on 2026-10-12, at 390×664 (iPhone 13) and 375×568 (iPhone SE) with the
Facebook in-app user agent, and this is what stopped her, worst first:

1. **The ad shows a different hoodie.** Its video is a woman on a plane in a
   red fleece hoodie with a big zipped front pouch and a puppy, captioned
   "Small dog owners this one's for you", and the running variant is cut
   from the same clip. The page sells an embroidered Santa or stocking
   hoodie with a cat looking out of a ring. A visitor who tapped for the
   puppy hoodie lands on something she does not recognise, and leaves. The
   page cannot fix this; the ad or the product has to. (The video's source
   and licence are unknown; see Content provenance.)
2. **Nothing to buy on the first screen.** Two bars, a header and a square
   photo filled it; the name, the price and Buy were 1.7 screens down.
3. **Buying was three steps across two controls she had to discover**: a
   design card, then a 31px-tall dropdown labelled "Size" in 12px grey, then
   Buy, which answered with a red error if the dropdown was missed.
4. **Text too small to read at 60.** Benefits 12px, labels 12px, the
   guarantee line 11px, the accordion 13px, a pill at 8px, body copy at 75%
   black.
5. **No reason to trust a pages.dev address with $54.99**: no "who we are",
   contact only as a footer email, "secure checkout" in the legal line, card
   logos drawn as coloured boxes, and a Discover logo the account cannot
   honour (below).
6. **Written to the wearer only.** The audience is as likely to be buying
   for a daughter or a grandchild as for herself, and nothing said so.
7. **Size anxiety with no help**: "measurements are on their way" and no
   table, for a garment she cannot try on.
8. **The sticky Buy only appeared after scrolling past Buy**, and tapping it
   just scrolled back up.

So the page now opens with: a 16:9 crop of the product photo with the
photo strip over its foot, the name and price, the two designs as photo
tiles, the four sizes as 50px buttons, and Buy, which on an iPhone 13 ends
at 646px of a 664px screen. The ad's own first line ("Cat & small dog
owners, this one's for you") sits straight under the button, with free
shipping and 30-day returns beside the price, as the ad promises them. A
sticky bar names the design and size chosen so far and offers Buy, or
"Pick a size", whenever both the button and the size buttons are off the
screen (it stays away while the size buttons are visible, which it would
otherwise cover on a short phone). Then, in order: what you get (the same
two photos zoomed with CSS), a gift section, the size help, "Who you're
buying from", questions, the guarantee. Base type is 17px, nothing that
matters is under 15px, text is near-black on cream, and every tap target is
44px or more.

Still true, on purpose: no countdown seconds (the bar says "Order by DEC 7
for Christmas · 57 days left"), no "was" price, no star rating, no reviews,
no sales count, no "selling fast". There are none to show, and an invented
one is a fake testimonial under 16 CFR 465. The test file asserts the page
carries no such claim.

The product photos were measured, not the ad's video: the video is of
another garment. `config.js: video` is there for the day a clip of this
hoodie exists (below).

### Payment methods, as Stripe really offers them

The buyer now pays in chillmypet.com's inline Payment Element, which draws
from the same account configuration and hides Link in code (`wallets: {
link: 'never' }`). Read from the ChillMP account on 2026-10-12, for the
Payment Links this page used then. They set no `payment_method_types`, so
Checkout drew its list from the account's default payment method
configuration (`pmc_1U3NfSJOsB1nguzljz7ADcR4`) and the visitor's country:

- A Checkout Session opened from a US visit offered **card and Link**.
- Sessions opened from Czech visits offered card, Link and **Klarna**. Klarna
  does not appear for the US visitor the ads bring, so the page does not
  mention it or any pay-later option.
- **Apple Pay** is on in the configuration; **Google Pay is off**, so Android
  visitors (part of the audience) get no wallet. Turning it on is a Stripe
  Dashboard setting (Settings → Payment methods), not a page change.
- Cards: Visa, Mastercard and American Express are accepted from every
  Stripe account country. **Discover** is not accepted by accounts in
  Czechia (Stripe's card brand table), so its logo came off the page. If
  the account's country is not Czechia, check and put it back.

The page therefore says: Visa, Mastercard, Amex, Apple Pay. Not Link, which
the checkout hides. The test file asserts that Link, Google Pay, Klarna,
Afterpay, Affirm, PayPal, Discover and "pay later" are absent; when one is
turned on in Stripe, update the page and that test together.

### What to ask the supplier for (size chart)

There are still no measurements, so the size guide says so and offers an
email instead. `config.js: sizeChart` renders the table the moment it is
filled in. Ask the supplier for, per size S, M, L, XL:

1. **Chest width**, garment laid flat, armpit to armpit, in cm (the page
   converts to inches).
2. **Body length**, highest point of the shoulder to the hem, in cm.
3. **Sleeve length**, shoulder seam to cuff, in cm (optional column).
4. Whether the sizing is **unisex, women's or men's**, and the fit
   (relaxed, oversized or regular).
5. **The pouch**: opening width and depth, and the ring's inside diameter,
   so the page can say which pets fit instead of "cats and small dogs".
6. **A pet weight limit** for the pouch, if they state one.
7. **Fabric and weight** (for example "polyester fleece, 300 gsm").
8. **The model's height and the size worn** in the two photos, for
   `config.js: modelWears`.
9. **Care instructions** as printed on the label.
10. A **product photo of the back and the inside of the pouch**, if they
    have one, for the "What you get" section.

Enter 1–3 as `[{ size: 'S', chestCm: 56, lengthCm: 68, sleeveCm: 60 }, …]`.
Do not round or "fix" what they send: on chillmypet.com the life jacket's
supplier table has overlapping ranges, and they are the ones a garment was
cut to.

### The ad's video on the page

`config.js: video` names a file in this folder (`hero.mp4`); `deploy.sh`
stages any `.mp4` and `.png` found here. When the file is present the page
plays it muted, looping and inline at the top (what iOS and the Facebook
in-app browser require before they autoplay anything), with a "Watch with
sound" button that opens it full screen, and the strip gets a ▶ thumbnail.
When `video` is `''` nothing is requested. Keep the vertical cut the ad
runs; a phone shows its middle. Before putting the current ad's clip here,
settle whether it shows this product and whether its licence allows it.

### What number should change, and when to look

The ad set "!Christmas Hoodie Ad Set!" optimises for **AddToCart**, which
this page sends when Buy is tapped with a size chosen, 150 ms before the
visitor leaves for the checkout. InitiateCheckout now comes from the
checkout, once the buyer types an email or name, and AddPaymentInfo when
they press Pay: four separate signals where the Payment Link page sent two
in one tap. So the first number to move is **AddToCart in Ads Manager**:
the old page produced 0 from 123 landing page views.
After a day or two of the new page at the same spend, 123 landing page views
should produce some AddToCarts; if it is still 0 the visitors are not
reaching Buy at all, and finding 1 above is the reason. The second number is
**InitiateCheckout**, the buyers who started typing their details; the gap
between it and AddToCart is the checkout's first screen. (Checkout Sessions
in the Stripe Dashboard no longer count Buy taps: the inline checkout
creates a PaymentIntent only when Pay is pressed.) The third is
**Purchase**, in Ads Manager and as paid orders in Stripe and on
chillmypet.com. Give the page
two to three days before judging it; at $10/day it sees roughly 60 clicks a
day.

## Design

The look is the one the previous page measured off a reference product page
(cream, deep green, Inter, Fredoka for the wordmark). The layout is not: it
was rebuilt from the audit above. The Figma file still holds the earlier
frames and tokens: https://www.figma.com/design/y7HKSgoD144ytJIwmU1sva

Every photo on the page is one of the two product shots; the close-ups zoom
them with CSS rather than adding images nobody has the rights to.

## How a sale flows

1. The shopper taps a design and a size on the page. There is no default
   size, and Buy asks for one.
2. Buy fires **AddToCart** (browser pixel plus a `/api/event` server copy
   under the same event id; content id is the SKU, e.g.
   `CMP-XH-STOCKING-GREEN-L`), then opens chillmypet.com's checkout:
   `/products/christmas-pouch-hoodie/checkout?design=green_stocking&size=L&added=1&vid=<cmp_vid>`,
   plus `fbclid` and `utm_*` from this page's address.
3. The checkout shows the choice folded to one line, prices it on the
   server, and asks for email, address and card on one page. `added=1` keeps
   it from reporting a second AddToCart; it sends **InitiateCheckout** once
   an email or name is typed and **AddPaymentInfo** when Pay is pressed. It
   adopts `vid` as its own visitor id on a first visit, so one `external_id`
   runs from the ad to the sale, and builds `_fbc` from the `fbclid`.
4. Pay creates the order (re-priced, stock held), confirms the card inline,
   and Stripe's webhook to chillmypet.com marks it paid and sends the
   server **Purchase** with the order-derived event id; the receipt page
   sends the browser half under the same id. If Stripe.js is blocked, the
   same order goes to Stripe's hosted page instead.

Everything after step 2 is chillmypet.com's, documented in AGENTS.md. What
follows here is how this page names the visitor, and the Payment Link
webhook, which only a sale through one of the old links still reaches.

Every event names the visitor with one `external_id`: `pixel.js` mints a random
64-hex id into the `cmp_vid` cookie, passes it to each `fbq('init')`, and the
worker sends the same string with each `/api/event` copy. Buy hands it to
chillmypet.com as `vid`, which that site adopts as its own `cmp_vid` on a
first visit, so its events and the Purchase carry the same `external_id`.
That is how the sale is tied to this page's events. (Through a Payment Link
it rode as `client_reference_id`, and this page's webhook sent it back on
the Purchase; that path still works for anyone holding an old link. The
webhook is Stripe's request, so it has no IP, user agent, `_fbp` or `_fbc`
for the buyer.)

`fbc` and `fbp` come from Meta's Parameter Builder. `param-builder.js` is
the bundle from Meta's `meta-capi-param-builder-clientjs` 1.3.2, unmodified
(the test pins its SHA-256). Both pages load it before `pixel.js`, which runs
it before `fbevents.js`. It writes `_fbc` from the URL's `fbclid` (or the
referrer's, or what a Facebook or Instagram in-app browser kept of the click)
and `_fbp`, each ending in an appendix that names the builder, and a second
ad click replaces the first one's cookie. The pixel adopts the cookies it
finds. `pixel.js` holds each server copy until the builder has finished (at
most 3 s), and the worker sends `_fbc` and `_fbp` byte for byte. Events
Manager flagged dataset `1341978141149107` for a server "modified fbclid" on
PageView, ViewContent and AddToCart (detected 2026-10-04): the worker
used to build `fb.1.<ms>.<fbclid>` itself from the event's URL. Don't bring
that back: no minting from `fbclid`, no lowercasing or trimming, and no
re-encoding. To update the builder, copy the new version's
`dist/clientParamBuilder.bundle.js` over `param-builder.js` and change the
hash in the test.

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
browser sends nothing to Meta from this page, AddToCart on Buy included.
**chillmypet.com has no quiet mode**: Buy still goes to the live checkout,
which counts its own PageView, ViewContent and (once an email is typed)
InitiateCheckout, and a payment there is a real order and a real Purchase.
Stop at the checkout, or refund in Stripe and expect the sale in Ads
Manager.

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

### Checked in a browser, 2026-10-12 (this layout)

Served locally and driven with Playwright at iPhone 13, iPhone SE and
1280px widths under the Facebook in-app user agent, with every outside
request refused: no script errors; design, size and Buy on the first screen
of the iPhone 13; Buy without a size shows the error and marks the size
buttons; Buy with Stocking Green and M leaves for
`buy.stripe.com/3cIeVe8Nk8HUfEa10X1wY07` (that combination's link) with
`client_reference_id` set; the sticky bar shows and names the choice once
the button is scrolled away; a video file present in the folder plays at the
top and gets its thumbnail, and one absent changes nothing.

## Ads that land here

As of 2026-10-12: "!Christmas Hoodie Campaign!" (Meta ad account Vish
Kanada, $10/day, from 10 Oct), ad set "!Christmas Hoodie Ad Set!"
optimising for **AddToCart** on `1341978141149107`, Facebook placements, US,
ending 20 Oct. Its ad "!Christmas Hoodie Ad!" is the vertical video
described above. The original "Christmas Hoodie Campaign" is paused and
still set to AddPaymentInfo, which this page can never send: the card is
typed on Stripe's page, which reports nothing to the pixel. Before restarting
it, switch its conversion event to Purchase, or to AddToCart or
InitiateCheckout for more signal at a small budget.

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

- Prices, links, the Christmas cut-off date, the pixel list, the video file
  name and the size chart live in `config.js`. The cut-off is a value, worked
  out from the promise (4 business days + 12 days in transit, worst case):
  Mon 7 Dec 2026. The bar hides itself once that day is over in Los Angeles.
- A new size or design needs a variant on chillmypet.com
  (`apps/storefront/scripts/christmas-hoodie.js`, then a catalogue migration
  on the live database) and an entry in `config.js: skus` with the same SKU.
- Publish: merging a change to this folder publishes it, through
  `.github/workflows/deploy-christmas.yml`. That needs the
  `OWNER_CLOUDFLARE_API_TOKEN` repository secret, a token for account
  5fef1d1d… (the repo's `CLOUDFLARE_API_TOKEN` is for Vish's account and cannot
  reach this project). By hand: `CLOUDFLARE_API_TOKEN=… ./deploy.sh`. Either
  way only the page's files are staged. Before that, each pull request gets a
  preview (see above).
- Test the worker and the page's claims: `node landing/christmas-pouch-hoodie.test.mjs`.

## Content provenance

The two photos were supplied by the owner in chat as screenshots. Their original
source and licence were not stated; confirm before using them in ads. Copy is
original. There are no supplier measurements yet, so the size guide says so
rather than showing a chart.

The ad's video (a woman on a plane in a red fleece pouch hoodie with a
puppy, "Small dog owners this one's for you") is not in this repo and its
source is not recorded anywhere here. It is not of the hoodie on sale.
Before it, or a clip like it, goes on this page, both the rights and the
product have to be settled with the owner.

"Who you're buying from" states only what the storefront's own contact and
policy pages already promise: the email, a reply within 1–2 business days,
free standard shipping, 2–4 business days to pack, 30 days from delivery to
return with a prepaid label, refunds within 10 business days of the return
arriving, and Stripe handling the card. Add a founder's name, a photo or a
city only once the owner has given them.
