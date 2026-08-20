/**
 * Funnel framework — the UI-free core.
 *
 * Lift this folder into any project. It has ZERO imports: no framework, no app,
 * no database, no UI. That constraint is the whole point — the core describes
 * pages as data and stays renderable by Svelte, React, or anything else.
 *
 * What lives here:
 *   - the block schema (a page is an ordered array of versioned blocks)
 *   - content-addressed versioning (a manifest hashes to its own version id)
 *   - the render contract (how a host maps block types → its own components)
 *
 * What deliberately does NOT live here:
 *   - components (they import a UI framework)
 *   - storage (the host supplies its own; see `RegistryStore`)
 *   - any knowledge of quizzes, checkouts or products — `component` is just a
 *     string the host resolves, so the same core serves a quiz, a sales page or
 *     a product page.
 */

// ── Schema ───────────────────────────────────────────────────────────────────

export interface Block {
	/** Stable per-placement id — the "click id" every event on this block carries. */
	id: string;
	/** Component/renderer type the host knows how to draw. */
	component: string;
	/** Explicit component version (NewsSegment@3). Bump when its content changes. */
	version: number;
	/** Content for the component (question, copy, media, product ref, …). Data, not code. */
	props?: Record<string, unknown>;
	/**
	 * Reference paths this block cannot render without. If any fails to resolve,
	 * the block is dropped during binding.
	 *
	 * This is what lets ONE template serve a whole catalogue. Without it a
	 * template has to be the union of every product's needs and every product has
	 * to fill every field — one has a video, one doesn't; one has bundles, one is
	 * a single SKU, and the single-SKU page renders an empty bundle picker.
	 *
	 *   { component: 'bundles', requires: ['product.bundles'], … }
	 *
	 * Presence, not predicates, on purpose. A condition language inside a manifest
	 * is a program nobody reviews and a model can get subtly wrong. "This path
	 * resolved" already means something exact here — an unresolvable ref is how a
	 * missing value is spelled everywhere else in this file.
	 */
	requires?: string[];
	/**
	 * Where the block sits, as opposed to what it says. Optional — omit it and the
	 * block is a full-width row, which is what almost everything is.
	 *
	 * Consecutive blocks sharing a `row` are laid side by side on desktop and
	 * stack on mobile. That covers the one arrangement a scrolling page actually
	 * needs (a product hero: gallery beside the buy column) without making the
	 * definition a tree — `blocks` stays a flat, ordered array that a model can
	 * generate and a human can read.
	 */
	layout?: {
		/** Group key. Adjacent blocks with the same value share a row. */
		row?: string;
		/**
		 * Column within the row. Blocks sharing one stack inside it, which is what
		 * makes a buy column possible — rating, title and bullets are three blocks
		 * in one column, not three columns.
		 */
		col?: string;
		/** Columns out of 12 on desktop. Defaults to an even split of the row. */
		span?: number;
	};
}

/**
 * How a definition is rendered.
 *   wizard — one block at a time, advanced by the visitor (quiz, multi-step form)
 *   page   — every block stacked on one scroll (sales page, product page, advertorial)
 */
export type Layout = 'wizard' | 'page';

export interface FunnelDefinition {
	/** Logical id, stable across versions. */
	id: string;
	name: string;
	layout?: Layout;
	blocks: Block[];
}

// ── Versioning ───────────────────────────────────────────────────────────────

/** Deterministic stringify (sorted keys) so the same manifest always hashes the same. */
function stable(v: unknown): string {
	if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null';
	if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
	const o = v as Record<string, unknown>;
	return (
		'{' +
		Object.keys(o)
			.sort()
			.map((k) => JSON.stringify(k) + ':' + stable(o[k]))
			.join(',') +
		'}'
	);
}

/** FNV-1a 32-bit → base36. Small + sync (no async crypto); fine as a version fingerprint. */
function fnv1a(s: string): string {
	let h = 0x811c9dc5;
	for (let i = 0; i < s.length; i++) {
		h ^= s.charCodeAt(i);
		h = Math.imul(h, 0x01000193);
	}
	return (h >>> 0).toString(36);
}

/**
 * Content version of a definition. Any change to order, component versions or
 * props yields a new id — it behaves like a lockfile hash, so stats can join to
 * the exact manifest that produced an outcome.
 */
export function funnelVersion(def: FunnelDefinition): string {
	return 'v_' + fnv1a(stable(def));
}

// ── Render contract ──────────────────────────────────────────────────────────

/**
 * Maps a block's `component` string to whatever the host renders with. Generic
 * so the core never names a UI type:
 *
 *   const map: ComponentMap<typeof SvelteComponent> = { hero: Hero, buyBox: BuyBox };
 *
 * Injecting this is what lets one engine serve a quiz, a sales page and a
 * storefront — the host owns the components, the core owns the ordering.
 */
export type ComponentMap<C> = Record<string, C>;

/** A block paired with the resolved component, ready to render. */
export interface ResolvedBlock<C> {
	block: Block;
	component: C;
	/**
	 * Unique key for list rendering. Normally just the block id — but a manifest
	 * can carry the same id twice (hand-edited JSON, a copy-pasted block, a model
	 * generating one), and both Svelte and React throw on duplicate keys. The
	 * duplicate gets a `#n` suffix so a bad manifest degrades instead of taking
	 * the page down. Analytics still reports the raw `block.id`.
	 */
	key: string;
}

/**
 * Resolve a definition's blocks against a component map. Unknown block types are
 * SKIPPED, not thrown: a page published with a block this build doesn't know yet
 * must still render the rest. That's what makes publishing data-only safe —
 * an older deploy degrades instead of white-screening.
 *
 * `onUnknown` surfaces the gap so it's visible in logs rather than silent.
 */
export function resolveBlocks<C>(
	def: FunnelDefinition,
	map: ComponentMap<C>,
	onUnknown?: (block: Block) => void
): ResolvedBlock<C>[] {
	const out: ResolvedBlock<C>[] = [];
	const seen = new Map<string, number>();
	for (const block of def.blocks) {
		const component = map[block.component];
		if (!component) {
			onUnknown?.(block);
			continue;
		}
		const n = seen.get(block.id) ?? 0;
		seen.set(block.id, n + 1);
		out.push({ block, component, key: n ? `${block.id}#${n}` : block.id });
	}
	return out;
}

/** A vertical stack of blocks occupying one column of a row. */
export interface BlockColumn<C> {
	key: string;
	/** Width in twelfths, from the first block in the column that names one. */
	span?: number;
	items: ResolvedBlock<C>[];
}

/** A run of blocks laid side by side. Most rows are one column of one block. */
export interface BlockRow<C> {
	key: string;
	/** True when this is just an ordinary full-width block, not a real row. */
	bare: boolean;
	columns: BlockColumn<C>[];
}

/**
 * Fold resolved blocks into rows of columns, so a renderer can lay a run of them
 * side by side. A block with no `layout.row` becomes a bare row — which is why a
 * renderer can pass the whole page through this and treat the ordinary stacked
 * case as the ordinary case rather than a branch.
 *
 * Only ADJACENT blocks group. Reusing a row name later in the page starts a new
 * row rather than teleporting a block up the document, so moving a block in the
 * array always moves it on the page.
 */
export function groupRows<C>(blocks: ResolvedBlock<C>[]): BlockRow<C>[] {
	const rows: BlockRow<C>[] = [];

	for (const item of blocks) {
		const { row, col, span } = item.block.layout ?? {};
		const last = rows[rows.length - 1];

		if (!row) {
			rows.push({ key: item.key, bare: true, columns: [{ key: item.key, items: [item] }] });
			continue;
		}

		const sameRow = last && !last.bare && last.key === `row:${row}`;
		if (!sameRow) {
			rows.push({
				key: `row:${row}`,
				bare: false,
				columns: [{ key: col ?? item.key, span, items: [item] }]
			});
			continue;
		}

		// Within a row, a named column collects everything adjacent that shares its
		// name. An unnamed block stands alone, so two side-by-side blocks still work
		// without anyone having to name columns for a two-block hero.
		const lastCol = last.columns[last.columns.length - 1];
		if (col && lastCol.key === col) {
			lastCol.items.push(item);
			lastCol.span ??= span;
		} else {
			last.columns.push({ key: col ?? item.key, span, items: [item] });
		}
	}

	return rows;
}

// ── Host contracts (analytics + state) ───────────────────────────────────────

/**
 * What an event is about. A `Block` satisfies this structurally; renderers also
 * report page-level events with a synthetic subject (`{ id, component: 'page' }`).
 */
export interface TrackSubject {
	id: string;
	component: string;
	version?: number;
}

/**
 * Analytics sink. The host wires this to whatever tracker it already runs — the
 * core never names one, so a lifted renderer emits into the new project's
 * pipeline without carrying this one's.
 */
export type TrackFn = (
	event: string,
	subject: TrackSubject,
	props?: Record<string, unknown>
) => void;

/**
 * Host-handled side effects — the counterpart to `TrackFn`.
 *
 * `track` observes; `submit` *does something*: bank a lead, add to cart, fire a
 * conversion pixel. Blocks name the intent ('lead', 'add_to_cart') and the host
 * decides what that means, so the same block banks to Stytch in one project and
 * Klaviyo in another without an edit. This is the seam that makes a block
 * library shareable — without it, every block with a side effect has to import
 * the app it lives in.
 */
export type SubmitFn = (
	action: string,
	subject: TrackSubject,
	payload?: Record<string, unknown>
) => void;

/**
 * The slice of host state a funnel touches: answers, profile fields, and the
 * visitor's city. The host decides where that lives (a store, a cookie, a signal)
 * — the core only needs these verbs.
 *
 * Reads are methods, not values, on purpose: a host backed by reactive state
 * returns a live value on each call instead of a snapshot frozen at injection.
 */
export interface FunnelStateAdapter {
	/** Fired once per mount — the funnel identity every later event should carry. */
	begin(info: { funnelId: string; version: string; layout: Layout }): void;
	/** Read a profile field ('name', 'email', 'idea', …). '' when unset. */
	get(field: string): string;
	/** Write a profile field. The host persists it. */
	set(field: string, value: string): void;
	/** Read a stored answer by question key. '' when unanswered. */
	answer(key: string): string;
	/** Record an answer for a question key. */
	setAnswer(key: string, value: string): void;
	/** Visitor city for geo personalization; '' when unknown or not yet resolved. */
	city(): string;
}

/**
 * What every block component is handed alongside its own `block`. This is the
 * seam that keeps blocks portable: a block reads content from `block.props` and
 * everything else from here, so it never imports the host's store or tracker.
 */
export interface FlowContext {
	/** Log an event for this block — the renderer stamps id/component/version. */
	track(event: string, props?: Record<string, unknown>): void;
	/**
	 * Ask the host to *do* something ('lead', 'add_to_cart', 'apply_promo').
	 * Fire-and-forget: a block states intent and never learns how it was served.
	 */
	submit(action: string, payload?: Record<string, unknown>): void;
	state: FunnelStateAdapter;
	/** Position of this block within the resolved definition. */
	index: number;
	total: number;
}

/** A wizard additionally lets a block drive navigation. */
export interface WizardContext extends FlowContext {
	/** Advance to the next block — or complete the funnel, on the last one. */
	next(): void;
	/** Go back one block — or leave the funnel, from the first one. */
	back(): void;
}

// ── Data binding ─────────────────────────────────────────────────────────────

/**
 * A prop that points at live data instead of carrying a literal:
 *
 *   { units: { $ref: 'stock.CMP-LJ-BLUE_CAMO-L' } }
 *
 * Authors write the reference; the host resolves it before render. Blocks never
 * see a `$ref` — they read `props.units` and can't tell a literal from live
 * stock. That's deliberate: it means a block written against literals keeps
 * working unchanged once its data source exists.
 */
export interface Ref {
	$ref: string;
}

export function isRef(v: unknown): v is Ref {
	return (
		!!v &&
		typeof v === 'object' &&
		typeof (v as Ref).$ref === 'string' &&
		Object.keys(v as object).length === 1
	);
}

/** Turns a reference path into a value. `undefined` = unresolvable. */
export type RefResolver = (path: string) => unknown;

/**
 * The usual resolver: dotted paths walked over namespaced source objects.
 *
 *   const resolve = createRefResolver({ product, stock, reviews });
 *   resolve('stock.SKU-L.remaining');   // → sources.stock['SKU-L'].remaining
 *
 * Only OWN properties are read. That's a guard, not a detail: manifests are JSON
 * that a model or a hand-edit can author, and an inherited walk would let
 * `{ $ref: '__proto__.constructor' }` pull a function out of the prototype chain
 * and hand it to a block as content.
 *
 * A missing path returns `undefined`, which `resolveRefs` drops — so an
 * unresolvable ref leaves the block's own default in place instead of printing
 * "undefined" at a visitor.
 *
 * Segments split on `.`, so a key containing a dot isn't addressable. Name ids
 * with dashes (`CMP-LJ-BLUE_CAMO-L`) and it never comes up.
 *
 * Generic over `T` rather than taking `Record<string, unknown>`: a host's
 * snapshot is normally a typed interface, and TS interfaces have no implicit
 * index signature, so the plainer signature would reject every real caller and
 * make them write a cast.
 */
export function createRefResolver<T extends object>(sources: T): RefResolver {
	return (path) => {
		let cur: unknown = sources;
		for (const seg of path.split('.')) {
			if (cur === null || typeof cur !== 'object') return undefined;
			if (!Object.prototype.hasOwnProperty.call(cur, seg)) return undefined;
			cur = (cur as Record<string, unknown>)[seg];
		}
		return cur;
	};
}

function bind(value: unknown, resolve: RefResolver): unknown {
	if (isRef(value)) return resolve(value.$ref);
	if (Array.isArray(value)) return value.map((v) => bind(v, resolve));
	if (value && typeof value === 'object') {
		const out: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
			const bound = bind(v, resolve);
			// Drop unresolved keys entirely so the block's own `?? default` wins,
			// rather than rendering the word "undefined" at a visitor.
			if (bound !== undefined) out[k] = bound;
		}
		return out;
	}
	return value;
}

/**
 * Resolve every `$ref` in a definition's props, returning a new definition.
 * Nested objects and arrays are walked, so refs work anywhere in `props`.
 *
 * Resolution is usually async (a DB read, a pricing call), so run this on the
 * server — in a load function — and hand the renderer the bound result. Blocks
 * then need no loading states.
 *
 * IMPORTANT: compute `funnelVersion()` from the *authored* definition, before
 * binding. The version identifies the content someone published; if it moved
 * every time stock changed, no two conversions would share a version and
 * attribution would be worthless. Pass the pre-binding version to the renderer.
 */
export function resolveRefs(def: FunnelDefinition, resolve: RefResolver): FunnelDefinition {
	return {
		...def,
		blocks: def.blocks
			// Dropped before binding, not after: a block whose data is absent has
			// nothing to bind, and filtering first keeps the resolver off paths the
			// host was never going to answer.
			.filter((b) => (b.requires ?? []).every((path) => resolve(path) !== undefined))
			.map((b) =>
				b.props ? { ...b, props: bind(b.props, resolve) as Record<string, unknown> } : b
			)
	};
}

/**
 * Version, then bind — in that order, which is the only correct one.
 *
 * Prefer this over calling `funnelVersion` and `resolveRefs` separately. Both
 * orders compile and both render identically, but versioning *after* binding
 * silently mints a new version every time stock or a price moves, so no two
 * conversions share a version and the funnel's own reporting goes quietly
 * useless. Nothing fails loudly when it's wrong — hence one call that can only
 * be done one way.
 *
 *   const { definition, version } = bindDefinition(authored, resolve);
 *   // hand BOTH to the renderer; it must not re-hash the bound definition
 */
export function bindDefinition(
	def: FunnelDefinition,
	resolve: RefResolver
): { definition: FunnelDefinition; version: string } {
	const version = funnelVersion(def);
	return { definition: resolveRefs(def, resolve), version };
}

// ── Storage contract ─────────────────────────────────────────────────────────

/**
 * What the core needs from a host's storage to serve funnels-as-data. The host
 * implements this over its own database (Turso, D1, Postgres, a JSON file) —
 * the core never imports a driver.
 */
export interface RegistryStore {
	/** Published manifests for a funnel, with their traffic weights (0 = off). */
	allocatedVersions(
		funnelId: string
	): Promise<Array<{ id: string; manifest: string; weight: number }>>;
}

/** Deterministic 0–1 hash of a key — same visitor always lands in the same bucket. */
function bucket(key: string): number {
	return (parseInt(fnv1a(key), 36) % 10000) / 10000;
}

/**
 * Pick a version for this visitor by weight. Sticky by construction: the choice
 * is a pure function of (visitor, funnel), so no cookie or storage is needed and
 * the same person never flips variants mid-funnel.
 */
export function pickVersion<T extends { id: string; weight: number }>(
	versions: T[],
	visitorKey: string
): T | null {
	const live = versions.filter((v) => v.weight > 0);
	if (!live.length) return null;
	const total = live.reduce((s, v) => s + v.weight, 0);
	let point = bucket(visitorKey) * total;
	for (const v of live) {
		point -= v.weight;
		if (point <= 0) return v;
	}
	return live[live.length - 1];
}

/**
 * Resolve the definition this visitor should see.
 *
 * Falls back to `fallback` when the store is empty or errors — serving must
 * never break because the registry had a hiccup, and a code default means a
 * brand-new install works before anything has been published.
 */
export async function resolveDefinition(
	store: RegistryStore,
	funnelId: string,
	visitorKey: string,
	fallback?: FunnelDefinition | null
): Promise<{ definition: FunnelDefinition | null; versionId: string }> {
	try {
		const versions = await store.allocatedVersions(funnelId);
		const chosen = pickVersion(versions, `${visitorKey}:${funnelId}`);
		if (chosen) {
			return {
				definition: JSON.parse(chosen.manifest) as FunnelDefinition,
				versionId: chosen.id
			};
		}
	} catch {
		/* registry unavailable — fall through to the code default */
	}
	const def = fallback ?? null;
	return { definition: def, versionId: def ? funnelVersion(def) : '' };
}
