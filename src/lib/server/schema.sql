-- Commerce data only. Anything a customer reads (names, marketing copy, FAQ,
-- colour labels) lives in the language packs under src/lib/i18n/locales and is
-- joined by `slug` / colour `code`, so adding a language never touches the DB.

create table if not exists products (
	id integer primary key autoincrement,
	slug text not null unique,
	price_cents integer not null,
	compare_at_cents integer,
	currency text not null default 'USD',
	active integer not null default 1,
	created_at text not null default (datetime('now'))
);

create table if not exists product_colours (
	id integer primary key autoincrement,
	product_id integer not null references products (id) on delete cascade,
	code text not null,
	hex text not null,
	position integer not null default 0,
	unique (product_id, code)
);

create table if not exists product_variants (
	id integer primary key autoincrement,
	product_id integer not null references products (id) on delete cascade,
	colour text not null,
	size text not null,
	sku text not null unique,
	stock integer not null default 0,
	unique (product_id, colour, size)
);

create table if not exists size_chart (
	id integer primary key autoincrement,
	product_id integer not null references products (id) on delete cascade,
	size text not null,
	chest_min_cm integer not null,
	chest_max_cm integer not null,
	weight_min_kg real not null,
	weight_max_kg real not null,
	position integer not null default 0,
	unique (product_id, size)
);

create table if not exists orders (
	id integer primary key autoincrement,
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
	order_id integer not null references orders (id) on delete cascade,
	variant_id integer not null references product_variants (id),
	product_slug text not null,
	colour text not null,
	size text not null,
	sku text not null,
	unit_price_cents integer not null,
	quantity integer not null
);

create index if not exists idx_variants_product on product_variants (product_id);
create index if not exists idx_colours_product on product_colours (product_id);
create index if not exists idx_order_items_order on order_items (order_id);
create index if not exists idx_orders_email on orders (email);
