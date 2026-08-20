<script lang="ts">
	/**
	 * Address autocomplete — one field that becomes six.
	 *
	 * Not a block: it takes plain props, so it never appears in a manifest. It's
	 * the search half of `shipping_form`, split out because the combobox
	 * behaviour (debounce, keyboard, session billing, degradation) has nothing to
	 * do with rendering a field group.
	 *
	 * Talks to a host endpoint, never to Google. The block has no API key, no
	 * knowledge of Places' response shape, and no opinion about which provider is
	 * behind it — see `endpoint`.
	 */

	import type {
		AddressSuggestion as Suggestion,
		DetailsResponse,
		ResolvedAddress,
		SuggestResponse
	} from './address';

	let {
		id,
		label = 'Address',
		placeholder = 'Start typing your address',
		/** Host route that proxies the provider. Must accept `?q=` and `?place=`. */
		endpoint = '/api/address',
		/** ISO country codes to bias results to, e.g. ['ca','us']. */
		countries = [],
		manualLabel = 'Enter address manually',
		onresolve,
		onmanual
	}: {
		id: string;
		label?: string;
		placeholder?: string;
		endpoint?: string;
		countries?: string[];
		manualLabel?: string;
		onresolve: (address: ResolvedAddress) => void;
		onmanual: (typed: string) => void;
	} = $props();

	let query = $state('');
	let suggestions = $state<Suggestion[]>([]);
	let open = $state(false);
	let active = $state(-1);
	let busy = $state(false);
	/** Set once the endpoint says it has no provider — then we stop asking. */
	let unavailable = $state(false);

	/**
	 * One token per address-entry session, reset after a details call.
	 *
	 * Google bills every keystroke's autocomplete plus the one details call as a
	 * SINGLE session when they share a token, and as N separate lookups when they
	 * don't. Forgetting it doesn't break anything — it just multiplies the bill by
	 * however many characters people type.
	 */
	let session = newSession();
	function newSession(): string {
		return typeof crypto !== 'undefined' && crypto.randomUUID
			? crypto.randomUUID()
			: String(Math.random()).slice(2);
	}

	let timer: ReturnType<typeof setTimeout> | undefined;
	let seq = 0;

	function onInput(value: string) {
		query = value;
		active = -1;
		if (unavailable) return;
		clearTimeout(timer);
		if (value.trim().length < 3) {
			suggestions = [];
			open = false;
			return;
		}
		// Debounced because each call is billable and a fast typist would otherwise
		// spend a dozen lookups on one address.
		timer = setTimeout(() => void search(value), 250);
	}

	async function search(value: string) {
		const mine = ++seq;
		busy = true;
		try {
			const qs = new URLSearchParams({ q: value, session });
			if (countries.length) qs.set('countries', countries.join(','));
			const res = await fetch(`${endpoint}?${qs}`);
			const data = (await res.json()) as SuggestResponse;
			// A slow earlier request must not overwrite a newer one's results.
			if (mine !== seq) return;
			if (data.available === false) {
				unavailable = true;
				open = false;
				return;
			}
			suggestions = data.suggestions ?? [];
			open = suggestions.length > 0;
		} catch {
			unavailable = true;
			open = false;
		} finally {
			if (mine === seq) busy = false;
		}
	}

	async function choose(s: Suggestion) {
		open = false;
		query = [s.main, s.secondary].filter(Boolean).join(', ');
		busy = true;
		try {
			const res = await fetch(`${endpoint}?place=${encodeURIComponent(s.id)}&session=${session}`);
			const data = (await res.json()) as DetailsResponse;
			if (data.address) onresolve(data.address);
			else onmanual(query);
		} catch {
			onmanual(query);
		} finally {
			busy = false;
			// The session is spent whether or not the details call succeeded.
			session = newSession();
		}
	}

	function onKey(e: KeyboardEvent) {
		if (!open) {
			if (e.key === 'ArrowDown' && suggestions.length) open = true;
			return;
		}
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			active = (active + 1) % suggestions.length;
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			active = active <= 0 ? suggestions.length - 1 : active - 1;
		} else if (e.key === 'Enter') {
			// Only swallow Enter when a suggestion is highlighted, so the key still
			// submits the form for someone typing an address the provider doesn't know.
			if (active >= 0) {
				e.preventDefault();
				void choose(suggestions[active]);
			}
		} else if (e.key === 'Escape') {
			open = false;
			active = -1;
		}
	}

	const FIELD =
		'rounded-field border border-[#d8d5cf] bg-white px-4 py-3 text-15 text-fx-ink placeholder:text-fx-muted focus:border-fx-ink focus:outline-none w-full';
</script>

<div class="relative flex flex-col gap-2">
	<label class="text-13 text-fx-sub font-medium" for={id}>{label}</label>

	<input
		{id}
		class={FIELD}
		type="text"
		{placeholder}
		autocomplete="street-address"
		value={query}
		oninput={(e) => onInput(e.currentTarget.value)}
		onkeydown={onKey}
		onblur={() => setTimeout(() => (open = false), 120)}
		role="combobox"
		aria-expanded={open}
		aria-controls="{id}-listbox"
		aria-autocomplete="list"
		aria-activedescendant={active >= 0 ? `${id}-opt-${active}` : undefined}
	/>

	{#if open}
		<div
			class="rounded-panel absolute top-full right-0 left-0 z-20 mt-1 overflow-hidden border border-[#d8d5cf] bg-white shadow-[0_8px_30px_rgba(0,0,0,0.12)]"
		>
			<!-- Attribution is a condition of using Places predictions outside a
			     Google map, not decoration. -->
			<p class="text-11 text-fx-muted border-b border-[#e2e0dc] px-4 py-2">
				Suggestions powered by Google
			</p>

			<ul id="{id}-listbox" role="listbox" aria-label="Address suggestions" class="max-h-72 overflow-auto">
				{#each suggestions as s, i (s.id)}
					<li>
						<button
							id="{id}-opt-{i}"
							type="button"
							role="option"
							aria-selected={i === active}
							class="text-15 flex w-full flex-col gap-0.5 px-4 py-3 text-left {i === active
								? 'bg-fx-surface-hover'
								: 'hover:bg-fx-surface'}"
							onmousedown={(e) => e.preventDefault()}
							onclick={() => choose(s)}
						>
							<span class="text-fx-ink font-medium">{s.main}</span>
							{#if s.secondary}<span class="text-13 text-fx-sub">{s.secondary}</span>{/if}
						</button>
					</li>
				{/each}
			</ul>

			<button
				type="button"
				class="text-13 text-fx-sub w-full border-t border-[#e2e0dc] px-4 py-3 text-left hover:underline"
				onmousedown={(e) => e.preventDefault()}
				onclick={() => onmanual(query)}
			>
				{manualLabel}
			</button>
		</div>
	{/if}

	<!-- The escape hatch has to exist outside the dropdown too. Provider coverage
	     is patchy for new builds, rural routes and much of the world, and without
	     this a visitor whose address returns nothing simply cannot check out. -->
	{#if unavailable || (query.trim().length >= 3 && !busy && !suggestions.length)}
		<button
			type="button"
			class="text-13 text-fx-sub self-start hover:underline"
			onclick={() => onmanual(query)}
		>
			{manualLabel}
		</button>
	{/if}
</div>
