#!/bin/sh
# Publishes the Pouch Pet Hoodie page and its worker to the Cloudflare Pages
# project chillmypet-hoodie (account 5fef1d1dbb6eaee72fdfc2b26a61a386). Needs
# CLOUDFLARE_API_TOKEN for that account. Extra arguments go to wrangler.
#
# It checks the project exists first: asked to deploy to a project it cannot
# find, wrangler offers to create one, and an empty new project would leave the
# live page untouched while the run looked successful. Only the page's own
# files are staged, so the README and this script are never served, and
# --branch main makes it the production deploy, not a preview.
set -eu
cd "$(dirname "$0")"
account=${CLOUDFLARE_ACCOUNT_ID:-5fef1d1dbb6eaee72fdfc2b26a61a386}
if ! curl -fsS -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
	"https://api.cloudflare.com/client/v4/accounts/$account/pages/projects/chillmypet-hoodie" >/dev/null; then
	echo "This token cannot see the Pages project chillmypet-hoodie on account $account. Nothing was deployed." >&2
	exit 1
fi
if [ -d functions ]; then
	echo "functions/ is ignored while _worker.js exists; put the route in _worker.js." >&2
	exit 1
fi
out=$(mktemp -d)
trap 'rm -rf "$out"' EXIT
cp index.html thank-you.html config.js pixel.js style.css _worker.js _routes.json ./*.jpg ./*.webp "$out"/
CLOUDFLARE_ACCOUNT_ID=$account npx wrangler pages deploy "$out" --project-name chillmypet-hoodie --branch main --commit-dirty=true "$@"
