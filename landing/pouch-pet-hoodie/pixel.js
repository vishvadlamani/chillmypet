/* Meta pixel: loads once, initialises every id in config.js, sends one PageView. */
!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
document,'script','https://connect.facebook.net/en_US/fbevents.js');
(window.HOODIE.pixelIds || []).forEach(function (id) { fbq('init', id); });

/*
 * Every event goes twice under one id: to the pixel here, and to /api/event,
 * which sends the Conversions API copy (see _worker.js). Meta keeps one, and
 * the server copy is the one an ad blocker or iOS can't stop.
 *
 * `leaving` is for an event fired on the way off the page: send now. Otherwise
 * wait briefly for the pixel's _fbp cookie, which only exists once
 * fbevents.js has loaded, so the server copy carries the same browser id.
 */
window.hoodieTrack = function (name, data, leaving) {
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
};
hoodieTrack('PageView');
