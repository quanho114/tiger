import type { MenuItem as CatalogMenuItem } from '../features/catalog/types';

export interface MenuItem {
  id: string;
  name: string;
  category: string;
  category_id?: string;
  description: string;
  price: number;
  price_vnd?: number;
  image: string;
  image_path?: string;
  image_url?: string;
  tags?: string[];
  isSignature?: boolean;
  is_signature?: boolean;
  isBestseller?: boolean;
  is_bestseller?: boolean;
  isNew?: boolean;
  is_new?: boolean;
  is_featured?: boolean;
  featured_rank?: number | null;
  available?: boolean;
  is_available?: boolean;
  allow_dine_in?: boolean;
  allow_delivery?: boolean;
  modes: ('dine-in' | 'delivery')[];
  // Specific attributes
  deliveryETA?: string;
  delivery_eta?: string;
  servingSize?: string;
  serving_size?: string;
  pairingNote?: string;
  pairing_note?: string;
  spiceLevel?: number;
  spice_level?: number;
}

export function toLegacyMenuItem(item: CatalogMenuItem): MenuItem {
  return {
    id: item.id,
    name: item.name,
    category: item.category_id,
    category_id: item.category_id,
    description: item.description,
    price: item.price_vnd,
    price_vnd: item.price_vnd,
    image: item.image_path || item.image_url || '/tiger.svg',
    image_path: item.image_path,
    image_url: item.image_url,
    tags: item.tags,
    isSignature: item.is_signature,
    is_signature: item.is_signature,
    isBestseller: item.is_bestseller,
    is_bestseller: item.is_bestseller,
    isNew: item.is_new,
    is_new: item.is_new,
    is_featured: item.is_featured,
    featured_rank: item.featured_rank,
    available: item.available,
    is_available: item.is_available,
    allow_dine_in: item.allow_dine_in,
    allow_delivery: item.allow_delivery,
    modes: [
      ...(item.allow_dine_in ? (['dine-in'] as const) : []),
      ...(item.allow_delivery ? (['delivery'] as const) : []),
    ],
    deliveryETA: item.delivery_eta,
    delivery_eta: item.delivery_eta,
    servingSize: item.serving_size,
    serving_size: item.serving_size,
    pairingNote: item.pairing_note,
    pairing_note: item.pairing_note,
    spiceLevel: item.spice_level,
    spice_level: item.spice_level,
  };
}

export const CATEGORIES = [
  { id: 'all', name: 'Tất cả món' },
  { id: 'khai-vi', name: 'Khai vị thanh nhã' },
  { id: 'mon-chinh', name: 'Món chính đặc sắc' },
  { id: 'mon-nuong', name: 'Món nướng than hoa' },
  { id: 'lau', name: 'Lẩu & Nước hầm' },
  { id: 'do-uong', name: 'Đồ uống hoa quả' },
  { id: 'trang-mieng', name: 'Tráng miệng thủ công' },
] as const;

export const FEATURED_DISHES: MenuItem[] = [
  {
    id: 'feat-1',
    name: 'Sườn Nướng Mật Ong Hoa Cà Phê',
    category: 'mon-nuong',
    description: 'Sườn heo non ướp mật ong hoa cà phê Tây Nguyên, nướng than hoa thơm lừng ăn kèm sốt me chua ngọt.',
    price: 245000,
    image: 'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=800&q=80',
    tags: ['Signature', 'Bếp trưởng khuyên thử'],
    isSignature: true,
    isBestseller: true,
    modes: ['dine-in', 'delivery'],
    deliveryETA: '25-30 phút',
    servingSize: 'Phù hợp 2-3 người',
    pairingNote: 'Hợp dùng cùng Trà Đào Cam Sả hoặc Rượu Nếp Cái Hoa Vàng',
    spiceLevel: 1,
  },
  {
    id: 'feat-2',
    name: 'Gỏi Cuốn Tôm Thịt & Bơ Sáp',
    category: 'khai-vi',
    description: 'Tôm sú sông tươi hấp rượu nếp, thịt ba chỉ giòn bì, bơ sáp Đắk Lắk bọc trong bánh tráng phơi sương Trảng Bàng.',
    price: 135000,
    image: 'https://images.unsplash.com/photo-1534422298391-e4f8c172dddb?auto=format&fit=crop&w=800&q=80',
    tags: ['Thanh mát', 'Bestseller'],
    isBestseller: true,
    modes: ['dine-in', 'delivery'],
    deliveryETA: '20 phút',
    servingSize: 'Khẩu phần 4 cuốn lớn',
    pairingNote: 'Chấm cùng tương bơ đậu phộng rang thủ công',
    spiceLevel: 0,
  },
  {
    id: 'feat-3',
    name: 'Cá Hồi Áp Chảo Sốt Chanh Leo Hạt Dổi',
    category: 'mon-chinh',
    description: 'Phi lê cá hồi Nauy da giòn thịt mọng nước, hòa quyện sốt chanh leo sánh mịn dậy mùi hạt dổi rừng Tây Bắc.',
    price: 320000,
    image: 'https://images.unsplash.com/photo-1467003909585-2f8a72700288?auto=format&fit=crop&w=800&q=80',
    tags: ['Signature', 'Món mới'],
    isSignature: true,
    isNew: true,
    modes: ['dine-in'],
    servingSize: 'Khẩu phần 1 người',
    pairingNote: 'Tuyệt hảo với Vang trắng Sauvignon Blanc',
    spiceLevel: 0,
  },
  {
    id: 'feat-4',
    name: 'Lẩu Nấm Chim Câu Hoàng Cung',
    category: 'lau',
    description: 'Nước lẩu hầm từ xương tủy 12 tiếng cùng kỷ tử, táo đỏ, 7 loại nấm tươi quý và thịt chim câu ngọt đượm vị thanh.',
    price: 485000,
    image: 'https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=800&q=80',
    tags: ['Bổ dưỡng', 'Ấm áp'],
    isSignature: true,
    modes: ['dine-in', 'delivery'],
    deliveryETA: '35 phút (Kèm nồi nhôm tiệt trùng)',
    servingSize: 'Nồi lẩu cho 3-4 người',
    pairingNote: 'Ăn kèm mì trứng tươi cán tay và rau non Đà Lạt',
    spiceLevel: 0,
  },
];

export const MENU_ITEMS: MenuItem[] = [
  ...FEATURED_DISHES,
  {
    id: 'menu-5',
    name: 'Phở Thăn Bò Wagyu Tái Lăn',
    category: 'mon-chinh',
    description: 'Nước dùng ninh thảo quả quế hồi suốt 24 giờ, thăn bò Wagyu xào lửa lớn giữ trọn vị mềm ngọt tan chảy.',
    price: 185000,
    image: 'https://images.unsplash.com/photo-1582878826629-29b7ad1cdc43?auto=format&fit=crop&w=800&q=80',
    tags: ['Đậm vị', 'Bestseller'],
    isBestseller: true,
    modes: ['dine-in', 'delivery'],
    deliveryETA: '25 phút (Đóng gói nước & bánh riêng)',
    servingSize: 'Tô lớn 1 người',
    spiceLevel: 1,
  },
  {
    id: 'menu-6',
    name: 'Bò Nướng Lụi Cuộn Lá Lốt Rừng',
    category: 'mon-nuong',
    description: 'Bò băm tơ nhuyễn trộn mỡ chài béo ngậy, cuộn lá lốt nướng xém cạnh, rắc đậu phộng rang giòn và mỡ hành.',
    price: 175000,
    image: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=800&q=80',
    tags: ['Món nhắm', 'Mùi vị độc bản'],
    modes: ['dine-in', 'delivery'],
    deliveryETA: '25 phút',
    servingSize: 'Đĩa 8 cuộn kèm bánh hỏi',
    spiceLevel: 1,
  },
  {
    id: 'menu-7',
    name: 'Bánh Xèo Tôm Nhảy Giòn Rụm',
    category: 'khai-vi',
    description: 'Vỏ bánh tráng mỏng giòn rụm từ bột gạo ngâm nước cốt dừa nghệ tươi, nhân tôm đất tươi sống và giá đỗ ngọt lành.',
    price: 145000,
    image: 'https://images.unsplash.com/photo-1626804475297-41608ea09aeb?auto=format&fit=crop&w=800&q=80',
    tags: ['Dân dã cao cấp'],
    modes: ['dine-in'],
    servingSize: '2 cái lớn kèm rá rau rừng',
    spiceLevel: 0,
  },
  {
    id: 'menu-8',
    name: 'Combo Cơm Niêu & Cá Bống Kho Tộ (Giao Tận Nơi)',
    category: 'mon-chinh',
    description: 'Cơm niêu gạo tám thơm cháy giòn đáy niêu, cá bống kho tiêu đen Phú Quốc keo kẹo cay nồng đậm đà.',
    price: 195000,
    image: 'https://images.unsplash.com/photo-1512058564366-18510be2db19?auto=format&fit=crop&w=800&q=80',
    tags: ['Combo Bữa Trưa', 'Giao Nhanh'],
    isBestseller: true,
    modes: ['delivery'],
    deliveryETA: '20-25 phút',
    servingSize: '1 phần trọn vẹn',
    spiceLevel: 2,
  },
  {
    id: 'menu-9',
    name: 'Mâm Tiệc Sum Vầy 4 Người (Đặc Quyền Tại Quán)',
    category: 'mon-chinh',
    description: 'Bao gồm: Gỏi tôm bơ sáp, Sườn nướng mật ong, Cá hồi chanh leo, Canh chua bông điên điển và Cơm sen thơm ngát.',
    price: 890000,
    image: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=800&q=80',
    tags: ['Set 4 người', 'Tiết kiệm 15%'],
    isSignature: true,
    modes: ['dine-in'],
    servingSize: 'Dành cho nhóm 4-5 khách',
    pairingNote: 'Tặng kèm bình nước đậu biếc hoa nhài',
    spiceLevel: 1,
  },
  {
    id: 'menu-10',
    name: 'Trà Đào Cam Sả Mật Ong Rừng',
    category: 'do-uong',
    description: 'Trà ô long ủ lạnh kết hợp đào miếng giòn sần sật, nước cam vàng tươi vắt và sả đập dập thơm the sảng khoái.',
    price: 65000,
    image: 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&w=800&q=80',
    tags: ['Best drink', 'Tươi mát'],
    isBestseller: true,
    modes: ['dine-in', 'delivery'],
    deliveryETA: '15-20 phút',
    servingSize: 'Ly 500ml',
    spiceLevel: 0,
  },
  {
    id: 'menu-11',
    name: 'Nước Ép Ổi Hồng & Hạt Chia Hữu Cơ',
    category: 'do-uong',
    description: 'Ổi hồng miền Tây ép nguyên chất không thêm đường cát, giàu vitamin C và chất xơ tự nhiên tốt cho sức khỏe.',
    price: 58000,
    image: 'https://images.unsplash.com/photo-1621506289937-a8e4df240d0b?auto=format&fit=crop&w=800&q=80',
    tags: ['Healthy', 'Thanh lọc'],
    modes: ['dine-in', 'delivery'],
    deliveryETA: '15-20 phút',
    servingSize: 'Chai thủy tinh 350ml',
    spiceLevel: 0,
  },
  {
    id: 'menu-12',
    name: 'Bánh Flan Trứng Gà Ta Sốt Caramel Dừa',
    category: 'trang-mieng',
    description: 'Flan nướng cách thủy từ trứng gà ta béo ngậy, sốt caramel đắng nhẹ và thạch dừa non sợi giòn thanh ngọt.',
    price: 55000,
    image: 'https://images.unsplash.com/photo-1587314168485-3236d6710814?auto=format&fit=crop&w=800&q=80',
    tags: ['Thủ công', 'Ngọt dịu'],
    modes: ['dine-in', 'delivery'],
    deliveryETA: '20 phút',
    servingSize: 'Phần 1 bánh lớn',
    spiceLevel: 0,
  },
  {
    id: 'menu-13',
    name: 'Chè Hạt Sen Nhãn Lồng Long Nhãn',
    category: 'trang-mieng',
    description: 'Hạt sen Huế ninh bở tơi bọc trong cùi nhãn Hưng Yên mọng nước, nấu cùng đường phèn kết tinh thanh mát tâm hồn.',
    price: 60000,
    image: 'https://images.unsplash.com/photo-1579954115545-a95591f28bfc?auto=format&fit=crop&w=800&q=80',
    tags: ['Món cung đình', 'Thanh nhiệt'],
    isSignature: true,
    modes: ['dine-in'],
    servingSize: 'Bát sứ dưỡng vị',
    spiceLevel: 0,
  },
];

export const HIGHLIGHTS = [
  {
    icon: 'Sparkles',
    title: 'Món đặc trưng',
    desc: 'Công thức độc bản hòa quyện thảo mộc tự nhiên & nguyên liệu địa phương tươi mới mỗi ngày.',
    color: 'border-[#ffc400] text-[#ffc400]',
    bgColor: 'bg-[#ffc400]/10',
  },
  {
    icon: 'Bike',
    title: 'Giao tận nơi',
    desc: 'Đóng hộp giấy giữ nhiệt sinh thái cao cấp, bảo toàn 100% hương vị và độ giòn nóng.',
    color: 'border-[#ed7328] text-[#ed7328]',
    bgColor: 'bg-[#ed7328]/10',
  },
  {
    icon: 'Lamp',
    title: 'Không gian ấm cúng',
    desc: 'Ánh sáng êm dịu, góc bàn riêng tư và tiếng nhạc êm ả cho những khoảnh khắc gắn kết.',
    color: 'border-[#234386] text-[#234386]',
    bgColor: 'bg-[#234386]/10',
  },
  {
    icon: 'CalendarCheck',
    title: 'Đặt bàn nhanh',
    desc: 'Giữ chỗ trực tuyến tức thì trong 1 phút, nhận tin nhắn SMS xác nhận tự động.',
    color: 'border-[#a2d3a6] text-[#234386]',
    bgColor: 'bg-[#a2d3a6]/20',
  },
];
