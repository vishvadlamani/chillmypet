#!/bin/sh
# Publishes the redirect in this folder to both retired landing page projects,
# chillmypet-christmas and chillmypet-hoodie, on Cloudflare account
# 5fef1d1dbb6eaee72fdfc2b26a61a386. Needs CLOUDFLARE_API_TOKEN for that
# account. Extra arguments go to wrangler.
#
# It checks each project exists first: asked to deploy to a project it cannot
# find, wrangler offers to create one, and an empty new project would leave the
# live page untouched while the run looked successful. Only the served files
# are staged, so this script is never published, and --branch main makes it the
# production deploy, not a preview.
set -eu
cd "$(dirname "$0")"
account=${CLOUDFLARE_ACCOUNT_ID:-5fef1d1dbb6eaee72fdfc2b26a61a386}
out=$(mktemp -d)
trap 'rm -rf "$out"' EXIT
cp index.html _worker.js _routes.json "$out"/
for project in chillmypet-christmas chillmypet-hoodie; do
	if ! curl -fsS -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
		"https://api.cloudflare.com/client/v4/accounts/$account/pages/projects/$project" >/dev/null; then
		echo "This token cannot see the Pages project $project on account $account. Nothing was deployed to it." >&2
		exit 1
	fi
	CLOUDFLARE_ACCOUNT_ID=$account npx wrangler pages deploy "$out" --project-name "$project" --branch main --commit-dirty=true "$@"
done
