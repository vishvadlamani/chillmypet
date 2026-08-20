import type { PageComponentMap } from '@funnel/core/svelte';
import Accordion from './Accordion.svelte';
import AnnouncementBar from './AnnouncementBar.svelte';
import BulletList from './BulletList.svelte';
import Bundles from './Bundles.svelte';
import ContactForm from './ContactForm.svelte';
import Countdown from './Countdown.svelte';
import Divider from './Divider.svelte';
import GeoOffer from './GeoOffer.svelte';
import Guarantee from './Guarantee.svelte';
import Heading from './Heading.svelte';
import LiveActivity from './LiveActivity.svelte';
import Media from './Media.svelte';
import PressFeature from './PressFeature.svelte';
import PromoApplied from './PromoApplied.svelte';
import RatingSummary from './RatingSummary.svelte';
import ReservedSpot from './ReservedSpot.svelte';
import Reviews from './Reviews.svelte';
import ScarcityBar from './ScarcityBar.svelte';
import SecurityBadges from './SecurityBadges.svelte';
import ShippingForm from './ShippingForm.svelte';
import ShippingMethod from './ShippingMethod.svelte';
import SocialProof from './SocialProof.svelte';
import StickyBuyBar from './StickyBuyBar.svelte';
import PaymentBadges from './PaymentBadges.svelte';
import StockProgress from './StockProgress.svelte';
import Testimonial from './Testimonial.svelte';

/**
 * Shared DR block library.
 *
 * Portable by construction: no block here imports app state, app components, or
 * app logic — only `@funnel/core` types, the `fx-*` palette and the token
 * scale. Lifts to `packages/blocks-dr` as a workspace package.
 *
 * Compose with a host's own blocks; the host's keys win on collision:
 *
 *   const BLOCKS = { ...DR_BLOCKS, ...MY_BLOCKS };
 *
 * Keys are snake_case — manifests are JSON, and it's what a model generating one
 * produces most consistently.
 */
export const DR_BLOCKS: PageComponentMap = {
	accordion: { render: Accordion },
	announcement_bar: { render: AnnouncementBar },
	bullet_list: { render: BulletList },
	bundles: { render: Bundles },
	contact_form: { render: ContactForm },
	countdown: { render: Countdown },
	divider: { render: Divider },
	geo_offer: { render: GeoOffer },
	guarantee: { render: Guarantee },
	heading: { render: Heading },
	live_activity: { render: LiveActivity },
	media: { render: Media },
	rating_summary: { render: RatingSummary },
	reserved_spot: { render: ReservedSpot },
	reviews: { render: Reviews },
	payment_badges: { render: PaymentBadges },
	press_feature: { render: PressFeature },
	promo_applied: { render: PromoApplied },
	scarcity_bar: { render: ScarcityBar },
	security_badges: { render: SecurityBadges },
	shipping_form: { render: ShippingForm },
	shipping_method: { render: ShippingMethod },
	social_proof: { render: SocialProof },
	sticky_buy_bar: { render: StickyBuyBar },
	stock_progress: { render: StockProgress },
	testimonial: { render: Testimonial }
};
