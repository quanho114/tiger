-- ==============================================================================
-- TIGER 345 - MIGRATION 000001: CORE DATABASE SCHEMA
-- Generated for Task T02 according to plans/tiger-345/03-database.md
-- ==============================================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Common trigger function for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ------------------------------------------------------------------------------
-- 1. ADMIN PROFILES
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin_profiles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
    display_name text NOT NULL CHECK (char_length(trim(display_name)) >= 2 AND char_length(display_name) <= 100),
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_admin_profiles_updated_at
    BEFORE UPDATE ON admin_profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ------------------------------------------------------------------------------
-- 2. CATEGORIES
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS categories (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL CHECK (char_length(trim(name)) >= 2 AND char_length(name) <= 100),
    slug text UNIQUE NOT NULL CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(slug) <= 100),
    sort_order int NOT NULL DEFAULT 0,
    active boolean NOT NULL DEFAULT true,
    version int NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_categories_updated_at
    BEFORE UPDATE ON categories
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ------------------------------------------------------------------------------
-- 3. MENU ITEMS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS menu_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id uuid NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
    name text NOT NULL CHECK (char_length(trim(name)) >= 2 AND char_length(name) <= 120),
    slug text UNIQUE NOT NULL CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(slug) <= 120),
    description text NOT NULL DEFAULT '',
    price_vnd bigint NOT NULL CHECK (price_vnd >= 0 AND price_vnd <= 1000000000),
    image_path text NULL,
    published boolean NOT NULL DEFAULT true,
    available boolean NOT NULL DEFAULT true,
    allow_dine_in boolean NOT NULL DEFAULT true,
    allow_delivery boolean NOT NULL DEFAULT true,
    featured_rank int NULL,
    tags text[] NOT NULL DEFAULT '{}',
    serving_size text NULL,
    pairing_note text NULL,
    delivery_eta text NULL,
    spice_level int NULL CHECK (spice_level IS NULL OR spice_level BETWEEN 0 AND 2),
    is_signature boolean NOT NULL DEFAULT false,
    is_bestseller boolean NOT NULL DEFAULT false,
    is_new boolean NOT NULL DEFAULT false,
    version int NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT chk_menu_items_at_least_one_mode CHECK (allow_dine_in = true OR allow_delivery = true)
);

CREATE INDEX idx_menu_items_category_lookup ON menu_items (category_id, published, available);

CREATE TRIGGER trg_menu_items_updated_at
    BEFORE UPDATE ON menu_items
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ------------------------------------------------------------------------------
-- 4. SEATING AREAS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS seating_areas (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code text UNIQUE NOT NULL CHECK (char_length(trim(code)) >= 1 AND char_length(code) <= 50),
    name text NOT NULL CHECK (char_length(trim(name)) >= 2 AND char_length(name) <= 100),
    active boolean NOT NULL DEFAULT true,
    sort_order int NOT NULL DEFAULT 0,
    version int NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_seating_areas_updated_at
    BEFORE UPDATE ON seating_areas
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ------------------------------------------------------------------------------
-- 5. DINING TABLES
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dining_tables (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code text UNIQUE NOT NULL CHECK (char_length(trim(code)) >= 1 AND char_length(code) <= 50),
    name text NOT NULL CHECK (char_length(trim(name)) >= 1 AND char_length(name) <= 100),
    active boolean NOT NULL DEFAULT true,
    sort_order int NOT NULL DEFAULT 0,
    seating_area_id uuid NULL REFERENCES seating_areas(id) ON DELETE SET NULL,
    version int NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_dining_tables_updated_at
    BEFORE UPDATE ON dining_tables
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ------------------------------------------------------------------------------
-- 6. TABLE QR TOKENS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS table_qr_tokens (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    table_id uuid NOT NULL REFERENCES dining_tables(id) ON DELETE CASCADE,
    token_hash text UNIQUE NOT NULL,
    active boolean NOT NULL DEFAULT true,
    rotated_at timestamptz NULL,
    revoked_at timestamptz NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_table_qr_tokens_active_unique ON table_qr_tokens (table_id) WHERE active = true;

-- ------------------------------------------------------------------------------
-- 7. TABLE VISITS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS table_visits (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    table_id uuid NOT NULL REFERENCES dining_tables(id) ON DELETE RESTRICT,
    status text NOT NULL CHECK (status IN ('open', 'closed')),
    capability_epoch int NOT NULL DEFAULT 1,
    opened_by_admin_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
    opened_at timestamptz NOT NULL DEFAULT now(),
    closed_at timestamptz NULL,
    version int NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_table_visits_id_table UNIQUE (id, table_id),
    CONSTRAINT chk_table_visits_status_closure CHECK (
        (status = 'open' AND closed_at IS NULL) OR
        (status = 'closed' AND closed_at IS NOT NULL)
    )
);

CREATE UNIQUE INDEX idx_table_visits_single_open ON table_visits (table_id) WHERE status = 'open';

CREATE TRIGGER trg_table_visits_updated_at
    BEFORE UPDATE ON table_visits
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ------------------------------------------------------------------------------
-- 8. DELIVERY ZONES
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS delivery_zones (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL CHECK (char_length(trim(name)) >= 2 AND char_length(name) <= 100),
    description text NOT NULL DEFAULT '',
    fee_vnd bigint NOT NULL CHECK (fee_vnd >= 0 AND fee_vnd <= 1000000000),
    free_threshold_vnd bigint NULL CHECK (free_threshold_vnd IS NULL OR (free_threshold_vnd >= 0 AND free_threshold_vnd <= 1000000000)),
    active boolean NOT NULL DEFAULT true,
    sort_order int NOT NULL DEFAULT 0,
    version int NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_delivery_zones_updated_at
    BEFORE UPDATE ON delivery_zones
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ------------------------------------------------------------------------------
-- 9. RESTAURANT SETTINGS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS restaurant_settings (
    id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    name text NOT NULL CHECK (char_length(trim(name)) >= 2),
    phone text NOT NULL CHECK (char_length(trim(phone)) >= 9),
    zalo text NOT NULL DEFAULT '',
    facebook text NOT NULL DEFAULT '',
    maps_url text NOT NULL DEFAULT '',
    address text NOT NULL CHECK (char_length(trim(address)) >= 5),
    timezone text NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
    accepting_orders boolean NOT NULL DEFAULT true,
    accepting_dine_in_orders boolean NOT NULL DEFAULT true,
    accepting_delivery_orders boolean NOT NULL DEFAULT true,
    booking_enabled boolean NOT NULL DEFAULT true,
    min_delivery_order_vnd bigint NOT NULL DEFAULT 0 CHECK (min_delivery_order_vnd >= 0 AND min_delivery_order_vnd <= 1000000000),
    reservation_min_notice_minutes int NOT NULL DEFAULT 30 CHECK (reservation_min_notice_minutes >= 0),
    reservation_max_days_ahead int NOT NULL DEFAULT 30 CHECK (reservation_max_days_ahead >= 1),
    reservation_duration_minutes int NOT NULL DEFAULT 120 CHECK (reservation_duration_minutes >= 30),
    reservation_cancel_notice_minutes int NOT NULL DEFAULT 60 CHECK (reservation_cancel_notice_minutes >= 0),
    reservation_no_show_grace_minutes int NOT NULL DEFAULT 15 CHECK (reservation_no_show_grace_minutes >= 0),
    version int NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_restaurant_settings_updated_at
    BEFORE UPDATE ON restaurant_settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ------------------------------------------------------------------------------
-- 10. BUSINESS HOURS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS business_hours (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    weekday int NOT NULL CHECK (weekday BETWEEN 0 AND 6),
    service_type text NOT NULL CHECK (service_type IN ('restaurant', 'delivery', 'reservation')),
    open_time time NOT NULL,
    close_time time NOT NULL,
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT chk_business_hours_open_before_close CHECK (open_time < close_time)
);

-- ------------------------------------------------------------------------------
-- 11. BUSINESS CLOSURES
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS business_closures (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    date date NOT NULL,
    service_type text NOT NULL CHECK (service_type IN ('restaurant', 'delivery', 'reservation', 'all')),
    reason text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_business_closures_date_service UNIQUE (date, service_type)
);

-- ------------------------------------------------------------------------------
-- 12. ORDERS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS orders (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code text UNIQUE NOT NULL CHECK (char_length(trim(code)) >= 4 AND char_length(code) <= 30),
    customer_user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
    order_type text NOT NULL CHECK (order_type IN ('dine_in', 'delivery')),
    status text NOT NULL CHECK (status IN ('pending', 'confirmed', 'preparing', 'served', 'delivering', 'completed', 'cancelled')),
    table_id uuid NULL REFERENCES dining_tables(id) ON DELETE RESTRICT,
    table_visit_id uuid NULL,
    table_name_snapshot text NULL,
    customer_name text NULL,
    customer_phone text NULL,
    delivery_zone_id uuid NULL REFERENCES delivery_zones(id) ON DELETE RESTRICT,
    address_snapshot text NULL,
    zone_name_snapshot text NULL,
    subtotal_vnd bigint NOT NULL CHECK (subtotal_vnd >= 0 AND subtotal_vnd <= 1000000000),
    shipping_fee_vnd bigint NOT NULL DEFAULT 0 CHECK (shipping_fee_vnd >= 0 AND shipping_fee_vnd <= 1000000000),
    total_vnd bigint NOT NULL CHECK (total_vnd >= 0 AND total_vnd <= 1000000000),
    note text NOT NULL DEFAULT '',
    internal_note text NOT NULL DEFAULT '',
    payment_status text NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'paid', 'refunded')),
    payment_method text NULL CHECK (payment_method IS NULL OR payment_method IN ('cash', 'bank_transfer')),
    paid_at timestamptz NULL,
    confirmed_at timestamptz NULL,
    completed_at timestamptz NULL,
    cancelled_at timestamptz NULL,
    version int NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    -- Composite FK ensuring order's table_visit matches the exact table
    CONSTRAINT fk_orders_table_visit FOREIGN KEY (table_visit_id, table_id)
        REFERENCES table_visits(id, table_id) ON DELETE RESTRICT,

    -- Total integrity
    CONSTRAINT chk_orders_total_sum CHECK (total_vnd = subtotal_vnd + shipping_fee_vnd),

    -- Dine-in context validation
    CONSTRAINT chk_orders_dine_in_context CHECK (
        order_type != 'dine_in' OR (
            table_id IS NOT NULL AND
            table_visit_id IS NOT NULL AND
            table_name_snapshot IS NOT NULL AND
            customer_name IS NULL AND
            customer_phone IS NULL AND
            delivery_zone_id IS NULL AND
            address_snapshot IS NULL AND
            zone_name_snapshot IS NULL AND
            shipping_fee_vnd = 0
        )
    ),

    -- Delivery context validation
    CONSTRAINT chk_orders_delivery_context CHECK (
        order_type != 'delivery' OR (
            table_id IS NULL AND
            table_visit_id IS NULL AND
            table_name_snapshot IS NULL AND
            customer_name IS NOT NULL AND char_length(trim(customer_name)) >= 2 AND
            customer_phone IS NOT NULL AND char_length(trim(customer_phone)) >= 9 AND
            address_snapshot IS NOT NULL AND char_length(trim(address_snapshot)) >= 5 AND
            delivery_zone_id IS NOT NULL AND
            zone_name_snapshot IS NOT NULL
        )
    ),

    -- Status restrictions by type
    CONSTRAINT chk_orders_no_delivering_for_dine_in CHECK (NOT (order_type = 'dine_in' AND status = 'delivering')),
    CONSTRAINT chk_orders_no_served_for_delivery CHECK (NOT (order_type = 'delivery' AND status = 'served'))
);

CREATE INDEX idx_orders_status_created ON orders (status, created_at DESC, id);
CREATE INDEX idx_orders_type_status_created ON orders (order_type, status, created_at DESC, id);
CREATE INDEX idx_orders_table_visit ON orders (table_visit_id, created_at);
CREATE INDEX idx_orders_customer_created ON orders (customer_user_id, created_at DESC, id);

CREATE TRIGGER trg_orders_updated_at
    BEFORE UPDATE ON orders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ------------------------------------------------------------------------------
-- 13. ORDER ITEMS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS order_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    menu_item_id uuid NULL REFERENCES menu_items(id) ON DELETE SET NULL,
    item_name text NOT NULL CHECK (char_length(trim(item_name)) >= 1),
    unit_price_vnd bigint NOT NULL CHECK (unit_price_vnd >= 0 AND unit_price_vnd <= 1000000000),
    quantity int NOT NULL CHECK (quantity BETWEEN 1 AND 99),
    line_total_vnd bigint NOT NULL CHECK (line_total_vnd >= 0 AND line_total_vnd <= 1000000000),
    note text NOT NULL DEFAULT '',
    position int NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT chk_order_items_line_total CHECK (line_total_vnd = unit_price_vnd * quantity)
);

CREATE INDEX idx_order_items_order_id ON order_items (order_id);

-- ------------------------------------------------------------------------------
-- 14. ORDER STATUS HISTORY
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS order_status_history (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    from_status text NULL CHECK (from_status IS NULL OR from_status IN ('pending', 'confirmed', 'preparing', 'served', 'delivering', 'completed', 'cancelled')),
    to_status text NOT NULL CHECK (to_status IN ('pending', 'confirmed', 'preparing', 'served', 'delivering', 'completed', 'cancelled')),
    actor_admin_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
    reason text NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_order_status_history_order ON order_status_history (order_id, created_at, id);

-- ------------------------------------------------------------------------------
-- 15. ORDER PAYMENT EVENTS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS order_payment_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    event text NOT NULL CHECK (event IN ('paid', 'refunded', 'corrected')),
    amount_vnd bigint NOT NULL CHECK (amount_vnd >= 0 AND amount_vnd <= 1000000000),
    method text NOT NULL CHECK (method IN ('cash', 'bank_transfer')),
    actor_admin_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
    reason text NULL,
    batch_id uuid NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_order_payment_events_order ON order_payment_events (order_id, created_at);

-- ------------------------------------------------------------------------------
-- 16. RESERVATIONS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reservations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code text UNIQUE NOT NULL CHECK (char_length(trim(code)) >= 4 AND char_length(code) <= 30),
    customer_user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
    customer_name text NOT NULL CHECK (char_length(trim(customer_name)) >= 2),
    customer_phone text NOT NULL CHECK (char_length(trim(customer_phone)) >= 9),
    starts_at timestamptz NOT NULL,
    ends_at timestamptz NOT NULL,
    guest_count int NOT NULL CHECK (guest_count BETWEEN 1 AND 30),
    seating_area_id uuid NULL REFERENCES seating_areas(id) ON DELETE SET NULL,
    area_name_snapshot text NULL,
    status text NOT NULL CHECK (status IN ('pending', 'confirmed', 'cancelled', 'completed', 'no_show')),
    note text NOT NULL DEFAULT '',
    internal_note text NOT NULL DEFAULT '',
    contact_outcome text NULL,
    contacted_at timestamptz NULL,
    version int NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT chk_reservations_time_order CHECK (ends_at > starts_at)
);

CREATE INDEX idx_reservations_status_starts ON reservations (status, starts_at, id);
CREATE INDEX idx_reservations_customer_starts ON reservations (customer_user_id, starts_at DESC, id);

CREATE TRIGGER trg_reservations_updated_at
    BEFORE UPDATE ON reservations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ------------------------------------------------------------------------------
-- 17. AUDIT LOGS (Append-only)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
    actor_kind text NOT NULL CHECK (actor_kind IN ('system', 'admin', 'customer')),
    action text NOT NULL CHECK (char_length(trim(action)) >= 1),
    entity_type text NOT NULL CHECK (char_length(trim(entity_type)) >= 1),
    entity_id text NOT NULL,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_logs_entity ON audit_logs (entity_type, entity_id, created_at DESC);

-- ------------------------------------------------------------------------------
-- 18. IDEMPOTENCY REQUESTS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS idempotency_requests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    operation text NOT NULL,
    key_hash text NOT NULL,
    actor_scope text NOT NULL,
    request_hash text NOT NULL,
    result_id uuid NULL,
    response_json jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    CONSTRAINT uq_idempotency_requests_op_key UNIQUE (operation, key_hash)
);

CREATE INDEX idx_idempotency_requests_expires ON idempotency_requests (expires_at);

-- ------------------------------------------------------------------------------
-- DEFAULT RLS POLICY: DENY ALL DIRECT ACCESS
-- Core tables deny direct writes from anon and authenticated from migration 1
-- ------------------------------------------------------------------------------
ALTER TABLE admin_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE seating_areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE dining_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE table_qr_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE table_visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE restaurant_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_closures ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_payment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE idempotency_requests ENABLE ROW LEVEL SECURITY;

-- Revoke all direct write permissions from public roles
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON admin_profiles FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON categories FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON menu_items FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON seating_areas FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON dining_tables FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON table_qr_tokens FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON table_visits FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON delivery_zones FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON restaurant_settings FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON business_hours FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON business_closures FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON orders FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON order_items FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON order_status_history FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON order_payment_events FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON reservations FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON audit_logs FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON idempotency_requests FROM anon, authenticated;
