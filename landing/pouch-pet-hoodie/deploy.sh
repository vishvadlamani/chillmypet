#!/bin/sh
# Publishes the hoodie page and its worker to the live Cloudflare Pages project
# chillmypet-hoodie. Needs CLOUDFLARE_API_TOKEN for the account that holds it
# (see README.md). Extra arguments go to wrangler.
#
# Only the page's own files are staged, so the README and the tests are never
# served, and --branch main makes it the production deploy, not a preview.
set -eu
cd "$(dirname "$0")"
if [ -d functions ]; then
	echo "functions/ is ignored while _worker.js exists; put the route in _worker.js." >&2
	exit 1
fi
out=$(mktemp -d)
trap 'rm -rf "$out"' EXIT
cp index.html thank-you.html config.js pixel.js style.css _worker.js _routes.json ./*.jpg ./*.webp "$out"/
npx wrangler pages deploy "$out" --project-name chillmypet-hoodie --branch main "$@"
