<script lang="ts">
	import { enhance } from '$app/forms';
	let { data, form } = $props();
</script>

<svelte:head><title>Reviews · Admin</title><meta name="robots" content="noindex, nofollow" /></svelte:head>
<main>
	<a href="/admin">← Orders</a>
	<h1>Customer reviews</h1>
	<p>Publish genuine customer feedback regardless of star rating. Hide spam, personal information or abusive content.</p>
	<nav aria-label="Review status">
		<a href="/admin/reviews" aria-current={data.status === 'pending' ? 'page' : undefined}>Awaiting approval</a>
		<a href="/admin/reviews?status=published" aria-current={data.status === 'published' ? 'page' : undefined}>Published</a>
		<a href="/admin/reviews?status=hidden" aria-current={data.status === 'hidden' ? 'page' : undefined}>Hidden</a>
	</nav>
	{#if form?.error}<p role="alert">{form.error}</p>{/if}
	{#if !data.reviews.length}<p>No reviews in this view.</p>{/if}
	{#each data.reviews as review (review.id)}
		<article>
			<p><a href={`/products/${review.productSlug}#customer-reviews`}>{review.productSlug}</a> · {review.createdAt} UTC</p>
			<h2>{review.author} · {review.rating} / 5</h2>
			<p class="body">{review.body}</p>
			<form method="POST" use:enhance>
				<input type="hidden" name="id" value={review.id} />
				{#if review.status !== 'published'}<button name="status" value="published">Publish review</button>{/if}
				{#if review.status !== 'hidden'}<button name="status" value="hidden" class="secondary">Hide review</button>{/if}
				{#if review.status !== 'pending'}<button name="status" value="pending" class="secondary">Return to approval queue</button>{/if}
			</form>
		</article>
	{/each}
</main>
<style>
	main { max-width: 1000px; margin: auto; padding: 32px 24px; font-family: system-ui, sans-serif; }
	h1 { font-size: 32px; margin: 24px 0 12px; font-weight: 700; }
	h2 { font-size: 20px; margin: 12px 0; font-weight: 600; }
	nav, form { display: flex; flex-wrap: wrap; gap: 12px; margin: 24px 0; }
	a { color: #285b43; text-decoration: underline; text-underline-offset: 4px; }
	nav a { padding: 12px; border-radius: 8px; }
	[aria-current] { background: #edf2eb; font-weight: 700; }
	article { border: 1px solid #c7cec2; border-radius: 12px; padding: 24px; margin: 24px 0; }
	.body { white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.7; }
	button { padding: 12px 18px; border-radius: 8px; background: #285b43; color: white; border: 1px solid #285b43; font: inherit; cursor: pointer; }
	.secondary { background: white; color: #285b43; }
</style>
