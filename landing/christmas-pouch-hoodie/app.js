(function () {
	var c = window.XMAS;
	var $ = function (id) { return document.getElementById(id); };
	var money = '$' + c.price.toFixed(2);

	// ?design=green_stocking preselects a design, for an ad per design.
	var asked = new URLSearchParams(location.search).get('design');
	var state = {
		design: c.designs.some(function (d) { return d.code === asked; }) ? asked : c.designs[0].code,
		// No default size: it is the wearer's, and a guess ships the wrong one.
		size: ''
	};
	var design = function () { return c.designs.filter(function (d) { return d.code === state.design; })[0]; };
	var link = function () { return c.links[state.design + ':' + state.size]; };

	// --- Christmas strip: shown until the cut-off day is over in LA ---------
	(function () {
		var today = new Intl.DateTimeFormat('en-CA', { timeZone: c.cutoffZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
		if (today > c.cutoff) return;
		var label = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'long', month: 'short', day: 'numeric' }).format(new Date(c.cutoff + 'T00:00:00Z'));
		var strip = $('christmas');
		strip.textContent = '🎄 Order by ' + label + ' for Christmas delivery to the US';
		strip.hidden = false;
	})();

	// --- pickers ---------------------------------------------------------------
	function render() {
		var d = design();
		$('photo').src = d.image;
		$('photo').alt = c.title + ' in ' + d.name + ', worn with a cat peeking out of the pouch';
		$('ribbon').textContent = d.name;
		$('design-name').textContent = d.name;
		$('dock-photo').src = d.thumb;
		$('size-name').textContent = state.size ? ': ' + state.size : '';
		[].forEach.call(document.querySelectorAll('[data-design]'), function (el) {
			var on = el.getAttribute('data-design') === state.design;
			if (el.tagName === 'INPUT') {
				el.checked = on;
				el.parentNode.classList.toggle('on', on);
			} else {
				el.classList.toggle('on', on);
				el.setAttribute('aria-pressed', String(on));
			}
		});
		[].forEach.call(document.querySelectorAll('input[name="size"]'), function (el) {
			el.checked = el.value === state.size;
			el.parentNode.classList.toggle('on', el.checked);
		});
		var buyLabel = state.size ? 'Buy now · ' + money : 'Pick your size · ' + money;
		$('buy').textContent = buyLabel;
	}

	c.designs.forEach(function (d) {
		var b = document.createElement('button');
		b.type = 'button';
		b.setAttribute('data-design', d.code);
		b.setAttribute('aria-label', 'Show ' + d.name);
		b.innerHTML = '<img src="' + d.thumb + '" alt="" width="76" height="76">';
		b.onclick = function () { pick(d.code); };
		$('thumbs').appendChild(b);

		var l = document.createElement('label');
		l.className = 'design';
		l.innerHTML = '<input type="radio" name="design" value="' + d.code + '" data-design="' + d.code + '"><img src="' + d.thumb + '" alt="" width="52" height="52"><span>' + d.name + '</span>';
		l.querySelector('input').onchange = function () { pick(d.code); };
		$('designs').appendChild(l);
	});

	c.sizes.forEach(function (s) {
		var l = document.createElement('label');
		l.className = 'size';
		l.innerHTML = '<input type="radio" name="size" value="' + s + '"><span>' + s + '</span>';
		l.querySelector('input').onchange = function () {
			state.size = s;
			$('size-error').textContent = '';
			render();
		};
		$('sizes').appendChild(l);
	});

	function pick(code) {
		state.design = code;
		render();
	}

	// --- tracking ------------------------------------------------------------
	// Same scheme as chillmypet.com: ViewContent names the product, the cart
	// events name the SKU, which spells out design and size.
	xmasTrack('ViewContent', { content_type: 'product', content_ids: [c.slug], value: c.price, currency: c.currency });

	function buy(e) {
		e.preventDefault();
		var target = link();
		if (!state.size || !target) {
			$('size-error').textContent = 'Pick your size first, then we’re good to go. 🎅';
			var still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
			$('size-picker').scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'center' });
			var first = document.querySelector('input[name="size"]');
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
		xmasTrack('AddToCart', data, true);
		xmasTrack('InitiateCheckout', data, true);
		// A beat for the beacons, then on to Stripe.
		setTimeout(function () { location.href = target.url; }, 150);
	}
	[].forEach.call(document.querySelectorAll('.buy'), function (a) { a.addEventListener('click', buy); });

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

	// --- snow: fixed positions, purely decorative ----------------------------
	var snow = $('snow');
	for (var i = 0; i < 18; i++) {
		var f = document.createElement('span');
		f.textContent = '❄';
		f.style.left = ((i * 37 + 11) % 100) + '%';
		f.style.fontSize = (10 + ((i * 7) % 12)) + 'px';
		f.style.animationDuration = (14 + ((i * 5) % 10)) + 's';
		f.style.animationDelay = '-' + ((i * 3.7) % 20) + 's';
		f.style.setProperty('--y', ((i * 23 + 5) % 95) + '%');
		snow.appendChild(f);
	}

	render();
})();
