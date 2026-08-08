/**
 * Store-agnostic commerce domain.
 *
 * Every module is exposed as an interface (`CatalogService`, `CustomerService`,
 * `OrderService`, `StoreService`, `MetaService`) with a local, in-process
 * implementation. Callers depend on the interface, never the implementation, so
 * moving a module into its own Worker later means writing a second
 * implementation that forwards over a Service Binding and swapping it in at
 * this composition point — no call site changes.
 *
 * Nothing here imports a framework or reads `process.env`: configuration is
 * injected, because the storefront Worker and a standalone module Worker read
 * their environment differently.
 */
import { createCatalogService, type CatalogService } from './catalog/index.ts';
import { createCustomerService, type CustomerService } from './customers/index.ts';
import { createDb, type Client, type DatabaseConfig } from './db/index.ts';
import { createMetaService, type MetaConfig, type MetaService } from './meta/index.ts';
import { createOrderService, type OrderService } from './orders/index.ts';
import { createStoreService, type Store, type StoreService } from './stores/index.ts';

export type { Client, DatabaseConfig } from './db/index.ts';
export type { Store, StoreService } from './stores/index.ts';
export type { CatalogService, Product, PricedVariant } from './catalog/index.ts';
export type { CustomerService, Customer } from './customers/index.ts';
export type { OrderService, PlacedOrder, CreateOrderInput } from './orders/index.ts';
export { CheckoutError, type CheckoutErrorCode } from './orders/index.ts';
export { SHIPPING_RATES, isShippingMethod, type ShippingMethod } from './shipping.ts';
export {
	createMetaService,
	newEventId,
	toAmount,
	type MetaConfig,
	type MetaService
} from './meta/index.ts';
export { createDb, createStoreService };

export type Commerce = {
	db: Client;
	store: Store;
	catalog: CatalogService;
	customers: CustomerService;
	orders: OrderService;
	/** Null when the store has no pixel configured. */
	meta: MetaService | null;
};

/**
 * Resolves which tenant a request belongs to. Called before `createCommerce`,
 * since the store id is what scopes every other module.
 */
export function createDirectory(config: DatabaseConfig): {
	db: Client;
	stores: StoreService;
} {
	const db = createDb(config);
	return { db, stores: createStoreService(db) };
}

export function createCommerce(deps: {
	db: Client;
	store: Store;
	meta?: Omit<MetaConfig, 'pixelId'>;
}): Commerce {
	const { db, store } = deps;
	const storeId = store.id;

	const catalog = createCatalogService({ db, storeId });
	const customers = createCustomerService({ db, storeId });
	const orders = createOrderService({ db, storeId, catalog, customers });

	const meta = store.metaPixelId
		? createMetaService({ ...deps.meta, pixelId: store.metaPixelId })
		: null;

	return { db, store, catalog, customers, orders, meta };
}
