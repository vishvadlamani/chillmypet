/**
 * Svelte binding for the core.
 *
 * `index.ts` stays UI-free; this file is where "a component" gets a concrete
 * type. Everything here is a type — it compiles to nothing — so the pairing is
 * still just two files to lift, and a React host would write its own sibling
 * instead of this one.
 */

import type { Component, Snippet } from 'svelte';
import type { Block, ComponentMap, FlowContext, WizardContext } from './index';

/** Props every block component receives: its own data, plus the host seam. */
export interface BlockProps<Ctx = FlowContext> {
	block: Block;
	ctx: Ctx;
}

export type PageBlockComponent = Component<BlockProps<FlowContext>>;
export type WizardBlockComponent = Component<BlockProps<WizardContext>>;

/** A block the page layout can draw. */
export interface PageBlock {
	render: PageBlockComponent;
}

/** A block the wizard can draw, plus the layout hints the wizard honours. */
export interface WizardBlock {
	render: WizardBlockComponent;
	/**
	 * Pin this block's primary CTA to the shell footer instead of letting it
	 * scroll away. For tall blocks — a proof beat, a long product description —
	 * where the action would otherwise sit below the fold.
	 */
	pinned?: boolean;
}

/**
 * The injectable block libraries. Swapping these is the whole point: the same
 * two renderers serve a quiz, a leadgen page, or a storefront's `buy_box` /
 * `stock_left` blocks, with no renderer edit.
 */
export type PageComponentMap = ComponentMap<PageBlock>;
export type WizardComponentMap = ComponentMap<WizardBlock>;

/**
 * Chrome the wizard renders inside: a back affordance and an optional pinned
 * footer. Injected so the renderer carries no branding of its own.
 */
export type ShellComponent = Component<{
	children: Snippet;
	onback?: () => void;
	footer?: Snippet;
}>;
