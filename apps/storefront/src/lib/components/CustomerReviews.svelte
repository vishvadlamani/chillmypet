<script lang="ts">
	import { enhance } from '$app/forms';
	import type { Review } from 'ecomwithai';
	let { summary, form, spanish = false }: {
		summary: { reviews: Review[]; count: number; average: number };
		form?: { reviewSent?: boolean; reviewError?: string; reviewValues?: { author: string; rating: number; body: string } } | null;
		spanish?: boolean;
	} = $props();
	let sending = $state(false);
	const text = (en: string, es: string) => spanish ? es : en;
</script>

<section class="customer-reviews" id="customer-reviews" aria-labelledby="reviews-title">
	<div class="reviews-heading">
		<div>
			<p class="eyebrow">{text('Your experience', 'Tu experiencia')}</p>
			<h2 id="reviews-title">{text('Customer reviews', 'Opiniones de clientes')}</h2>
			{#if summary.count}
				<p>{summary.average.toFixed(1)} / 5 · {summary.count} {text('reviews', 'opiniones')}</p>
			{:else}
				<p>{text('No reviews yet. Share your experience with the first one.', 'Todavía no hay opiniones. Comparte tu experiencia.')}</p>
			{/if}
		</div>
		<a href="#write-review">{text('Write a review', 'Escribir una opinión')} ↗</a>
	</div>
	<div class="reviews-content">
		<div class="review-list">
			{#each summary.reviews as review (review.id)}
				<article>
					<p class="stars" aria-label={`${review.rating} / 5`}>{'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}</p>
					<p class="review-body">{review.body}</p>
					<footer><strong>{review.author}</strong> · <time datetime={review.createdAt.replace(' ', 'T') + 'Z'}>{new Date(review.createdAt.replace(' ', 'T') + 'Z').toLocaleDateString(spanish ? 'es' : 'en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' })}</time></footer>
				</article>
			{/each}
		</div>
		<div id="write-review">
			<h3>{text('Write a review', 'Escribir una opinión')}</h3>
			{#if form?.reviewSent}
				<p role="status" class="notice">{text('Thank you! Your review has been submitted and will appear after approval.', '¡Gracias! Tu opinión se ha enviado y aparecerá después de su aprobación.')}</p>
			{:else}
				<form method="POST" action="?/review" use:enhance={() => {
					sending = true;
					return async ({ update }) => { try { await update(); } finally { sending = false; } };
				}}>
					<label>{text('Display name', 'Nombre público')}<input name="author" required minlength="2" maxlength="80" autocomplete="nickname" value={form?.reviewValues?.author ?? ''} /></label>
					<label>{text('Rating', 'Valoración')}<select name="rating" required value={String(form?.reviewValues?.rating || '')}>
						<option value="" disabled>{text('Choose a rating', 'Elige una valoración')}</option>
						{#each [5, 4, 3, 2, 1] as stars}<option value={stars}>{stars} / 5</option>{/each}
					</select></label>
					<label>{text('Your review', 'Tu opinión')}<textarea name="body" required minlength="10" maxlength="3000" rows="5">{form?.reviewValues?.body ?? ''}</textarea></label>
					<div class="honeypot" aria-hidden="true"><label>Website<input name="website" tabindex="-1" autocomplete="off" /></label></div>
					<p class="fine">{text('Your display name and review will be public after approval. Please leave out personal contact details.', 'Tu nombre público y tu opinión aparecerán tras su aprobación. No incluyas datos personales de contacto.')}</p>
					{#if form?.reviewError}<p role="alert" class="error">{form.reviewError}</p>{/if}
					<button disabled={sending}>{sending ? text('Submitting…', 'Enviando…') : text('Submit review', 'Enviar opinión')}</button>
				</form>
			{/if}
		</div>
	</div>
</section>

<style>
	.customer-reviews { max-width: 1176px; margin: auto; padding: 56px 24px; color: var(--tree-ink, #243b31); font-family: var(--font-sans, inherit); scroll-margin-top: 24px; }
	.reviews-heading { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 20px; align-items: center; padding-bottom: 28px; border-bottom: 1px solid #c7cec2; }
	h2 { font-size: clamp(26px, 4vw, 36px); font-weight: 600; margin: 4px 0 12px; }
	h3 { font-size: 23px; margin-bottom: 20px; font-weight: 600; }
	.eyebrow { text-transform: uppercase; font-size: 12px; letter-spacing: 1.5px; }
	a { color: var(--tree-green, #285b43); text-underline-offset: 4px; min-height: 44px; display: inline-flex; align-items: center; }
	.reviews-content { display: grid; gap: 36px; padding-top: 32px; }
	.review-list:empty { display: none; }
	article { padding: 0 0 24px; margin-bottom: 24px; border-bottom: 1px solid #c7cec2; }
	.stars { color: var(--tree-green, #285b43); font-size: 21px; letter-spacing: 2px; }
	.review-body { margin: 12px 0; white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.7; }
	footer { font-size: 13px; color: #637168; }
	form { display: grid; gap: 16px; }
	label { display: grid; gap: 7px; font-size: 14px; font-weight: 600; }
	input, select, textarea { box-sizing: border-box; width: 100%; border: 1px solid #a7b5a9; border-radius: 8px; padding: 12px; font: inherit; font-size: 16px; background: #fffdf9; }
	input:focus-visible, select:focus-visible, textarea:focus-visible, button:focus-visible { outline: 3px solid #a7b5a9; outline-offset: 3px; }
	button { min-height: 48px; padding: 12px 24px; border-radius: 24px; background: var(--tree-green, #285b43); color: white; font: inherit; font-weight: 600; cursor: pointer; border: 0; }
	button:disabled { opacity: 0.6; cursor: wait; }
	.fine { font-size: 12px; line-height: 1.6; color: #637168; }
	.notice { background: #edf2eb; border-radius: 10px; padding: 20px; line-height: 1.7; }
	.error { color: #a32938; }
	.honeypot { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
	@media (min-width: 768px) { .reviews-content:has(.review-list article) { grid-template-columns: 1fr 1fr; gap: 64px; } }
</style>
