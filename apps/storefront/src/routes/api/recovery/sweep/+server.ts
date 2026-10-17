import { json, type RequestHandler } from '@sveltejs/kit';
import { sendDueReminders } from '$lib/server/recovery';

/**
 * Sends whatever checkout reminders are due, for a scheduler outside the
 * Worker to ping (the owner's hourly Apps Script does). Page requests already
 * run the same sweep in the background, so this only shortens the wait on a
 * quiet hour.
 *
 * Safe to leave open: it can only send reminders that are already due, each
 * exactly once, and it answers with counts, never addresses. A per-isolate
 * pause keeps it from being used to hammer the database.
 */
const PAUSE_MS = 60_000;
let last = 0;

const sweep: RequestHandler = async ({ locals }) => {
	const now = Date.now();
	if (now - last < PAUSE_MS) return json({ skipped: 'throttled' });
	last = now;
	try {
		return json(await sendDueReminders(locals.commerce, locals.email, locals.settings));
	} catch (error) {
		console.error('Checkout reminder sweep failed', error);
		return json({ error: 'sweep_failed' }, { status: 500 });
	}
};

export const GET = sweep;
export const POST = sweep;
