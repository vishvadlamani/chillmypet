# chillmypet

A Cloudflare Worker serving chillmypet.com. The page content is a placeholder.

## Local development

```sh
npm install
npm run dev      # http://127.0.0.1:8787
```

Routes: `/` serves the landing page, `/health` returns `{"status":"ok"}`.

## Deploying

Deployment has not happened yet. It requires Cloudflare credentials that are not
in this repo.

1. Create an API token at **Cloudflare dashboard → My Profile → API Tokens**,
   using the "Edit Cloudflare Workers" template. To let the token attach the
   custom domains in `wrangler.toml`, it also needs **Zone → DNS → Edit** on
   chillmypet.com.
2. Deploy from a machine that has the token:

   ```sh
   export CLOUDFLARE_API_TOKEN=...
   npm run deploy
   ```

   Or push to `main` and let `.github/workflows/deploy.yml` run it, after adding
   `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` as repository secrets.

## Pointing chillmypet.com at the Worker

`wrangler.toml` declares `chillmypet.com` and `www.chillmypet.com` as custom
domains, so `wrangler deploy` creates the DNS records itself — but only once the
domain is an active zone on the same Cloudflare account. If you registered the
domain elsewhere, first add the site in the Cloudflare dashboard and update the
nameservers at your registrar; propagation usually takes under an hour. Until
the zone is active, deploys fail with a "zone not found" error.

Verify afterwards with:

```sh
curl https://chillmypet.com/health
```
