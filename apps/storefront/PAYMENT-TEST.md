# Private $1 checkout test

This button exercises the existing checkout, order pricing, Stripe PaymentIntent,
signed webhook, receipt and server Purchase tracking in a separate sandbox.
No real charge, shipment or customer email is created. Test orders belong to
`chillmypet-payment-test`, never the production tenant. The button is at
`/admin/payment-test` on the sandbox deployment; it is unavailable in production.

Use Stripe sandbox cards only. Stripe prohibits testing live mode with real
payment details: https://docs.stripe.com/testing.

## Configure and deploy

1. Use a Stripe sandbox for the existing ChillMP account. Keep its keys separate
   from live keys. Use a separate test database where possible; the isolated
   tenant also keeps test orders and stock separate when sharing the schema.
2. Configure these secrets on **chillmypet-payment-test** in Cloudflare, never in
   a commit or chat: `ADMIN_PASSWORD`, `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`,
   `STRIPE_SECRET_KEY` (`sk_test_…`), and `STRIPE_PUBLISHABLE_KEY` (`pk_test_…`).
3. Register `https://chillmypet-payment-test.<account>.workers.dev/api/stripe/webhook`
   in that Stripe sandbox for `payment_intent.succeeded` and
   `checkout.session.completed`. Set its signing secret as `STRIPE_WEBHOOK_SECRET`.
4. For tracking, add `META_CAPI_ACCESS_TOKEN` for dataset `1341978141149107` and
   `META_CAPI_TEST_EVENT_CODE` from its Test Events tab. Without the code, Meta
   tracking is disabled. Browser Meta pixels and GTM are disabled throughout
   this sandbox so test activity cannot enter ordinary ad reporting.
5. Build with `npm run build`, then deploy from `apps/storefront` using
   `npx wrangler deploy --config wrangler.payment-test.toml`.
   The normal main-branch workflow deploys production only, not this sandbox.

The sandbox rejects production domains and live Stripe keys before any order
can be created. All pages and APIs require the admin password except the Stripe
webhook, which verifies Stripe's signature. Never attach production custom domains.

## Try the button

Open the sandbox `/admin/payment-test`, sign in with any username and the admin
password, and click **Start $1.00 test**. It resets the sandbox cart to one $1 item.
Use test contact details and card `4242 4242 4242 4242`, a future expiry and any
three-digit CVC. Complete checkout. Confirm the sandbox order is paid and that
Meta **Test Events** receives one server `Purchase` with value `1.00`, currency
`USD` and event ID `purchase-SANDBOX-…`.

This verifies the sandbox path. Live Purchase attribution still needs an actual
customer purchase matched to its live Stripe payment and Meta Purchase event.

## Local verification

The automated sandbox test uses mocked Stripe and Meta, not external accounts.
Start the dev server with `PAYMENT_TEST_MODE=1`, `ADMIN_PASSWORD=test-admin`,
`STRIPE_SECRET_KEY=sk_test_mock`, `STRIPE_PUBLISHABLE_KEY=pk_test_mock`,
`STRIPE_WEBHOOK_SECRET=whsec_test_secret`, `STRIPE_STATEMENT_DESCRIPTOR=CHILLMYPET`,
`STRIPE_API_BASE=http://127.0.0.1:12111`, `META_PIXEL_ID=1341978141149107`,
`META_CAPI_ACCESS_TOKEN=test_token`, `META_CAPI_TEST_EVENT_CODE=TEST_SANDBOX`,
`META_CAPI_ENDPOINT=http://127.0.0.1:12112`, and a throwaway local
`TURSO_DATABASE_URL=file:/tmp/chillmypet-payment-test.db`.
Run `npm run dev -- --host 127.0.0.1 --port 5195` then, in another terminal,
`npm run test:payment-sandbox -w @chillmypet/storefront`.
