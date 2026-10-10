/* Meta pixel: loads once, initialises every id in config.js, sends one PageView. */
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
 */
window.xmasTrack = function (name, data, leaving) {
	var id = window.crypto && crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);
	fbq('track', name, data || {}, { eventID: id });
	var body = JSON.stringify({ name: name, id: id, url: location.href, data: data || {} });
	function post() {
		try { if (navigator.sendBeacon && navigator.sendBeacon('/api/event', body)) return; } catch (e) {}
		try { fetch('/api/event', { method: 'POST', body: body, keepalive: true }); } catch (e) {}
	}
	if (leaving) return post();
	var waited = 0;
	(function tick() {
		if (/(^|; )_fbp=/.test(document.cookie) || waited >= 3000) return post();
		waited += 100;
		setTimeout(tick, 100);
	})();
	return id;
};
xmasTrack('PageView');
