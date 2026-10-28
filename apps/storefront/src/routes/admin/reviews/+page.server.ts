import { fail } from '@sveltejs/kit';
import type { Review } from 'ecomwithai';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	const requested = url.searchParams.get('status');
	const status: Review['status'] = requested === 'published' || requested === 'hidden' ? requested : 'pending';
	return { status, reviews: await locals.commerce.reviews.list(status) };
};

// All /admin paths are authenticated in hooks before any data is read.
export const actions: Actions = {
	default: async ({ request, locals }) => {
		const form = await request.formData();
		const status = String(form.get('status'));
		if (status !== 'published' && status !== 'hidden' && status !== 'pending') return fail(400, { error: 'Invalid status.' });
		const updated = await locals.commerce.reviews.moderate(Number(form.get('id')), status);
		return updated ? { updated: true } : fail(404, { error: 'Review not found.' });
	}
};
