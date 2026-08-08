-- Multi-tenant from the start. `store_id` is denormalized onto every table so
-- each query can filter by tenant without a join, and so a module lifted into
-- its own Worker never needs a cross-table lookup to scope its reads.
--
-- Customer-facing text (names, marketing copy, colour labels) is NOT here — it
-- lives in the storefront's language packs, keyed by slug and colour code.

create table if not exists stores (
	id text primary key,
	domain text not null unique,
	name text not null,
	default_locale text not null default 'en',
	currency text not null default 'USD',
	meta_pixel_id text,
	meta_domain_verification text,
	active integer not null default 1,
	created_at text not null default (datetime('now'))
);

create table if not exists products (
	id integer primary key autoincrement,
	store_id text not null references stores (id) on delete cascade,
	slug text not null,
	price_cents integer not null,
	compare_at_cents integer,
	currency text not null default 'USD',
	active integer not null default 1,
	created_at text not null default (datetime('now')),
	unique (store_id, slug)
);

create table if not exists product_colours (
	id integer primary key autoincrement,
	store_id text not null references stores (id) on delete cascade,
	product_id integer not null references products (id) on delete cascade,
	code text not null,
	hex text not null,
	position integer not null default 0,
	unique (product_id, code)
);

create table if not exists product_variants (
	id integer primary key autoincrement,
	store_id text not null references stores (id) on delete cascade,
	product_id integer not null references products (id) on delete cascade,
	colour text not null,
	size text not null,
	sku text not null,
	stock integer not null default 0,
	unique (store_id, sku),
	unique (product_id, colour, size)
);

create table if not exists size_chart (
	id integer primary key autoincrement,
	store_id text not null references stores (id) on delete cascade,
	product_id integer not null references products (id) on delete cascade,
	size text not null,
	chest_min_cm integer not null,
	chest_max_cm integer not null,
	weight_min_kg real not null,
	weight_max_kg real not null,
	position integer not null default 0,
	unique (product_id, size)
);

create table if not exists customers (
	id integer primary key autoincrement,
	store_id text not null references stores (id) on delete cascade,
	email text not null,
	first_name text,
	last_name text,
	phone text,
	marketing_consent integer not null default 0,
	orders_count integer not null default 0,
	total_spent_cents integer not null default 0,
	created_at text not null default (datetime('now')),
	updated_at text not null default (datetime('now')),
	unique (store_id, email)
);

create table if not exists orders (
	id integer primary key autoincrement,
	store_id text not null references stores (id) on delete cascade,
	customer_id integer references customers (id) on delete set null,
	order_number text not null unique,
	email text not null,
	phone text,
	first_name text not null,
	last_name text not null,
	address1 text not null,
	address2 text,
	city text not null,
	province text,
	postal_code text not null,
	country text not null,
	shipping_method text not null,
	subtotal_cents integer not null,
	shipping_cents integer not null,
	discount_cents integer not null default 0,
	total_cents integer not null,
	currency text not null default 'USD',
	locale text not null default 'en',
	status text not null default 'pending_payment',
	created_at text not null default (datetime('now'))
);

create table if not exists order_items (
	id integer primary key autoincrement,
	store_id text not null references stores (id) on delete cascade,
	order_id integer not null references orders (id) on delete cascade,
	variant_id integer not null references product_variants (id),
	product_slug text not null,
	colour text not null,
	size text not null,
	sku text not null,
	unit_price_cents integer not null,
	quantity integer not null
);

create index if not exists idx_products_store on products (store_id, slug);
create index if not exists idx_variants_product on product_variants (product_id);
create index if not exists idx_colours_product on product_colours (product_id);
create index if not exists idx_customers_store_email on customers (store_id, email);
create index if not exists idx_orders_store_created on orders (store_id, created_at);
create index if not exists idx_orders_customer on orders (customer_id);
create index if not exists idx_order_items_order on order_items (order_id);
