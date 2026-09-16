/**
 * Work that has to outlive the response.
 *
 * `waitUntil` must be called as a *method*: taking it off the context and
 * calling it bare throws `Illegal invocation` on the Workers runtime, which
 * 500'd every order once already. One helper, so that is written down once
 * rather than re-derived at each call site.
 */
/**
 * Structural rather than `App.Platform`: a `RequestEvent` hands over a
 * `Readonly<Platform>`, and all this needs is something with a `waitUntil`.
 */
type Host = { context?: { waitUntil(promise: Promise<unknown>): void } };

export function dispatch(platform: Host | undefined, work: Promise<unknown>): void {
	// Nothing here may reject: this promise has no caller left to catch it.
	const guarded = work.catch((error) => {
		console.error('background work failed', error);
	});

	const context = platform?.context;
	if (context && typeof context.waitUntil === 'function') {
		context.waitUntil(guarded);
		return;
	}

	// Node and `vite dev` keep running after the response, so the promise
	// finishes on its own with no host to hand it to.
	void guarded;
}
