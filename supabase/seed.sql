-- ==============================================================================
-- TIGER 345 - DETERMINISTIC SEED DATA (LOCAL & TEST ONLY)
-- Generated for Task T02 according to plans/tiger-345/03-database.md
-- ==============================================================================

-- 1. Categories (6 categories)
INSERT INTO categories (id, name, slug, sort_order, active)
VALUES
    ('00000000-0000-0000-0000-000000000001', 'Khai vị thanh nhã', 'khai-vi', 1, true),
    ('00000000-0000-0000-0000-000000000002', 'Món chính đặc sắc', 'mon-chinh', 2, true),
    ('00000000-0000-0000-0000-000000000003', 'Món nướng than hoa', 'mon-nuong', 3, true),
    ('00000000-0000-0000-0000-000000000004', 'Lẩu & Nước hầm', 'lau', 4, true),
    ('00000000-0000-0000-0000-000000000005', 'Đồ uống hoa quả', 'do-uong', 5, true),
    ('00000000-0000-0000-0000-000000000006', 'Tráng miệng thủ công', 'trang-mieng', 6, true)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    slug = EXCLUDED.slug,
    sort_order = EXCLUDED.sort_order,
    active = EXCLUDED.active;

-- 2. Menu Items (13 full UI items with deterministic UUIDs)
INSERT INTO menu_items (
    id, category_id, name, slug, description, price_vnd, image_path,
    published, available, allow_dine_in, allow_delivery, tags,
    is_signature, is_bestseller, is_new, delivery_eta, serving_size, pairing_note, spice_level
)
VALUES
    (
        '10000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000003',
        'Sườn Nướng Mật Ong Hoa Cà Phê',
        'suon-nuong-mat-ong-hoa-ca-phe',
        'Sườn heo non ướp mật ong hoa cà phê Tây Nguyên, nướng than hoa thơm lừng ăn kèm sốt me chua ngọt.',
        245000,
        'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=800&q=80',
        true, true, true, true,
        ARRAY['Signature', 'Bếp trưởng khuyên thử'],
        true, true, false,
        '25-30 phút', 'Phù hợp 2-3 người', 'Hợp dùng cùng Trà Đào Cam Sả hoặc Rượu Nếp Cái Hoa Vàng', 1
    ),
    (
        '10000000-0000-0000-0000-000000000002',
        '00000000-0000-0000-0000-000000000001',
        'Gỏi Cuốn Tôm Thịt & Bơ Sáp',
        'goi-cuon-tom-thit-bo-sap',
        'Tôm sú sông tươi hấp rượu nếp, thịt ba chỉ giòn bì, bơ sáp Đắk Lắk bọc trong bánh tráng phơi sương Trảng Bàng.',
        135000,
        'https://images.unsplash.com/photo-1534422298391-e4f8c172dddb?auto=format&fit=crop&w=800&q=80',
        true, true, true, true,
        ARRAY['Thanh mát', 'Bestseller'],
        false, true, false,
        '20 phút', 'Khẩu phần 4 cuốn lớn', 'Chấm cùng tương bơ đậu phộng rang thủ công', 0
    ),
    (
        '10000000-0000-0000-0000-000000000003',
        '00000000-0000-0000-0000-000000000002',
        'Cá Hồi Áp Chảo Sốt Chanh Leo Hạt Dổi',
        'ca-hoi-ap-chao-sot-chanh-leo-hat-doi',
        'Phi lê cá hồi Nauy da giòn thịt mọng nước, hòa quyện sốt chanh leo sánh mịn dậy mùi hạt dổi rừng Tây Bắc.',
        320000,
        'https://images.unsplash.com/photo-1467003909585-2f8a72700288?auto=format&fit=crop&w=800&q=80',
        true, true, true, false,
        ARRAY['Signature', 'Món mới'],
        true, false, true,
        NULL, 'Khẩu phần 1 người', 'Tuyệt hảo với Vang trắng Sauvignon Blanc', 0
    ),
    (
        '10000000-0000-0000-0000-000000000004',
        '00000000-0000-0000-0000-000000000004',
        'Lẩu Nấm Chim Câu Hoàng Cung',
        'lau-nam-chim-cau-hoang-cung',
        'Nước lẩu hầm từ xương tủy 12 tiếng cùng kỷ tử, táo đỏ, 7 loại nấm tươi quý và thịt chim câu ngọt đượm vị thanh.',
        485000,
        'https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=800&q=80',
        true, true, true, true,
        ARRAY['Bổ dưỡng', 'Ấm áp'],
        true, false, false,
        '35 phút (Kèm nồi nhôm tiệt trùng)', 'Nồi lẩu cho 3-4 người', 'Ăn kèm mì trứng tươi cán tay và rau non Đà Lạt', 0
    ),
    (
        '10000000-0000-0000-0000-000000000005',
        '00000000-0000-0000-0000-000000000002',
        'Phở Thăn Bò Wagyu Tái Lăn',
        'pho-than-bo-wagyu-tai-lan',
        'Nước dùng ninh thảo quả quế hồi suốt 24 giờ, thăn bò Wagyu xào lửa lớn giữ trọn vị mềm ngọt tan chảy.',
        185000,
        'https://images.unsplash.com/photo-1582878826629-29b7ad1cdc43?auto=format&fit=crop&w=800&q=80',
        true, true, true, true,
        ARRAY['Đậm vị', 'Bestseller'],
        false, true, false,
        '25 phút (Đóng gói nước & bánh riêng)', 'Tô lớn 1 người', NULL, 1
    ),
    (
        '10000000-0000-0000-0000-000000000006',
        '00000000-0000-0000-0000-000000000003',
        'Bò Nướng Lụi Cuộn Lá Lốt Rừng',
        'bo-nuong-lui-cuon-la-lot-rung',
        'Bò băm tơ nhuyễn trộn mỡ chài béo ngậy, cuộn lá lốt nướng xém cạnh, rắc đậu phộng rang giòn và mỡ hành.',
        175000,
        'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=800&q=80',
        true, true, true, true,
        ARRAY['Món nhắm', 'Mùi vị độc bản'],
        false, false, false,
        '25 phút', 'Đĩa 8 cuộn kèm bánh hỏi', NULL, 1
    ),
    (
        '10000000-0000-0000-0000-000000000007',
        '00000000-0000-0000-0000-000000000001',
        'Bánh Xèo Tôm Nhảy Giòn Rụm',
        'banh-xeo-tom-nhay-gion-rum',
        'Vỏ bánh tráng mỏng giòn rụm từ bột gạo ngâm nước cốt dừa nghệ tươi, nhân tôm đất tươi sống và giá đỗ ngọt lành.',
        145000,
        'https://images.unsplash.com/photo-1626804475297-41608ea09aeb?auto=format&fit=crop&w=800&q=80',
        true, true, true, false,
        ARRAY['Dân dã cao cấp'],
        false, false, false,
        NULL, '2 cái lớn kèm rá rau rừng', NULL, 0
    ),
    (
        '10000000-0000-0000-0000-000000000008',
        '00000000-0000-0000-0000-000000000002',
        'Combo Cơm Niêu & Cá Bống Kho Tộ (Giao Tận Nơi)',
        'combo-com-nieu-ca-bong-kho-to',
        'Cơm niêu gạo tám thơm cháy giòn đáy niêu, cá bống kho tiêu đen Phú Quốc keo kẹo cay nồng đậm đà.',
        195000,
        'https://images.unsplash.com/photo-1512058564366-18510be2db19?auto=format&fit=crop&w=800&q=80',
        true, true, false, true,
        ARRAY['Combo Bữa Trưa', 'Giao Nhanh'],
        false, true, false,
        '20-25 phút', '1 phần trọn vẹn', NULL, 2
    ),
    (
        '10000000-0000-0000-0000-000000000009',
        '00000000-0000-0000-0000-000000000002',
        'Mâm Tiệc Sum Vầy 4 Người (Đặc Quyền Tại Quán)',
        'mam-tiec-sum-vay-4-nguoi',
        'Bao gồm: Gỏi tôm bơ sáp, Sườn nướng mật ong, Cá hồi chanh leo, Canh chua bông điên điển và Cơm sen thơm ngát.',
        890000,
        'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=800&q=80',
        true, true, true, false,
        ARRAY['Set 4 người', 'Tiết kiệm 15%'],
        true, false, false,
        NULL, 'Dành cho nhóm 4-5 khách', 'Tặng kèm bình nước đậu biếc hoa nhài', 1
    ),
    (
        '10000000-0000-0000-0000-000000000010',
        '00000000-0000-0000-0000-000000000005',
        'Trà Đào Cam Sả Mật Ong Rừng',
        'tra-dao-cam-sa-mat-ong-rung',
        'Trà ô long ủ lạnh kết hợp đào miếng giòn sần sật, nước cam vàng tươi vắt và sả đập dập thơm the sảng khoái.',
        65000,
        'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&w=800&q=80',
        true, true, true, true,
        ARRAY['Best drink', 'Tươi mát'],
        false, true, false,
        '15-20 phút', 'Ly 500ml', NULL, 0
    ),
    (
        '10000000-0000-0000-0000-000000000011',
        '00000000-0000-0000-0000-000000000005',
        'Nước Ép Ổi Hồng & Hạt Chia Hữu Cơ',
        'nuoc-ep-oi-hong-hat-chia-huu-co',
        'Ổi hồng miền Tây ép nguyên chất không thêm đường cát, giàu vitamin C và chất xơ tự nhiên tốt cho sức khỏe.',
        58000,
        'https://images.unsplash.com/photo-1621506289937-a8e4df240d0b?auto=format&fit=crop&w=800&q=80',
        true, true, true, true,
        ARRAY['Healthy', 'Thanh lọc'],
        false, false, false,
        '15-20 phút', 'Chai thủy tinh 350ml', NULL, 0
    ),
    (
        '10000000-0000-0000-0000-000000000012',
        '00000000-0000-0000-0000-000000000006',
        'Bánh Flan Trứng Gà Ta Sốt Caramel Dừa',
        'banh-flan-trung-ga-ta-sot-caramel-dua',
        'Flan nướng cách thủy từ trứng gà ta béo ngậy, sốt caramel đắng nhẹ và thạch dừa non sợi giòn thanh ngọt.',
        55000,
        'https://images.unsplash.com/photo-1587314168485-3236d6710814?auto=format&fit=crop&w=800&q=80',
        true, true, true, true,
        ARRAY['Thủ công', 'Ngọt dịu'],
        false, false, false,
        '20 phút', 'Phần 1 bánh lớn', NULL, 0
    ),
    (
        '10000000-0000-0000-0000-000000000013',
        '00000000-0000-0000-0000-000000000006',
        'Chè Hạt Sen Nhãn Lồng Long Nhãn',
        'che-hat-sen-nhan-long-long-nhan',
        'Hạt sen Huế ninh bở tơi bọc trong cùi nhãn Hưng Yên mọng nước, nấu cùng đường phèn kết tinh thanh mát tâm hồn.',
        60000,
        'https://images.unsplash.com/photo-1579954115545-a95591f28bfc?auto=format&fit=crop&w=800&q=80',
        true, true, true, false,
        ARRAY['Món cung đình', 'Thanh nhiệt'],
        true, false, false,
        NULL, 'Bát sứ dưỡng vị', NULL, 0
    )
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    slug = EXCLUDED.slug,
    description = EXCLUDED.description,
    price_vnd = EXCLUDED.price_vnd,
    image_path = EXCLUDED.image_path,
    published = EXCLUDED.published,
    available = EXCLUDED.available,
    allow_dine_in = EXCLUDED.allow_dine_in,
    allow_delivery = EXCLUDED.allow_delivery,
    tags = EXCLUDED.tags,
    is_signature = EXCLUDED.is_signature,
    is_bestseller = EXCLUDED.is_bestseller,
    is_new = EXCLUDED.is_new,
    delivery_eta = EXCLUDED.delivery_eta,
    serving_size = EXCLUDED.serving_size,
    pairing_note = EXCLUDED.pairing_note,
    spice_level = EXCLUDED.spice_level;

-- 3. Seating Areas (3 demo areas)
INSERT INTO seating_areas (id, code, name, sort_order, active)
VALUES
    ('20000000-0000-0000-0000-000000000001', 'SANH_TRET', 'Sảnh Trệt Ấm Cúng', 1, true),
    ('20000000-0000-0000-0000-000000000002', 'SAN_VUON', 'Sân Vườn Thoáng Mát', 2, true),
    ('20000000-0000-0000-0000-000000000003', 'PHONG_VIP', 'Phòng VIP Riêng Tư', 3, true)
ON CONFLICT (id) DO UPDATE SET
    code = EXCLUDED.code,
    name = EXCLUDED.name,
    sort_order = EXCLUDED.sort_order,
    active = EXCLUDED.active;

-- 4. Dining Tables (6 demo tables)
INSERT INTO dining_tables (id, code, name, seating_area_id, sort_order, active)
VALUES
    ('30000000-0000-0000-0000-000000000001', 'T01', 'Bàn 01 (Sảnh Trệt)', '20000000-0000-0000-0000-000000000001', 1, true),
    ('30000000-0000-0000-0000-000000000002', 'T02', 'Bàn 02 (Sảnh Trệt)', '20000000-0000-0000-0000-000000000001', 2, true),
    ('30000000-0000-0000-0000-000000000003', 'T03', 'Bàn 03 (Sảnh Trệt)', '20000000-0000-0000-0000-000000000001', 3, true),
    ('30000000-0000-0000-0000-000000000004', 'T04', 'Bàn 04 (Sân Vườn)', '20000000-0000-0000-0000-000000000002', 4, true),
    ('30000000-0000-0000-0000-000000000005', 'T05', 'Bàn 05 (Sân Vườn)', '20000000-0000-0000-0000-000000000002', 5, true),
    ('30000000-0000-0000-0000-000000000006', 'VIP1', 'Bàn VIP 1 (Phòng VIP)', '20000000-0000-0000-0000-000000000003', 6, true)
ON CONFLICT (id) DO UPDATE SET
    code = EXCLUDED.code,
    name = EXCLUDED.name,
    seating_area_id = EXCLUDED.seating_area_id,
    sort_order = EXCLUDED.sort_order,
    active = EXCLUDED.active;

-- 5. Delivery Zones (3 demo zones)
INSERT INTO delivery_zones (id, name, description, fee_vnd, free_threshold_vnd, sort_order, active)
VALUES
    ('40000000-0000-0000-0000-000000000001', 'Nội ô Thị trấn Vĩnh An (< 3km)', 'Giao nhanh 20-30 phút trong thị trấn', 15000, 200000, 1, true),
    ('40000000-0000-0000-0000-000000000002', 'Khu vực lân cận Vĩnh Tân / Trị An (3 - 7km)', 'Giao 30-45 phút lân cận', 30000, 400000, 2, true),
    ('40000000-0000-0000-0000-000000000003', 'Bán kính mở rộng (7 - 12km)', 'Giao 45-60 phút vùng xa', 50000, NULL, 3, true)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    fee_vnd = EXCLUDED.fee_vnd,
    free_threshold_vnd = EXCLUDED.free_threshold_vnd,
    sort_order = EXCLUDED.sort_order,
    active = EXCLUDED.active;

-- 6. Restaurant Settings (id = 1)
INSERT INTO restaurant_settings (
    id, name, phone, zalo, facebook, maps_url, address, timezone,
    accepting_orders, accepting_dine_in_orders, accepting_delivery_orders, booking_enabled,
    min_delivery_order_vnd, reservation_min_notice_minutes, reservation_max_days_ahead,
    reservation_duration_minutes, reservation_cancel_notice_minutes, reservation_no_show_grace_minutes
)
VALUES (
    1,
    'Tiger 345',
    '0902809929',
    'https://zalo.me/0902809929',
    'https://www.facebook.com/Tiger345HT/',
    'https://maps.google.com/?q=Tiger+345+Duong+So+1+Vinh+An+Vinh+Cuu+Dong+Nai',
    '17, Đường Số 1, Tổ 6, Khu Phố 2, Thị Trấn Vĩnh An, Huyện Vĩnh Cửu, Tỉnh Đồng Nai',
    'Asia/Ho_Chi_Minh',
    true, true, true, true,
    100000,
    30, 30, 120, 60, 15
)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    phone = EXCLUDED.phone,
    zalo = EXCLUDED.zalo,
    facebook = EXCLUDED.facebook,
    maps_url = EXCLUDED.maps_url,
    address = EXCLUDED.address,
    timezone = EXCLUDED.timezone,
    accepting_orders = EXCLUDED.accepting_orders,
    accepting_dine_in_orders = EXCLUDED.accepting_dine_in_orders,
    accepting_delivery_orders = EXCLUDED.accepting_delivery_orders,
    booking_enabled = EXCLUDED.booking_enabled,
    min_delivery_order_vnd = EXCLUDED.min_delivery_order_vnd,
    reservation_min_notice_minutes = EXCLUDED.reservation_min_notice_minutes,
    reservation_max_days_ahead = EXCLUDED.reservation_max_days_ahead,
    reservation_duration_minutes = EXCLUDED.reservation_duration_minutes,
    reservation_cancel_notice_minutes = EXCLUDED.reservation_cancel_notice_minutes,
    reservation_no_show_grace_minutes = EXCLUDED.reservation_no_show_grace_minutes;

-- 7. Business Hours (Full 7 days for restaurant, delivery, reservation)
DELETE FROM business_hours;
INSERT INTO business_hours (weekday, service_type, open_time, close_time, active)
VALUES
    -- Restaurant (10:00 - 22:30)
    (0, 'restaurant', '10:00:00', '22:30:00', true),
    (1, 'restaurant', '10:00:00', '22:30:00', true),
    (2, 'restaurant', '10:00:00', '22:30:00', true),
    (3, 'restaurant', '10:00:00', '22:30:00', true),
    (4, 'restaurant', '10:00:00', '22:30:00', true),
    (5, 'restaurant', '10:00:00', '22:30:00', true),
    (6, 'restaurant', '10:00:00', '22:30:00', true),

    -- Delivery (10:30 - 21:30)
    (0, 'delivery', '10:30:00', '21:30:00', true),
    (1, 'delivery', '10:30:00', '21:30:00', true),
    (2, 'delivery', '10:30:00', '21:30:00', true),
    (3, 'delivery', '10:30:00', '21:30:00', true),
    (4, 'delivery', '10:30:00', '21:30:00', true),
    (5, 'delivery', '10:30:00', '21:30:00', true),
    (6, 'delivery', '10:30:00', '21:30:00', true),

    -- Reservation (10:30 - 21:00)
    (0, 'reservation', '10:30:00', '21:00:00', true),
    (1, 'reservation', '10:30:00', '21:00:00', true),
    (2, 'reservation', '10:30:00', '21:00:00', true),
    (3, 'reservation', '10:30:00', '21:00:00', true),
    (4, 'reservation', '10:30:00', '21:00:00', true),
    (5, 'reservation', '10:30:00', '21:00:00', true),
    (6, 'reservation', '10:30:00', '21:00:00', true);
