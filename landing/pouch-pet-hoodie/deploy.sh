#!/bin/sh
# Publishes the hoodie page and its webhook to the Cloudflare Pages project
# chillmypet-hoodie. Needs CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID.
#
# The static files are staged into a temp folder, so the README, the tests and
# the function source are never served as pages. functions/ is compiled from
# this folder, which is why the deploy runs from here.
set -eu
cd "$(dirname "$0")"
out=$(mktemp -d)
trap 'rm -rf "$out"' EXIT
cp index.html thank-you.html config.js pixel.js style.css hoodie-black.jpg guarantee-30day.webp "$out"/
npx wrangler pages deploy "$out" --project-name chillmypet-hoodie --branch main "$@"
