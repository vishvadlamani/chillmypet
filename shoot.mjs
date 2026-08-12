import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const ctx = await b.newContext({ viewport: { width: 460, height: 900 }, isMobile: true, hasTouch: true });
const p = await ctx.newPage();
// Stripe.js can't be reached from here, so stub it: the point of this shot is
// the page's own layout — where the fields sit, and that nothing else is in the way.
await p.route('https://js.stripe.com/v3/', route => route.fulfill({
	status: 200, contentType: 'application/javascript',
	body: `window.Stripe = function(){ return {
		elements: function(){ return {
			create: function(){ return { mount: function(el){
				el.innerHTML = '<div style="border:1px solid #d7dbe0;border-radius:8px;padding:14px;font:14px system-ui;color:#6b7280">Card number   MM / YY   CVC<div style="margin-top:10px;height:1px;background:#eef0f2"></div><div style="margin-top:10px">Stripe Payment Element mounts here</div></div>';
			}, unmount: function(){} }; },
			submit: async function(){ return {}; }, getElement: function(){ return null; }
		}; },
		confirmPayment: async function(){ return {}; }
	}; };`
}));
await p.goto('http://127.0.0.1:5173/products/dog-life-jacket', { waitUntil: 'networkidle' });
await p.getByRole('button', { name: /add to cart/i }).first().click();
await p.waitForTimeout(400);
await p.goto('http://127.0.0.1:5173/checkout', { waitUntil: 'networkidle' });
await p.waitForTimeout(1500);
const S='/tmp/claude-0/-home-user-chillmypet/c89887f4-fba8-599d-a73d-7a08a8b19c64/scratchpad/shots';
const box = await p.locator('h2', { hasText: /^Payment$/ }).boundingBox();
if (box) { await p.evaluate(y => window.scrollTo(0, y - 260), box.y); await p.waitForTimeout(500); }
await p.screenshot({ path: `${S}/inline-pay.png` });
console.log('shot taken');
await b.close();
