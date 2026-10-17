(function () {
	var c = window.XMAS;
	var $ = function (id) { return document.getElementById(id); };
	var all = function (sel) { return [].slice.call(document.querySelectorAll(sel)); };
	var money = '$' + c.price.toFixed(2);
	var still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

	// ?design=green_stocking preselects a design, for an ad per design.
	var asked = new URLSearchParams(location.search).get('design');
	var state = {
		design: c.designs.some(function (d) { return d.code === asked; }) ? asked : c.designs[0].code,
		// No default size: it is the wearer's, and a guess ships the wrong one.
		size: '',
		view: 0,
		// The ad's video, when the file is here (see below); false shows a photo.
		video: false
	};
	var design = function (code) { return c.designs.filter(function (d) { return d.code === (code || state.design); })[0]; };
	var link = function () {
		var sku = c.skus[state.design + ':' + state.size];
		return sku ? { sku: sku } : null;
	};

	// Every photo on the page is one of the two product shots; the close-ups are
	// the same files zoomed with CSS (--z around --x/--y), so nothing is shown
	// that the buyer won't receive.
	var views = [];
	c.designs.forEach(function (d) {
		views.push({ design: d.code, src: d.image, z: 1, x: '50%', y: '35%', alt: c.title + ' in ' + d.name + ', worn with a cat peeking out of the pouch' });
		views.push({ design: d.code, src: d.image, z: 2.3, x: '50%', y: '36%', alt: 'Close-up of the peek-out ring on ' + d.name, label: 'Peek-out ring' });
		views.push({ design: d.code, src: d.image, z: 2.2, x: '50%', y: '83%', alt: 'Close-up of the ' + d.detail.toLowerCase() + ' on ' + d.name, label: d.detail });
	});
	var zoom = function (el, v) {
		el.style.setProperty('--z', v.z);
		el.style.setProperty('--x', v.x);
		el.style.setProperty('--y', v.y);
	};

	// --- Christmas countdown: to the end of the cut-off day in Los Angeles ------
	(function () {
		var zone = c.cutoffZone;
		var today = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
		if (today > c.cutoff) return;
		var p = c.cutoff.split('-').map(Number);
		// Midnight after the cut-off, LA time, as an instant: take midnight UTC
		// and correct by LA's offset at that moment (PST or PDT, whichever applies).
		var guess = Date.UTC(p[0], p[1] - 1, p[2] + 1);
		var f = new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' });
		var q = {};
		f.formatToParts(new Date(guess)).forEach(function (x) { q[x.type] = +x.value; });
		var offset = Date.UTC(q.year, q.month - 1, q.day, q.hour, q.minute, q.second) - guess;
		var end = guess - offset;
		$('cutoff-day').textContent = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' }).format(new Date(c.cutoff + 'T00:00:00Z')).toUpperCase();
		var two = function (n) { return (n < 10 ? '0' : '') + n; };
		var bar = $('christmas');
		function tick() {
			var left = Math.max(0, Math.floor((end - Date.now()) / 1000));
			if (!left) { bar.hidden = true; return; }
			$('cd-d').textContent = String(Math.floor(left / 86400));
			$('cd-h').textContent = two(Math.floor(left / 3600) % 24);
			$('cd-m').textContent = two(Math.floor(left / 60) % 60);
			$('cd-s').textContent = two(left % 60);
			setTimeout(tick, 1000 - (Date.now() % 1000));
		}
		bar.hidden = false;
		tick();
	})();

	// --- gallery ---------------------------------------------------------------
	var stage = $('stage');
	var photo = $('photo');
	views.forEach(function (v, i) {
		var b = document.createElement('button');
		b.type = 'button';
		b.setAttribute('aria-label', 'Show ' + (v.label ? v.label + ', ' : '') + design(v.design).name);
		b.innerHTML = '<img src="' + design(v.design).thumb + '" alt="" width="64" height="64">';
		zoom(b.querySelector('img'), v);
		b.onclick = function () { show(i); };
		$('thumbs').appendChild(b);
	});
	$('prev').onclick = function () { step(-1); };
	$('next').onclick = function () { step(1); };
	function step(by) {
		// The video, when present, sits before the first photo in the strip.
		var i = state.video ? -1 : state.view;
		var n = views.length + (video ? 1 : 0);
		i = ((i + 1 + by) % n + n) % n - 1;
		if (i < 0) showVideo(); else show(i);
	}
	function show(i) {
		state.video = false;
		state.view = i;
		state.design = views[i].design;
		render();
	}

	// --- the ad's video, when the file is in the folder ---------------------------
	// A <video> whose file is missing fires error and nothing changes; one that
	// loads becomes the first thing in the strip and plays on arrival: the ad
	// the visitor just tapped, continued. Muted and inline, which is what iOS
	// and the Facebook in-app browser require before they autoplay anything.
	// Sound is the visitor's choice, through the full-screen button.
	var video = null;
	if (c.video) {
		var el = document.createElement('video');
		el.muted = true;
		el.loop = true;
		el.playsInline = true;
		el.setAttribute('muted', '');
		el.setAttribute('playsinline', '');
		el.preload = 'metadata';
		el.poster = design().image;
		el.setAttribute('aria-label', 'The ad video for the ' + c.title);
		el.hidden = true;
		el.src = c.video;
		el.addEventListener('loadedmetadata', function () {
			video = el;
			var b = document.createElement('button');
			b.type = 'button';
			b.id = 'thumb-video';
			b.setAttribute('aria-label', 'Play the video');
			b.innerHTML = '<img src="' + design().thumb + '" alt="" width="64" height="64"><span class="vid"><svg><use href="#i-play"/></svg></span>';
			b.onclick = showVideo;
			$('thumbs').insertBefore(b, $('thumbs').firstChild);
			var expand = document.createElement('button');
			expand.type = 'button';
			expand.className = 'expand';
			expand.id = 'expand';
			expand.innerHTML = '<svg aria-hidden="true"><use href="#i-play"/></svg>Watch with sound';
			expand.onclick = function () {
				el.muted = false;
				el.controls = true;
				if (el.webkitEnterFullscreen) el.webkitEnterFullscreen();
				else if (el.requestFullscreen) el.requestFullscreen().catch(function () {});
				el.play().catch(function () {});
			};
			stage.appendChild(el);
			stage.appendChild(expand);
			showVideo();
		}, { once: true });
		el.addEventListener('error', function () { el.remove(); }, { once: true });
		// Attached only once it loads; until then it is off the page.
		el.load();
	}
	function showVideo() {
		if (!video) return;
		state.video = true;
		render();
		video.play().catch(function () {});
	}

	// --- the two choices ----------------------------------------------------------
	c.designs.forEach(function (d) {
		var b = document.createElement('button');
		b.type = 'button';
		b.className = 'tile';
		b.setAttribute('role', 'radio');
		b.setAttribute('data-design', d.code);
		b.innerHTML =
			'<img src="' + d.thumb + '" alt="" width="58" height="58">' +
			'<span><span class="name">' + d.name + '</span><span class="sub">' + d.blurb + '</span></span>' +
			'<span class="tick" aria-hidden="true"><svg><use href="#i-check"/></svg></span>';
		b.onclick = function () { pick(d.code); };
		$('designs').appendChild(b);
	});
	c.sizes.forEach(function (s) {
		var b = document.createElement('button');
		b.type = 'button';
		b.className = 'size';
		b.setAttribute('role', 'radio');
		b.setAttribute('data-size', s);
		b.textContent = s;
		b.onclick = function () {
			state.size = s;
			$('size-error').textContent = '';
			render();
			// On a short phone the button is just under the fold: bring it in,
			// and only as far as needed.
			$('buy').scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'nearest' });
		};
		$('sizes').appendChild(b);
	});

	function pick(code) {
		if (state.design === code && !state.video) return;
		state.design = code;
		state.video = false;
		state.view = views.map(function (v) { return v.design; }).indexOf(code);
		render();
	}

	// --- the size guide: the supplier's table when there is one -----------------
	(function () {
		var box = $('size-chart');
		var rows = Array.isArray(c.sizeChart) ? c.sizeChart : [];
		if (rows.length) {
			var cm = function (n) { return n == null ? '–' : n + ' cm / ' + (n / 2.54).toFixed(1) + '"'; };
			var hasSleeve = rows.some(function (r) { return r.sleeveCm != null; });
			box.innerHTML =
				'<table class="chart"><caption>Garment laid flat, from our maker. Compare with a hoodie you already own.</caption>' +
				'<thead><tr><th scope="col">Size</th><th scope="col">Chest (across)</th><th scope="col">Length</th>' + (hasSleeve ? '<th scope="col">Sleeve</th>' : '') + '</tr></thead><tbody>' +
				rows.map(function (r) {
					return '<tr><th scope="row">' + r.size + '</th><td>' + cm(r.chestCm) + '</td><td>' + cm(r.lengthCm) + '</td>' + (hasSleeve ? '<td>' + cm(r.sleeveCm) + '</td>' : '') + '</tr>';
				}).join('') +
				'</tbody></table>';
		} else {
			box.innerHTML = '<p class="pending">We’ve asked our maker for the exact chest and length measurements and will add them here the moment we have them. Not sure which size? Email <a href="mailto:contact@chillmypet.com">contact@chillmypet.com</a> with your height and the hoodie size you usually wear, and we’ll help you choose.</p>';
		}
		if (c.modelWears) {
			var p = document.createElement('p');
			p.className = 'model';
			p.textContent = c.modelWears;
			box.appendChild(p);
		}
	})();

	function render() {
		var d = design();
		var v = views[state.view];
		if (v.design !== state.design) v = views[state.view = views.map(function (x) { return x.design; }).indexOf(state.design)];
		photo.src = v.src;
		photo.alt = v.alt;
		zoom(photo, v);
		photo.hidden = state.video;
		if (video) {
			video.hidden = !state.video;
			if (!state.video) video.pause();
			$('expand').hidden = !state.video;
		}
		all('#thumbs button:not(#thumb-video)').forEach(function (b, i) {
			var on = !state.video && i === state.view;
			b.classList.toggle('on', on);
			b.setAttribute('aria-pressed', String(on));
		});
		var vt = $('thumb-video');
		if (vt) {
			vt.classList.toggle('on', state.video);
			vt.setAttribute('aria-pressed', String(state.video));
		}
		$('design-name').textContent = d.name;
		all('.tile').forEach(function (b) {
			b.setAttribute('aria-checked', String(b.getAttribute('data-design') === state.design));
		});
		all('.size').forEach(function (b) {
			b.setAttribute('aria-checked', String(b.getAttribute('data-size') === state.size));
		});
		$('sizes').classList.remove('missing');
		$('dock-photo').src = d.thumb;
		$('dock-title').textContent = d.name + (state.size ? ' · Size ' + state.size : '');
		$('dock-sub').textContent = (state.size ? money + ' · Free shipping' : 'Pick a size · ' + money);
		$('dock-buy').textContent = state.size ? 'Buy now' : 'Pick a size';
	}

	// --- tracking ------------------------------------------------------------
	// Same scheme as chillmypet.com: ViewContent names the product, the cart
	// events name the SKU, which spells out design and size.
	xmasTrack('ViewContent', { content_type: 'product', content_ids: [c.slug], value: c.price, currency: c.currency });

	function buy(e) {
		e.preventDefault();
		var target = link();
		if (!state.size || !target) {
			$('size-error').textContent = 'Please tap your size first: S, M, L or XL.';
			$('sizes').classList.add('missing');
			$('size-picker').scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'center' });
			var first = document.querySelector('.size');
			if (first) first.focus({ preventScroll: true });
			return;
		}
		var data = {
			content_type: 'product',
			content_ids: [target.sku],
			contents: [{ id: target.sku, quantity: 1, item_price: c.price }],
			num_items: 1,
			value: c.price,
			currency: c.currency
		};
		// AddToCart is this page's: it is the tap, and the event the ad set
		// optimises for. InitiateCheckout is not sent here any more. The
		// checkout sends it once the buyer starts typing their details, which
		// is what starting a checkout means, and what keeps the two from being
		// one tap counted twice.
		xmasTrack('AddToCart', data, true);
		// A beat for the beacons, then on to the checkout.
		var url = checkoutUrl();
		setTimeout(function () { location.href = url; }, 150);
	}

	/**
	 * chillmypet.com's checkout for this hoodie, with what was chosen here.
	 *
	 * added=1 tells it this page already reported the add, so it doesn't
	 * report a second one. vid is this visitor's id (cmp_vid, the external_id
	 * on every event here), which chillmypet.com adopts when it has none, so
	 * Meta sees one person from the ad to the Purchase. fbclid and the utm_
	 * tags come along from this page's own address: chillmypet.com runs Meta's
	 * Parameter Builder on the click id it finds in its URL, and a cookie set
	 * on pages.dev is not one it can read.
	 */
	function checkoutUrl() {
		var q = new URLSearchParams();
		q.set('design', state.design);
		q.set('size', state.size);
		q.set('added', '1');
		if (c.visitorId) q.set('vid', c.visitorId);
		new URLSearchParams(location.search).forEach(function (value, key) {
			if (key === 'fbclid' || /^utm_[a-z]+$/.test(key)) q.set(key, value);
		});
		return c.checkout + '?' + q.toString();
	}
	all('.buy').forEach(function (a) { a.addEventListener('click', buy); });

	// --- dock: a Buy in reach whenever the main one is off the screen ----------
	// Off the screen either way: scrolled past it, or, on a short phone, not yet
	// down to it. It stays away while the size buttons are on the screen, which
	// it would otherwise cover on that short phone's first screen. It names
	// what is chosen so far, so a visitor who scrolled down to the size help
	// can see what she is about to buy.
	var dock = $('dock');
	if ('IntersectionObserver' in window) {
		var seen = {};
		var watch = new IntersectionObserver(function (entries) {
			entries.forEach(function (e) { seen[e.target.id] = e.isIntersecting; });
			var away = !seen.buy && !seen['size-picker'];
			dock.classList.toggle('show', away);
			dock.setAttribute('aria-hidden', String(!away));
			dock.querySelector('a').tabIndex = away ? 0 : -1;
		});
		watch.observe($('buy'));
		watch.observe($('size-picker'));
	}

	render();
})();
