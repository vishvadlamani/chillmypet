/* Meta pixel: loads once, initialises every id in config.js, sends one PageView. */

/*
 * Quiet mode: nothing reaches Meta, and Buy marks the Stripe checkout test_.
 * It is on for the owner's own test visits (open the page with ?test, end it
 * with ?test=off) and on every preview copy of the page, which Cloudflare
 * serves on a subdomain of chillmypet-christmas.pages.dev (pr-35.…), so looking
 * at a change before approving it never counts as a visitor.
 *
 * It lives in a cookie, set on the whole chillmypet-christmas.pages.dev family,
 * because Stripe sends every buyer back to the live thank-you page: without it
 * a test checkout, or one started from a preview, would come back and report a
 * Purchase from there. A day, so a forgotten test ends on its own, and a banner
 * says it is on for as long as it lasts.
 */
window.XMAS.quiet = (function () {
	var host = location.hostname;
	var family = /(^|\.)chillmypet-christmas\.pages\.dev$/.test(host) ? '; Domain=chillmypet-christmas.pages.dev' : '';
	var set = function (value, age) { document.cookie = 'cmp_test=' + value + '; Max-Age=' + age + '; Path=/; SameSite=Lax; Secure' + family; };
	var asked = new URLSearchParams(location.search).get('test');
	var preview = /\.chillmypet-christmas\.pages\.dev$/.test(host);
	if (asked === 'off' && !preview) { set('', 0); return ''; }
	if (asked !== null || preview) set('1', 86400);
	if (preview) return 'preview';
	return asked !== null || /(?:^|; )cmp_test=1(?:;|$)/.test(document.cookie) ? 'test' : '';
})();
// A stand-in fbq before the loader below runs: it sees fbq defined and returns
// without fetching fbevents.js, and every fbq call on the page, the thank-you
// page's Purchase included, lands here and goes nowhere.
if (window.XMAS.quiet) window.fbq = function () {};

!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
document,'script','https://connect.facebook.net/en_US/fbevents.js');
/*
 * The visitor's external_id: one id on every pixel init, every /api/event copy
 * and, through the Payment Link's client_reference_id, the webhook's Purchase,
 * so Meta can tie them to one person before anyone has typed an email.
 * 64 hex characters on purpose: the pixel sends a value shaped like a SHA-256
 * digest as it is, and _worker.js sends this same string, so both halves
 * agree. Random, never derived from anything about the person.
 */
window.XMAS.visitorId = (function () {
	var m = /(?:^|; )cmp_vid=([a-f0-9]{64})(?:;|$)/.exec(document.cookie);
	if (m) return m[1];
	if (!window.crypto || !crypto.getRandomValues) return '';
	var id = Array.prototype.map.call(crypto.getRandomValues(new Uint8Array(32)), function (b) {
		return ('0' + b.toString(16)).slice(-2);
	}).join('');
	document.cookie = 'cmp_vid=' + id + '; Max-Age=31536000; Path=/; SameSite=Lax; Secure';
	return id;
})();
(window.XMAS.pixelIds || []).forEach(function (id) {
	if (window.XMAS.visitorId) fbq('init', id, { external_id: window.XMAS.visitorId });
	else fbq('init', id);
});

/*
 * Every event goes twice under one id: to the pixel here, and to /api/event,
 * which sends the Conversions API copy (see _worker.js). Meta keeps one, and
 * the server copy is the one an ad blocker or iOS can't stop.
 *
 * `leaving` is for an event fired on the way off the page: send now. Otherwise
 * wait briefly for the pixel's _fbp cookie, which only exists once
 * fbevents.js has loaded, so the server copy carries the same browser id.
 *
 * A visitor who leaves during that wait (an ad click that bounces, a browser
 * that blocks the cookie) must not take the server copy with them: the pixel
 * may already have sent its half, and a browser event with no server copy is
 * exactly what Events Manager counts against coverage. So whatever is still
 * waiting goes out as the page is hidden. Without fbp it still dedupes on the
 * event id and matches on external_id.
 */
var waiting = [];
function sendWaiting() {
	while (waiting.length) waiting[0]();
}
addEventListener('pagehide', sendWaiting);
document.addEventListener('visibilitychange', function () {
	if (document.visibilityState === 'hidden') sendWaiting();
});

window.xmasTrack = function (name, data, leaving) {
	var id = window.crypto && crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);
	if (window.XMAS.quiet) return id;
	fbq('track', name, data || {}, { eventID: id });
	var body = JSON.stringify({ name: name, id: id, url: location.href, data: data || {} });
	var sent = false;
	function post() {
		var at = waiting.indexOf(post);
		if (at >= 0) waiting.splice(at, 1);
		if (sent) return;
		sent = true;
		try { if (navigator.sendBeacon && navigator.sendBeacon('/api/event', body)) return; } catch (e) {}
		try { fetch('/api/event', { method: 'POST', body: body, keepalive: true }); } catch (e) {}
	}
	if (leaving) return post();
	waiting.push(post);
	var waited = 0;
	(function tick() {
		if (sent) return;
		if (/(^|; )_fbp=/.test(document.cookie) || waited >= 3000) return post();
		waited += 100;
		setTimeout(tick, 100);
	})();
	return id;
};
xmasTrack('PageView');

// Say so whenever quiet mode is on, so a test never passes for a real visit
// and a forgotten one is noticed. Payments are not tests: the links are live.
if (window.XMAS.quiet) {
	document.addEventListener('DOMContentLoaded', function () {
		var bar = document.createElement('div');
		bar.setAttribute('role', 'status');
		bar.style.cssText = 'background:#ffd400;color:#111;font:600 14px/1.4 system-ui,sans-serif;text-align:center;padding:8px 16px';
		bar.innerHTML = window.XMAS.quiet === 'preview'
			? 'PREVIEW of a change, not live yet. Nothing here is sent to Meta. Payments are real.'
			: 'TEST MODE: this visit is not sent to Meta, and checkouts are marked “test” in Stripe. Payments are real. <a href="?test=off" style="color:inherit">Turn test mode off</a>';
		document.body.insertBefore(bar, document.body.firstChild);
	});
}
