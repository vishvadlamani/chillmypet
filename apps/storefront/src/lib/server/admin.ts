/**
 * The admin is behind HTTP Basic auth against one password, ADMIN_PASSWORD, a
 * Worker secret. Unset, `/admin` is a 404: an admin with no password must not
 * exist, rather than exist open. Any username is accepted — there is one
 * operator, and the password is the whole credential.
 *
 * Basic auth over HTTPS is enough for one operator. If the admin ever has
 * several people, put it behind Cloudflare Access instead and drop this.
 */
export function isAdminPath(pathname: string): boolean {
	return pathname === '/admin' || pathname.startsWith('/admin/');
}

const encoder = new TextEncoder();

/** Compares digests, so the time taken says nothing about how much of the password matched. */
async function sameSecret(a: string, b: string): Promise<boolean> {
	const [x, y] = await Promise.all([
		crypto.subtle.digest('SHA-256', encoder.encode(a)),
		crypto.subtle.digest('SHA-256', encoder.encode(b))
	]);
	const left = new Uint8Array(x);
	const right = new Uint8Array(y);
	let diff = 0;
	for (let i = 0; i < left.length; i++) diff |= left[i] ^ right[i];
	return diff === 0;
}

function passwordFrom(header: string | null): string | null {
	if (!header?.startsWith('Basic ')) return null;
	try {
		const decoded = atob(header.slice(6).trim());
		const colon = decoded.indexOf(':');
		return colon === -1 ? null : decoded.slice(colon + 1);
	} catch {
		return null;
	}
}

const PRIVATE_HEADERS = {
	'cache-control': 'no-store',
	'x-robots-tag': 'noindex, nofollow'
};

/** A response to send instead of the admin page, or null when the request may proceed. */
export async function adminGate(request: Request, password: string | undefined): Promise<Response | null> {
	if (!password) return new Response('Not found', { status: 404, headers: PRIVATE_HEADERS });

	const given = passwordFrom(request.headers.get('authorization'));
	if (given !== null && (await sameSecret(given, password))) return null;

	return new Response('Authentication required', {
		status: 401,
		headers: { ...PRIVATE_HEADERS, 'www-authenticate': 'Basic realm="ChillMyPet admin", charset="UTF-8"' }
	});
}

export { PRIVATE_HEADERS as ADMIN_HEADERS };
