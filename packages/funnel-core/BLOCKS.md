# Block catalog

The candidate set for a shared DR block library. Columns:

- **Have** — an existing component to wrap (`✓ Name`), or `—` for new build
- **Bind** — does it need `$ref` data binding to be honest/useful?
- **Tier** — `lib` shared library · `app` host-specific · `store` storefront-only

Naming is `snake_case` throughout, because manifests are JSON and it's what a
model generating one produces most consistently. (The four blocks already built
in ideatorun use camelCase — `statementEmail`, `branchedInput`. Worth renaming
those to match before the library grows; they're app-tier and not yet published
under those names anywhere but the quiz seed.)

---

## 1. Offer & conversion

| Block | Does | Have | Bind | Tier |
| --- | --- | --- | --- | --- |
| `buy_box` | Title, price, variant state, add-to-cart | — | **yes** price/availability | store |
| `bundle` | Multi-buy tiers with per-unit savings | — | **yes** pricing | store |
| `plan_cards` | Subscription tiers, one selected | ✓ PlanCard | yes | lib |
| `pricing_table` | Feature × tier comparison grid | — | yes | lib |
| `order_summary` | Line items, totals, taxes | ✓ OrderSummary | **yes** | app |
| `trial_offer` | Trial terms + what happens after | ✓ TrialOffer | yes | lib |
| `promo_applied` | Discount confirmation state | ✓ PromoApplied | yes | lib |
| `promo_input` | Code entry + validation | — | yes | lib |
| `sticky_buy_bar` | Persistent CTA on scroll | — | yes price | lib |
| `upsell` | Post-purchase / order-bump offer | — | yes | lib |

## 2. Urgency & scarcity

| Block | Does | Have | Bind | Tier |
| --- | --- | --- | --- | --- |
| `countdown` | Timer to a real deadline | ✓ CountdownTimer | **yes** `sale_ends_at` | lib |
| `stock_left` | Units remaining, per-variant | ✓ ScarcityBar | **yes** inventory | lib |
| `spots_left` | Seats/slots remaining | ✓ ScarcityBar | **yes** | lib |
| `reserved_spot` | "Your spot is held for N:NN" | ✓ ReservedSpot | yes | lib |
| `announcement_bar` | Top strip — shipping cutoff, promo | — | no | lib |
| `live_activity` | Recent purchases / viewers now | ✓ LiveActivity, LiveTicker | **yes** orders | lib |
| `geo_offer` | Location-personalised offer line | ✓ GeoOffer | `ctx.state.city()` | lib |

## 3. Social proof

| Block | Does | Have | Bind | Tier |
| --- | --- | --- | --- | --- |
| `reviews` | Carousel of reviews *(built)* | ✓ TestimonialSection | yes real reviews | lib |
| `testimonial_single` | One quote, avatar, attribution | ✓ ProofTestimonial, Testimonial | yes | lib |
| `reviews_grid` | Static grid, no carousel | ✓ Testimonial | yes | lib |
| `rating_summary` | Avg score + histogram + count | — | **yes** | lib |
| `ugc_gallery` | Customer photos/video | — | yes | lib |
| `press_logos` | "As seen in" strip | — | no | lib |
| `news_segment` | Press video + caption | ✓ NewsSegment | no | lib |
| `before_after` | Paired comparison, optional slider | — | no | lib |
| `case_study` | Longer proof with a number | — | no | lib |

## 4. Trust & risk reversal

| Block | Does | Have | Bind | Tier |
| --- | --- | --- | --- | --- |
| `guarantee` | Refund promise + terms | — | no | lib |
| `trust_badges` | Payment/security icon row | ✓ TrustBadges | no | lib |
| `secure_badge` | Checkout-adjacent reassurance | ✓ SecureBadge | no | lib |
| `shipping_promise` | Delivery estimate | — | yes cutoff/zone | lib |
| `returns_policy` | Returns summary | — | no | lib |
| `transparency` | Plain-language terms | ✓ TransparencyStatement | no | lib |
| `faq` | Accordion Q&A | — | optional `$ref` | lib |
| `contact_support` | How to reach a human | — | no | lib |

## 5. Content & education

| Block | Does | Have | Bind | Tier |
| --- | --- | --- | --- | --- |
| `hero` | Eyebrow / headline / subhead *(built)* | ✓ built | no | lib |
| `benefits` | Icon + copy list | — | no | lib |
| `feature_grid` | 2–3 column feature cards | — | no | lib |
| `how_it_works` | Numbered steps | — | no | lib |
| `comparison_table` | Us vs them | — | no | lib |
| `spec_table` | Key/value specs | — | yes | store |
| `size_chart` | Sizing table / fit finder | — | yes | store |
| `ingredients` | Composition / sourcing | — | yes | store |
| `media` | Image or video, captioned | — | no | lib |
| `rich_text` | Free prose block | — | no | lib |
| `divider` | Visual break | — | no | lib |

## 6. Capture & flow

| Block | Does | Have | Bind | Tier |
| --- | --- | --- | --- | --- |
| `optin` | Email capture *(built)* | ✓ built | no | lib |
| `choice` | Single-select question *(built)* | ✓ OptionCard | no | lib |
| `multi_choice` | Multi-select question | ✓ OptionCard | no | lib |
| `text_input` | Free-text step | — | no | lib |
| `branched_input` | Branch on a prior answer *(built)* | ✓ QuizInput | no | app |
| `statement_email` | Personalised statement + capture *(built)* | ✓ built | no | app |
| `quiz_result` | Scored/segmented outcome | — | yes | lib |
| `phone_capture` | Phone + consent | — | no | lib |

## 7. Editorial / advertorial

| Block | Does | Have | Bind | Tier |
| --- | --- | --- | --- | --- |
| `article_header` | Headline, deck, dateline | — | no | lib |
| `byline` | Author + date + read time | — | no | lib |
| `ad_disclosure` | "Sponsored" / advertorial label | — | no | lib |
| `story_section` | Body copy with subhead | — | no | lib |
| `pull_quote` | Highlighted excerpt | — | no | lib |
| `cta_inline` | Mid-article CTA | — | no | lib |
| `author_bio` | Credibility footer | — | no | lib |

## 8. Chrome & structural

| Block | Does | Have | Bind | Tier |
| --- | --- | --- | --- | --- |
| `site_header` | Logo + nav | ✓ SiteHeader | no | app |
| `footer_legal` | Policy links, disclaimers | — | no | lib |
| `progress` | Wizard progress *(snippet today)* | ✓ built | no | lib |
| `spacer` | Explicit vertical rhythm | — | no | lib |

## Not blocks

`checkout` / `payment_form` stay code. `PaymentForm`, `CardField` and `OtpInput`
carry Stripe Elements lifecycle, payment intents and error states on the live
payment path — the registry already treats checkout as a *variant selector*
(`component: 'checkout'`, `props: { variant: 'two-step' }`) rather than as
composable blocks, and that's the right line.

`BuildTerminal`, `BuildTransition`, `IdeaLockup` are ideatorun set-pieces, not
library material.

---

## Counts

| | |
| --- | --- |
| Total candidates | 57 |
| Already built | 6 |
| Wrap an existing component | 20 |
| New build, no data binding | 22 |
| Need `$ref` binding to be useful | 19 |
| Shared library tier | 47 |
