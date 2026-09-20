-- ==============================================================================
-- TIGER 345 - MIGRATION 000002: CUSTOMER IDENTITY, OWNERSHIP & DATABASE POLICIES
-- Generated for Task T03 according to plans/tiger-345/03-database.md
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. CUSTOMER PROFILES
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS customer_profiles (
    user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    display_name text NOT NULL CHECK (char_length(trim(display_name)) >= 1 AND char_length(display_name) <= 100),
    phone text NULL CHECK (phone IS NULL OR char_length(trim(phone)) >= 9),
    avatar_url text NULL,
    marketing_opt_in boolean NOT NULL DEFAULT false,
    last_seen_at timestamptz NULL,
    deletion_requested_at timestamptz NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_customer_profiles_updated_at
    BEFORE UPDATE ON customer_profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ------------------------------------------------------------------------------
-- 2. CUSTOMER ADDRESSES
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS customer_addresses (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    label text NOT NULL CHECK (char_length(trim(label)) >= 1 AND char_length(label) <= 50),
    recipient_name text NOT NULL CHECK (char_length(trim(recipient_name)) >= 2 AND char_length(recipient_name) <= 100),
    phone text NOT NULL CHECK (char_length(trim(phone)) >= 9 AND char_length(phone) <= 20),
    address_line text NOT NULL CHECK (char_length(trim(address_line)) >= 5 AND char_length(address_line) <= 255),
    ward text NULL,
    district text NULL,
    province text NULL,
    delivery_note text NOT NULL DEFAULT '',
    is_default boolean NOT NULL DEFAULT false,
    version int NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Ensure at most one default address per customer
CREATE UNIQUE INDEX idx_customer_addresses_default_unique
    ON customer_addresses (user_id)
    WHERE is_default = true;

CREATE INDEX idx_customer_addresses_user_created
    ON customer_addresses (user_id, created_at DESC);

CREATE TRIGGER trg_customer_addresses_updated_at
    BEFORE UPDATE ON customer_addresses
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ------------------------------------------------------------------------------
-- 3. CUSTOMER FAVORITES
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS customer_favorites (
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    menu_item_id uuid NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, menu_item_id)
);

CREATE INDEX idx_customer_favorites_user_created
    ON customer_favorites (user_id, created_at DESC);

-- ------------------------------------------------------------------------------
-- 4. GUEST ORDER CLAIMS (Server-only, for T18 guest claim flow)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS guest_order_claims (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id uuid UNIQUE NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    secret_hash text NOT NULL,
    expires_at timestamptz NOT NULL,
    consumed_at timestamptz NULL,
    claimed_by_user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_guest_order_claims_expires ON guest_order_claims (expires_at);

-- ------------------------------------------------------------------------------
-- 5. RATE LIMIT BUCKETS (Server-only, for T04 API rate limiting)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rate_limit_buckets (
    bucket_hash text NOT NULL,
    window_start timestamptz NOT NULL,
    count int NOT NULL DEFAULT 1,
    expires_at timestamptz NOT NULL,
    PRIMARY KEY (bucket_hash, window_start)
);

CREATE INDEX idx_rate_limit_buckets_expires ON rate_limit_buckets (expires_at);

-- ------------------------------------------------------------------------------
-- 6. ACCOUNT DELETION JOBS (Server-only, for T19 account deletion & retention)
-- Does NOT have an ON DELETE CASCADE on auth.users so the job persists after user deletion
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS account_deletion_jobs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid UNIQUE NOT NULL,
    status text NOT NULL CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    step text NOT NULL DEFAULT 'requested',
    requested_at timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz NULL,
    last_error_code text NULL,
    retry_count int NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_account_deletion_jobs_updated_at
    BEFORE UPDATE ON account_deletion_jobs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ------------------------------------------------------------------------------
-- 7. SAFE AUTH SIGNUP TRIGGER
-- Automatically and idempotently provisions customer_profiles on auth.users insert.
-- SECURITY GUARANTEE: NEVER grants admin rights or touches admin_profiles!
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.customer_profiles (
        user_id,
        display_name,
        phone,
        avatar_url,
        marketing_opt_in
    ) VALUES (
        NEW.id,
        COALESCE(
            NULLIF(trim(NEW.raw_user_meta_data->>'full_name'), ''),
            NULLIF(trim(NEW.raw_user_meta_data->>'name'), ''),
            NULLIF(trim(split_part(NEW.email, '@', 1)), ''),
            'Khách hàng'
        ),
        NULLIF(trim(NEW.phone), ''),
        NULLIF(trim(NEW.raw_user_meta_data->>'avatar_url'), ''),
        false
    )
    ON CONFLICT (user_id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Bind trigger to auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ------------------------------------------------------------------------------
-- 8. ROW LEVEL SECURITY (RLS) POLICIES
-- ------------------------------------------------------------------------------

-- Enable RLS on new tables
ALTER TABLE customer_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE guest_order_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limit_buckets ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_deletion_jobs ENABLE ROW LEVEL SECURITY;

-- Revoke all write permissions from client roles on server-only tables
REVOKE ALL ON guest_order_claims FROM anon, authenticated;
REVOKE ALL ON rate_limit_buckets FROM anon, authenticated;
REVOKE ALL ON account_deletion_jobs FROM anon, authenticated;

-- [Group A: Public Catalog & Settings - Readable by anon & authenticated]

CREATE POLICY "categories_public_read"
    ON categories FOR SELECT
    TO anon, authenticated
    USING (active = true);

CREATE POLICY "menu_items_public_read"
    ON menu_items FOR SELECT
    TO anon, authenticated
    USING (
        published = true AND
        EXISTS (
            SELECT 1 FROM categories c
            WHERE c.id = menu_items.category_id AND c.active = true
        )
    );

CREATE POLICY "seating_areas_public_read"
    ON seating_areas FOR SELECT
    TO anon, authenticated
    USING (active = true);

CREATE POLICY "dining_tables_public_read"
    ON dining_tables FOR SELECT
    TO anon, authenticated
    USING (active = true);

CREATE POLICY "delivery_zones_public_read"
    ON delivery_zones FOR SELECT
    TO anon, authenticated
    USING (active = true);

CREATE POLICY "restaurant_settings_public_read"
    ON restaurant_settings FOR SELECT
    TO anon, authenticated
    USING (true);

CREATE POLICY "business_hours_public_read"
    ON business_hours FOR SELECT
    TO anon, authenticated
    USING (active = true);

CREATE POLICY "business_closures_public_read"
    ON business_closures FOR SELECT
    TO anon, authenticated
    USING (true);

-- [Group B: Customer Private Profile, Addresses & Favorites]

-- customer_profiles: own read, own update (excluding deletion_requested_at)
CREATE POLICY "customer_profiles_self_read"
    ON customer_profiles FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

CREATE POLICY "customer_profiles_self_update"
    ON customer_profiles FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id AND deletion_requested_at IS NULL)
    WITH CHECK (auth.uid() = user_id AND deletion_requested_at IS NULL);

REVOKE INSERT, DELETE, TRUNCATE ON customer_profiles FROM anon, authenticated;

-- customer_addresses: full CRUD restricted strictly to own records
CREATE POLICY "customer_addresses_self_read"
    ON customer_addresses FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

CREATE POLICY "customer_addresses_self_insert"
    ON customer_addresses FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "customer_addresses_self_update"
    ON customer_addresses FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "customer_addresses_self_delete"
    ON customer_addresses FOR DELETE
    TO authenticated
    USING (auth.uid() = user_id);

REVOKE TRUNCATE ON customer_addresses FROM anon, authenticated;

-- customer_favorites: own read, insert, delete; can only favorite published items in active categories
CREATE POLICY "customer_favorites_self_read"
    ON customer_favorites FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

CREATE POLICY "customer_favorites_self_insert"
    ON customer_favorites FOR INSERT
    TO authenticated
    WITH CHECK (
        auth.uid() = user_id AND
        EXISTS (
            SELECT 1 FROM menu_items m
            JOIN categories c ON c.id = m.category_id
            WHERE m.id = customer_favorites.menu_item_id
              AND m.published = true
              AND c.active = true
        )
    );

CREATE POLICY "customer_favorites_self_delete"
    ON customer_favorites FOR DELETE
    TO authenticated
    USING (auth.uid() = user_id);

REVOKE UPDATE, TRUNCATE ON customer_favorites FROM anon, authenticated;

-- [Group C: Orders & Reservations Ownership]

-- orders: authenticated customers can ONLY read their own orders. Public/anon CANNOT read.
CREATE POLICY "orders_customer_self_read"
    ON orders FOR SELECT
    TO authenticated
    USING (auth.uid() = customer_user_id AND customer_user_id IS NOT NULL);

-- order_items: read-only for items belonging to customer's own orders
CREATE POLICY "order_items_customer_self_read"
    ON order_items FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM orders o
            WHERE o.id = order_items.order_id
              AND o.customer_user_id = auth.uid()
              AND o.customer_user_id IS NOT NULL
        )
    );

-- order_status_history: read-only for history belonging to customer's own orders
CREATE POLICY "order_status_history_customer_self_read"
    ON order_status_history FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM orders o
            WHERE o.id = order_status_history.order_id
              AND o.customer_user_id = auth.uid()
              AND o.customer_user_id IS NOT NULL
        )
    );

-- reservations: authenticated customers can ONLY read their own reservations
CREATE POLICY "reservations_customer_self_read"
    ON reservations FOR SELECT
    TO authenticated
    USING (auth.uid() = customer_user_id AND customer_user_id IS NOT NULL);
