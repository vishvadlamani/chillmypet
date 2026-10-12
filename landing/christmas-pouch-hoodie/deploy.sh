#!/bin/sh
# Publishes the Christmas hoodie page and its worker to the Cloudflare Pages
# project chillmypet-christmas (account 5fef1d1dbb6eaee72fdfc2b26a61a386).
# Needs CLOUDFLARE_API_TOKEN for that account. Extra arguments go to wrangler.
#
# Only the page's own files are staged, so the README and this script are never
# served, and --branch main makes it the production deploy, not a preview.
#
# PREVIEW=pr-35 publishes a preview instead, at
# https://pr-35.chillmypet-christmas.pages.dev, leaving the live page alone.
# It is its own variable rather than a second --branch, which wrangler would
# not reliably take over the first: a preview must never land on production.
set -eu
branch=main
if [ -n "${PREVIEW:-}" ]; then
	case "$PREVIEW" in
	main | production) echo "PREVIEW=$PREVIEW would publish the live page" >&2; exit 1 ;;
	esac
	branch=$PREVIEW
fi
cd "$(dirname "$0")"
if [ -d functions ]; then
	echo "functions/ is ignored while _worker.js exists; put the route in _worker.js." >&2
	exit 1
fi
out=$(mktemp -d)
trap 'rm -rf "$out"' EXIT
cp index.html thank-you.html config.js pixel.js app.js style.css _worker.js _routes.json ./*.jpg ./*.webp "$out"/
# The ad's video (config.js: video) and any PNG are optional: the page works
# without them, so their absence is not an error.
for f in ./*.mp4 ./*.png; do
	if [ -e "$f" ]; then cp "$f" "$out"/; fi
done
npx wrangler pages deploy "$out" --project-name chillmypet-christmas --branch "$branch" --commit-dirty=true "$@"
