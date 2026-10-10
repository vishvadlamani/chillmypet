#!/bin/sh
# Publishes the Christmas hoodie page and its worker to the Cloudflare Pages
# project chillmypet-christmas (account 5fef1d1dbb6eaee72fdfc2b26a61a386).
# Needs CLOUDFLARE_API_TOKEN for that account. Extra arguments go to wrangler.
#
# Only the page's own files are staged, so the README and this script are never
# served, and --branch main makes it the production deploy, not a preview.
set -eu
cd "$(dirname "$0")"
if [ -d functions ]; then
	echo "functions/ is ignored while _worker.js exists; put the route in _worker.js." >&2
	exit 1
fi
out=$(mktemp -d)
trap 'rm -rf "$out"' EXIT
cp index.html thank-you.html config.js pixel.js app.js style.css _worker.js _routes.json ./*.jpg ./*.webp "$out"/
npx wrangler pages deploy "$out" --project-name chillmypet-christmas --branch main --commit-dirty=true "$@"
