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
		view: 0
	};
	var design = function (code) { return c.designs.filter(function (d) { return d.code === (code || state.design); })[0]; };
	var link = function () { return c.links[state.design + ':' + state.size]; };

	// Every photo on the page is one of the two product shots; the close-ups are
	// the same files zoomed with CSS (--z around --x/--y), so nothing is shown
	// that the buyer won't receive.
	var views = [];
	c.designs.forEach(function (d) {
		views.push({ design: d.code, src: d.image, z: 1, x: '50%', y: '30%', alt: c.title + ' in ' + d.name + ', worn with a cat peeking out of the pouch' });
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
			$('cd-d').textContent = two(Math.floor(left / 86400));
			$('cd-h').textContent = two(Math.floor(left / 3600) % 24);
			$('cd-m').textContent = two(Math.floor(left / 60) % 60);
			$('cd-s').textContent = two(left % 60);
			setTimeout(tick, 1000 - (Date.now() % 1000));
		}
		bar.hidden = false;
		tick();
	})();

	// --- gallery ---------------------------------------------------------------
	views.forEach(function (v, i) {
		var b = document.createElement('button');
		b.type = 'button';
		b.setAttribute('aria-label', 'Show ' + (v.label ? v.label + ', ' : '') + design(v.design).name);
		b.innerHTML = '<img src="' + design(v.design).thumb + '" alt="" width="62" height="68">';
		zoom(b.querySelector('img'), v);
		b.onclick = function () { show(i); };
		$('thumbs').appendChild(b);
	});
	$('prev').onclick = function () { show((state.view + views.length - 1) % views.length); };
	$('next').onclick = function () { show((state.view + 1) % views.length); };

	function show(i) {
		state.view = i;
		state.design = views[i].design;
		render();
	}

	// "See it up close": each design's ring and its appliqué.
	[1, 2, 4, 5].forEach(function (i) {
		var v = views[i];
		var li = document.createElement('li');
		li.innerHTML = '<button type="button"><img src="' + v.src + '" alt="' + v.alt + '" loading="lazy"><span class="play" aria-hidden="true"><svg><use href="#i-zoom"/></svg></span><span class="cap">' + (v.label || design(v.design).name) + '</span></button>';
		zoom(li.querySelector('img'), v);
		li.querySelector('button').onclick = function () {
			show(i);
			if (window.matchMedia('(max-width: 989px)').matches) document.querySelector('.gallery').scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'start' });
		};
		$('closeups').appendChild(li);
	});

	// --- design cards ------------------------------------------------------------
	var extras = '<span class="extras">' +
		'<span class="extra"><svg class="ok" aria-hidden="true"><use href="#i-check-circle"/></svg><span class="ic"><svg><use href="#i-truck"/></svg></span><b>+ Free standard shipping</b><span>FREE</span></span>' +
		'<span class="extra"><svg class="ok" aria-hidden="true"><use href="#i-check-circle"/></svg><span class="ic"><svg><use href="#i-return"/></svg></span><b>+ 30-day returns, label on us</b><span>FREE</span></span>' +
		'</span>';
	c.designs.forEach(function (d) {
		var bar = document.createElement('div');
		bar.className = 'bar';
		bar.setAttribute('data-design', d.code);
		bar.innerHTML =
			'<span class="tab">' + d.tag + '</span>' +
			'<label class="main"><input type="radio" name="design" value="' + d.code + '">' +
			'<span class="radio" aria-hidden="true"></span>' +
			'<span class="what"><span class="name">' + d.name + '</span><span class="blurb">' + d.blurb + '</span></span>' +
			'<span class="cost"><b>' + money + '</b><span>Free shipping</span></span></label>' +
			'<div class="variant">' +
			'<p class="label"><label for="size-' + d.code + '">Your size, not your pet’s</label>·<a href="#size-guide">Size guide</a></p>' +
			'<div class="row"><img src="' + d.thumb + '" alt="" width="40" height="40">' +
			'<select id="size-' + d.code + '" name="size"><option value="" disabled selected>Size</option>' +
			c.sizes.map(function (s) { return '<option>' + s + '</option>'; }).join('') +
			'</select></div>' +
			'<p class="error" role="alert"></p>' +
			'</div>' + extras;
		bar.querySelector('input').onchange = function () { pick(d.code); };
		// The whole card picks its design, except the controls inside it.
		bar.onclick = function (e) { if (!e.target.closest('select, a, label.main')) pick(d.code); };
		bar.querySelector('select').onchange = function () {
			state.size = this.value;
			all('.error').forEach(function (el) { el.textContent = ''; });
			render();
		};
		bar.querySelector('a').onclick = function () { $('size-guide').open = true; };
		$('designs').appendChild(bar);
	});

	function pick(code) {
		if (state.design === code) return;
		state.design = code;
		state.view = views.map(function (v) { return v.design; }).indexOf(code);
		render();
	}

	function render() {
		var d = design();
		var v = views[state.view];
		if (v.design !== state.design) v = views[state.view = views.map(function (x) { return x.design; }).indexOf(state.design)];
		var photo = $('photo');
		photo.src = v.src;
		photo.alt = v.alt;
		zoom(photo, v);
		$('dock-photo').src = d.thumb;
		all('#thumbs button').forEach(function (b, i) {
			b.classList.toggle('on', i === state.view);
			b.setAttribute('aria-pressed', String(i === state.view));
		});
		all('.bar').forEach(function (bar) {
			var on = bar.getAttribute('data-design') === state.design;
			bar.classList.toggle('on', on);
			bar.querySelector('input').checked = on;
			var sel = bar.querySelector('select');
			sel.value = state.size;
			sel.classList.remove('missing');
			sel.tabIndex = on ? 0 : -1;
		});
	}

	// --- tracking ------------------------------------------------------------
	// Same scheme as chillmypet.com: ViewContent names the product, the cart
	// events name the SKU, which spells out design and size.
	xmasTrack('ViewContent', { content_type: 'product', content_ids: [c.slug], value: c.price, currency: c.currency });

	function buy(e) {
		e.preventDefault();
		var target = link();
		if (!state.size || !target) {
			var bar = document.querySelector('.bar.on');
			var sel = bar.querySelector('select');
			bar.querySelector('.error').textContent = 'Pick your size first, then we’re good to go. 🎅';
			sel.classList.add('missing');
			bar.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'center' });
			sel.focus({ preventScroll: true });
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
		xmasTrack('AddToCart', data, true);
		xmasTrack('InitiateCheckout', data, true);
		// The visitor id rides to Stripe as client_reference_id, the one value a
		// Payment Link carries through to the session, so the webhook's Purchase
		// names the same person as the events above.
		var url = target.url;
		if (window.XMAS.visitorId) url += (url.indexOf('?') < 0 ? '?' : '&') + 'client_reference_id=' + window.XMAS.visitorId;
		// A beat for the beacons, then on to Stripe.
		setTimeout(function () { location.href = url; }, 150);
	}
	all('.buy').forEach(function (a) { a.addEventListener('click', buy); });

	// --- dock: appears once the main button has scrolled away ---------------
	var dock = $('dock');
	if ('IntersectionObserver' in window) {
		new IntersectionObserver(function (entries) {
			var away = !entries[0].isIntersecting && entries[0].boundingClientRect.top < 0;
			dock.classList.toggle('show', away);
			dock.setAttribute('aria-hidden', String(!away));
			dock.querySelector('a').tabIndex = away ? 0 : -1;
		}).observe($('buy'));
	}

	// --- why-they-love-it cards: one card per click ----------------------------
	var cards = $('cards');
	var step = function () { var li = cards.querySelector('li'); return li ? li.getBoundingClientRect().width + 20 : 300; };
	$('cards-prev').onclick = function () { cards.scrollBy({ left: -step(), behavior: still ? 'auto' : 'smooth' }); };
	$('cards-next').onclick = function () { cards.scrollBy({ left: step(), behavior: still ? 'auto' : 'smooth' }); };

	// --- marquees: enough copies that half the belt outruns a wide screen ------
	all('.belt').forEach(function (belt) {
		var once = belt.innerHTML;
		belt.innerHTML = once + once + once + once;
	});

	render();
})();
