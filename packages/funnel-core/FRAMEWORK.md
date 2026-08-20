# Funnel framework

A page is **an ordered array of versioned blocks**. The framework owns ordering,
versioning, navigation and event identity. Your project owns the components, the
storage and the analytics. Nothing in here knows what a quiz, a checkout or a
product is — `component` is just a string you resolve.

That's what lets one engine serve a quiz wizard, a leadgen page and a storefront
PDP without forking the renderer.

## The files

| File | What it is | Lifts to |
| --- | --- | --- |
| `index.ts` | The core: schema, versioning, resolution, contracts. **Zero imports.** | anything |
| `svelte.ts` | Types that say "a component is a Svelte component". Types only. | Svelte |
| `WizardLayout.svelte` | `layout: 'wizard'` — one block at a time | Svelte |
| `PageLayout.svelte` | `layout: 'page'` — blocks stacked on one scroll | Svelte |

The folder imports nothing but `svelte` itself — no `$app/*`, no SvelteKit, no
app code. So it drops into any Svelte 5 project, SvelteKit or not.

To lift it: copy the folder. Then write **two files** of your own — a block map
and a host adapter. That's the whole integration.

A React/Vue host copies `index.ts` only and writes its own layouts against the
same contracts.

## The data

```ts
interface Block {
  id: string;          // stable per placement — the "click id" every event carries
  component: string;   // which renderer draws it; you resolve this
  version: number;     // bump when the block's content meaningfully changes
  props?: Record<string, unknown>;  // content. Data, never code.
}

interface FunnelDefinition {
  id: string;                      // logical id, stable across versions
  name: string;
  layout?: 'wizard' | 'page';
  blocks: Block[];
}
```

`funnelVersion(def)` content-hashes the whole manifest to `v_xxx`. Any change to
order, props or a block version yields a new id — it behaves like a lockfile
hash, so conversion stats join back to the exact manifest that produced them.

## The block contract

Every block component takes exactly two props:

```svelte
<script lang="ts">
  import type { Block, WizardContext } from '@funnel/core';
  let { block, ctx }: { block: Block; ctx: WizardContext } = $props();

  const p = $derived((block.props ?? {}) as { headline?: string });
</script>

<h1>{p.headline}</h1>
```

- Read **content** from `block.props`. Cast it locally; the core doesn't type it,
  because typing it would make the core know about your blocks.
- Read **everything else** from `ctx`. A block that imports your store directly
  is a block that can't move to another project.

```ts
interface FlowContext {          // page blocks get this
  track(event: string, props?): void;   // observe — pre-stamped with this block's identity
  submit(action: string, payload?): void; // DO something — host decides how
  state: FunnelStateAdapter;
  index: number;                        // position among *rendered* blocks
  total: number;
}

interface WizardContext extends FlowContext {   // wizard blocks also get these
  next(): void;   // advance, or complete the funnel on the last block
  back(): void;   // step back, or leave the funnel from the first
}
```

### Registering blocks

```ts
import type { WizardComponentMap } from '@funnel/core/svelte';

export const BLOCKS: WizardComponentMap = {
  choice:        { render: ChoiceBlock },
  statementEmail:{ render: StatementEmailBlock },
  proof:         { render: ProofBlock, pinned: true }
};
```

`pinned` (wizard only) moves that block's primary CTA into the shell footer, for
blocks tall enough that the action would fall below the fold.

**Unknown block types are skipped, not thrown.** A manifest published with a
block this build doesn't have still renders everything else. That's what makes
publishing data-only safe — an older deploy degrades instead of white-screening.

## The host contracts

Two objects, written once per project.

`track` observes; `submit` *does something*. Keeping them apart is what makes a
block library shareable — a shared `optin` block calls `ctx.submit('lead', …)`
and never learns whether the host banked it to Stytch or Klaviyo.

> ### Navigation must never become a block prop
>
> This is the rule most likely to fork this library, so it comes first.
>
> A `href` or `redirectTo` on `bundles` — or on any block — puts routing in the
> manifest and couples every block to a router. Once a consuming repo adds it,
> that copy and this one disagree about the block's contract permanently, and
> every later change has to be merged across two definitions of the same thing.
>
> **The block states intent; the host decides what intent means.** A "Buy now"
> button calls `ctx.submit('add_to_cart', …)` and stops. Where that goes — a
> cart, a checkout route, a payment intent, a native sheet — is the host's
> `submit` handler, which already receives the full selection. That is the whole
> reason `submit` is fire-and-forget rather than returning something.
>
> The same applies to anything else that is really the host's: analytics
> destinations, API endpoints, auth, currency formatting. If a prop would make
> the block care about the app around it, it belongs in the host seam instead.

```ts
type TrackFn = (
  event: string,
  subject: { id: string; component: string; version?: number },
  props?: Record<string, unknown>
) => void;

type SubmitFn = (
  action: string,           // 'lead', 'add_to_cart', 'apply_promo'
  subject: { id: string; component: string; version?: number },
  payload?: Record<string, unknown>
) => void;

interface FunnelStateAdapter {
  begin(info: { funnelId: string; version: string; layout: Layout }): void;
  get(field: string): string;              // profile fields: name, email, address…
  set(field: string, value: string): void;
  answer(key: string): string;             // keyed selections: quiz answers, variants…
  setAnswer(key: string, value: string): void;
  city(): string;                          // geo personalization; '' when unknown
}
```

Reads are **methods, not values**, so a host backed by reactive state returns a
live value on each call instead of a snapshot frozen at injection time. In Svelte
that means a `.svelte.ts` factory:

```ts
// shop.svelte.ts
export function createShopState(): FunnelStateAdapter {
  const fields = $state<Record<string, string>>({});
  const selections = $state<Record<string, string>>({});
  let city = $state('');

  return {
    begin: () => { /* stamp session, kick off geo */ },
    get: (f) => fields[f] ?? '',
    set: (f, v) => void (fields[f] = v),
    answer: (k) => selections[k] ?? '',
    setAnswer: (k, v) => void (selections[k] = v),
    city: () => city
  };
}
```

`get/set` vs `answer/setAnswer` is just two namespaces — "one thing about the
person" vs "one keyed selection". A storefront uses `answer` for variant picks
exactly as a quiz uses it for question answers.

---

# Recipes

## 1. Wizard (quiz, multi-step form, checkout)

```svelte
<script lang="ts">
  import WizardLayout from '@funnel/core/WizardLayout.svelte';
  import type { Block } from '@funnel/core';

  const funnelState = createFunnelState();   // NOT `state` — see Gotchas
  let index = $state(0);                     // mirror it out if the head needs the step
</script>

{#snippet progress(pct: number)}
  <div class="bar"><div style:width="{pct}%"></div></div>
{/snippet}

{#snippet pinnedCta(next: () => void)}
  <button onclick={next}>Continue →</button>
{/snippet}

<WizardLayout
  {definition}
  components={BLOCKS}
  track={trackBlock}
  state={funnelState}
  {progress}
  {pinnedCta}
  shell={OnboardingShell}
  onComplete={(block: Block) => { trackBlock('quiz_complete', block); goto('/checkout'); }}
  onExit={() => goto('/')}
  bind:index
/>
```

| Prop | |
| --- | --- |
| `definition`, `components`, `track`, `state` | required |
| `submit?` | `SubmitFn` — handles block side effects; warns if a block submits without one |
| `version?` | pre-binding content version; defaults to hashing the definition given |
| `onComplete(block)` | fired past the last block — you decide where the funnel goes |
| `onExit()` | back pressed on the first block |
| `shell?` | `{ children, onback?, footer? }` component — the chrome. Omit for bare markup. |
| `progress?` | snippet handed the completion `%` |
| `pinnedCta?` | snippet handed `next` — rendered in the footer for `pinned` blocks |
| `index?` | bindable current step |

The wizard emits `step_view` per block reached. It does **not** emit a completion
event — fire your own in `onComplete`, so the event vocabulary stays yours.

## 2. Page (leadgen, advertorial, sales page)

```svelte
<PageLayout
  {definition}
  components={PAGE_BLOCKS}
  track={trackBlock}
  state={funnelState}
  {header}
  rootClass="min-h-svh bg-neutral-50"
  mainClass="mx-auto w-full max-w-[600px] px-6 pb-24"
/>
```

The layout carries no styling of its own — `header`, `rootClass` and `mainClass`
are yours, which is why it lifts unchanged. It emits one `page_view` on mount
with `{ id: definition.id, component: 'page' }`. It takes the same optional
`submit` and `version` props as the wizard.

## 3. Commerce (product page + checkout)

A PDP is a page funnel; a checkout is a wizard funnel. They share one adapter, so
a variant chosen on the PDP is readable at payment.

```ts
const PDP: FunnelDefinition = {
  id: 'pdp-sourdough', name: 'Sourdough kit', layout: 'page',
  blocks: [
    { id: 'size',  component: 'variant',    version: 1,
      props: { label: 'Size', options: ['S','M','L'], saveAs: 'size' } },
    { id: 'buy',   component: 'buy_box',    version: 2,
      props: { title: 'Sourdough kit', price: '$42', sku: 'SD-1' } },
    { id: 'stock', component: 'stock_left', version: 1, props: { units: 7 } }
  ]
};
```

Blocks talk to each other **through the adapter, never through props**:

```svelte
<!-- VariantPicker.svelte — writes -->
<button onclick={() => { ctx.state.setAnswer('size', o); ctx.track('variant_select', { value: o }); }}>

<!-- BuyBox.svelte — reads, reactively -->
<script>
  const size = $derived(ctx.state.answer('size'));
</script>
<button disabled={!size} onclick={() => ctx.track('add_to_cart', { sku: p.sku, size })}>
```

That's the whole mechanism. No block imports another block.

### Binding props to live data

`{ units: 7 }` is a hardcoded 7 — fine for copy, useless for stock and price. A
prop can instead point at a source:

```json
{ "id": "stock", "component": "stock_left", "version": 1,
  "props": { "units": { "$ref": "stock.CMP-LJ-BLUE_CAMO-L" } } }
```

Resolve it on the server, then hand the renderer the bound definition:

```ts
// +page.server.ts
export const load = async () => {
  const snapshot = await loadStore();                       // your DB / Shopify / inventory
  const resolve = createRefResolver(snapshot);              // dotted paths over it
  const { definition, version } = bindDefinition(PDP, resolve);
  return { definition, version };                           // BOTH go to the layout
};
```

`bindDefinition` versions the authored manifest and *then* binds — one call
because the order matters and getting it wrong fails silently (see below).

`createRefResolver` walks dotted paths over namespaced sources, reading **own
properties only**: manifests are JSON a model can author, and an inherited walk
would let `{ "$ref": "__proto__.constructor" }` hand a function to a block as
content.

Binding walks nested objects and arrays, returns a new definition (the source is
never mutated), and **drops keys it can't resolve** so the block's own
`?? default` wins instead of rendering `undefined` at a visitor.

Blocks see no difference — `p.units` is `10`, and the block can't tell whether it
came from a literal or from inventory. That's the point: a block written against
literals keeps working unchanged the day its data source appears.

**The rule for what to bind:** literals are the *author's* decisions — copy,
order, tone, which shots run. `$ref` is the *store's* facts — price, stock,
deadlines, review counts, promo codes. A price written as a literal in a manifest
is how a page ends up advertising a number the checkout no longer charges.

> **The version is computed before binding, and passed to the layout.** The
> version identifies *published content*. If it moved every time stock ticked
> down, no two conversions would share a version and attribution would be
> worthless. Both orders compile and both render identically — nothing fails
> loudly when it's wrong, which is why `bindDefinition` exists.
>
> The layout hashes what it's given when you omit `version`, and what you give it
> is the *bound* definition. Passing it is not optional.

**Worked example:** `src/routes/sandbox/pdp/` — a manifest with live refs
(`store.ts` → `manifest.ts` → `+page.server.ts` → `+page.svelte`), rendering at
`/sandbox/pdp`. `node --import tsx harness/verify-refs.ts` asserts the properties
above against that real manifest, including the one that matters: the version
holds steady across two snapshots taken 13 hours apart while the bound content
demonstrably moves.

---

# Design tokens

Blocks are built against a token scale, never raw values. That's what lets one
block library look native in two brands — and what stops 57 blocks drifting into
13 near-identical `clamp()` ramps, which is what happened before it existed.

Defined in the host's CSS via Tailwind v4 `@theme`.

| Namespace | Tokens |
| --- | --- |
| Display type (fluid) | `text-display-2xl` `-xl` `-lg` `-md` `-sm` |
| Statement / body | `text-lead` `text-body-lg` |
| Fixed type | `text-body` `text-small` `text-caption` `text-eyebrow` `text-micro` |
| Line height | `leading-display` `-headline` `-title` `-copy` `-airy` |
| Tracking | `tracking-display` `-headline` `-snug` `-label` `-eyebrow` |
| Radius | `rounded-field` `rounded-panel` `rounded-card` `rounded-pill` |
| Columns | `max-w-wizard` `-page` `-article` `-measure` |
| Rhythm | `*-block` `*-block-lg` `*-card` `*-gutter` |
| Colour | `fx-bg` `fx-surface` `fx-surface-hover` `fx-ink` `fx-sub` `fx-muted` |

**Display type is fluid, chrome type is fixed.** The `clamp()` middle term is what
makes blocks mobile-correct with zero breakpoints. Labels and captions shouldn't
scale with the viewport, so they're plain px.

**The five display steps stay distinct at 375px** (40/36/30/28/24), not just on
desktop. Check that when adding a step — it's easy to add one that's visually
identical to its neighbour on the only viewport that pays.

**Porting to another brand:** redefine the six `--color-fx-*` values and nothing
else. The type, rhythm and radius scale is brand-neutral; the palette isn't.

```css
@theme {
  --color-fx-ink: #111;          /* your brand */
  --color-fx-surface: #f6f6f6;
  /* … */
}
```

### Two rules that will bite you

**Use utility classes, never `var(--text-display-xl)`.** Tailwind v4 tree-shakes
theme variables — a token only becomes a real CSS custom property once some
generated utility references it. `class="text-display-xl"` works; a raw `var()`
in inline CSS silently resolves to nothing.

**Never name a token after a Tailwind default.** Defining `--radius-2xl` would
silently resize every existing `rounded-2xl`. This bit for real: `--container-prose`
lost to Tailwind's built-in `max-w-prose` (65ch) and rendered 689px instead of
480px — hence `max-w-measure`.

---

# Gotchas

These are failure modes found by actually breaking the renderers, not theory.

**`begin()` runs inside a reactive effect.** If your adapter's `begin` reads
reactive state it also writes, you get an infinite loop. The layouts call it
inside `untrack`, so your reads there are untracked — but keep `begin` to writes
and side effects anyway.

**Don't name a local binding `state` in a Svelte file.** It shadows the `$state`
rune and `$state(0)` silently becomes a store subscription. The layouts take the
prop as `state` but bind it locally as `adapter` for exactly this reason.

**Duplicate block ids don't crash, but they do corrupt analytics.** `resolveBlocks`
hands back a unique `key` per resolved block (`id`, then `id#1`…) so a bad
manifest renders instead of throwing on duplicate keys. Events still report the
raw `block.id` — so two blocks sharing an id are indistinguishable in your data.
Validate uniqueness at publish time; the renderer only guarantees it won't die.

**A bound `index` can outrun the definition.** Registry A/B swaps and live edits
change block counts under a live visitor. `WizardLayout` clamps to the nearest
real step and writes the clamped value back — without that, the visitor lands on
a blank step with no CTA and no way forward.

**`ctx.index` / `ctx.total` count rendered blocks, not manifest blocks.** Skipped
unknown blocks aren't counted, so progress stays honest on an older build.

**Restart the dev server after editing `@theme`.** Vite HMR does not re-run
Tailwind's theme resolution reliably — new tokens appear to generate nothing at
all, which reads exactly like a broken token. Restart before debugging.

**Seed form state with `untrack`.** `let email = $state(untrack(() => ctx.state.get('email')))`
— otherwise a later store write yanks what the visitor is mid-way through typing.

---

# Serving funnels from a registry

The core describes storage without importing a driver:

```ts
interface RegistryStore {
  allocatedVersions(funnelId: string): Promise<Array<{ id: string; manifest: string; weight: number }>>;
}

resolveDefinition(store, funnelId, visitorKey, fallback?)
  // → { definition, versionId }
```

`pickVersion` is sticky by construction: the choice is a pure function of
(visitor, funnel), so no cookie is needed and nobody flips variant mid-funnel.
Weight `0` retires a version without deleting it. If the store is empty or
throws, `resolveDefinition` falls back to a code default — serving must never
break because the registry hiccuped.

> **Changing the bucketing function re-randomizes every live A/B test.** Two
> functions can both produce a correct 50/50 split while disagreeing about which
> half each individual visitor lands in. Swap pickers only between experiments.
