/** Shared classic checkout contract. Run only against an isolated local DB. */
import { chromium } from 'playwright';
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:5173';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
function check(label, ok) { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`); if (!ok) process.exitCode = 1; }
// The whole stationary road remains tappable while the vehicle is moving.
for (const width of [320, 390, 959, 960, 1280]) {
	const ctx = await browser.newContext({ viewport: { width, height: 844 } });
	const p = await ctx.newPage();
	await p.goto(`${BASE}/products/christmas-tree-costume/checkout`, { waitUntil: 'networkidle' });
	const road = p.getByRole('button', { name: 'Replay delivery truck animation' });
	const bounds = await road.boundingBox();
	check(`${width}px: strip and vehicle visible in the first screen`, bounds && bounds.y >= 0 && bounds.y + bounds.height < 844 && bounds.height >= 44);
	const rewind = () => p.locator('.truck').evaluate(e => e.getAnimations().find(a => a.animationName === 'classic-drive').finish());
	const replayed = () => p.locator('.truck').evaluate(e => e.getAnimations().some(a => a.animationName === 'classic-drive' && a.playState === 'running' && a.currentTime < 800));
	await rewind();
	await road.click({ position: { x: 10, y: bounds.height / 2 } });
	check(`${width}px: clicking the stripe replays the drive`, await replayed());
	await rewind();
	await road.press('Enter');
	check(`${width}px: Enter replays the drive`, await replayed());
	await rewind();
	await road.press('Space');
	check(`${width}px: Space replays the drive`, await replayed());
	check(`${width}px: replay keeps focus on the stationary control`, await road.evaluate(e => e === document.activeElement));
	check(`${width}px: no horizontal scrolling`, await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
	await ctx.close();
}
for (const [slug, design, size] of [
	['life-jacket', 'green', 'M'],
	['christmas-tree-costume', 'green', 'M'],
	['christmas-hoodie', 'red', 'M'],
	['santa-costume-with-gift', 'red', 'M'],
	['santa-outfit', 'santa_suit', 'M'],
	['calming-massager', 'black', 'One size']
]) {
	const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
	const p = await ctx.newPage();
	const errors = []; p.on('pageerror', (e) => errors.push(String(e)));
	await p.goto(`${BASE}/products/${slug}/checkout?design=${design}&size=${encodeURIComponent(size)}&added=1`, { waitUntil: 'networkidle' });
	check(`${slug}: shared template`, await p.locator('.classic-card').count() === 1);
	check(`${slug}: exactly one payment button`, await p.locator('.classic-payb').count() === 1);
	check(`${slug}: valid choices collapsed`, !(await p.locator('#order-design').isVisible()));
	check(`${slug}: chosen design`, (await p.inputValue('#order-design')) === design);
	check(`${slug}: one size has no irrelevant advice`, size !== 'One size' || (await p.locator('#order-size').count()) === 0);
	check(`${slug}: estimate matches shipping`, (await p.locator('.classic-arrival').innerText()) === (await p.locator('.shop-choice small').first().innerText()));
	check(`${slug}: no horizontal scrolling`, await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
	await p.getByRole('button', { name: 'Change', exact: true }).click();
	check(`${slug}: Change opens and focuses selectors`, (await p.locator('#order-design').isVisible()) && await p.evaluate(() => document.activeElement?.id === 'order-design'));
	await p.getByRole('button', { name: 'Done', exact: true }).click();
	const photo = await p.locator('.classic-product img').getAttribute('src');
	await p.reload({ waitUntil: 'networkidle' });
	check(`${slug}: reloading restores the selected photo`, (await p.locator('.classic-product img').getAttribute('src')) === photo);
	await p.getByRole('button', { name: 'Replay delivery truck animation' }).click();
	check(`${slug}: replay button keeps keyboard focus`, await p.locator('.classic-road').evaluate(e => e === document.activeElement));
	await p.goto(`${BASE}/checkout`, { waitUntil: 'networkidle' });
	check(`${slug}: basket uses same template and keeps its item`, await p.locator('.classic-card').count() === 1 && await p.locator('.classic-line').count() === 1);
	check(`${slug}: basket offers removal`, await p.getByRole('button', { name: 'Remove', exact: true }).isVisible());
	check(`${slug}: no page errors`, errors.length === 0);
	await ctx.close();
}
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
const p = await ctx.newPage();
await p.goto(`${BASE}/products/christmas-tree-costume/checkout`, { waitUntil: 'networkidle' });
check('no size: real selectors remain open', await p.locator('#order-size').isVisible());
check('no size: no selection is guessed', await p.inputValue('#order-size') === '');
check('no size: payment waits', await p.locator('.classic-payb').isDisabled());
await p.getByRole('button', { name: 'Replay delivery truck animation' }).click();
check('reduced motion: replay stays still', await p.locator('.truck').evaluate(e => e.getAnimations().length === 0));
await ctx.close();
await browser.close();
