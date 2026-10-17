import { treeChrome } from '$lib/store/collection';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => treeChrome(locals.settings);
