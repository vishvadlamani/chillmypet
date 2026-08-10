/**
 * Copies packages/ecomwithai into a clone of the public framework repo
 * (github.com/vishvadlamani/ecomwithai) and stages the result.
 *
 * packages/ecomwithai is the editable copy: extending the framework and running
 * real traffic through it happen against the same files, so they cannot drift.
 * The public repo is a publishing artifact produced from here — this script only
 * ever writes outward, so a commit made directly there is silently reverted.
 *
 *   node scripts/sync-framework.js /path/to/ecomwithai
 */
import { cp, rm, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const target = process.argv[2] ?? '/home/user/ecomwithai';
if (!existsSync(target)) {
	console.error(`No framework repo at ${target}`);
	process.exit(1);
}

for (const entry of ['src', 'package.json', 'tsconfig.json', 'README.md', 'AGENTS.md', 'LICENSE', '.github']) {
	await rm(`${target}/${entry}`, { recursive: true, force: true });
	await cp(`packages/ecomwithai/${entry}`, `${target}/${entry}`, { recursive: true });
}

// The storefront's workspace link must not travel into the published package.
execFileSync('git', ['-C', target, 'add', '-A'], { stdio: 'inherit' });
console.log(`Synced packages/ecomwithai -> ${target}. Review, commit and push there.`);
