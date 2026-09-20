import { useState, useEffect } from 'react';
import type { FC } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  ArrowRight,
  Utensils,
  Bike,
  Calendar,
  MapPin,
  Sparkles,
  Heart,
  Award,
  User,
  ShoppingBag,
  CalendarCheck
} from 'lucide-react';
import { HeroSection } from '../components/HeroSection';
import { HighlightStrip } from '../components/HighlightStrip';
import { BotanicalBranch, BotanicalSprig } from '../components/BotanicalDecorations';
import { useCatalog } from '@/features/catalog';
import { useAuth } from '@/features/auth';
import { fetchCustomerHome } from '@/features/account/api';
import type { CustomerHomeSummary } from '@/features/account/types';

export const HomePage: FC = () => {
  const navigate = useNavigate();
  const { featuredItems, items, isLoading } = useCatalog();
  const { role, user } = useAuth();
  const [customerHome, setCustomerHome] = useState<CustomerHomeSummary | null>(null);

  useEffect(() => {
    if (role === 'customer') {
      fetchCustomerHome().then(setCustomerHome).catch(() => {});
    }
  }, [role]);

  // 4 signature teaser dishes for landing page showcase
  const teaserDishes = featuredItems.length > 0 ? featuredItems.slice(0, 4) : items.slice(0, 4);

  return (
    <div className="space-y-0">
      {/* Personalized Customer Welcome Banner (when authenticated as customer) */}
      {role === 'customer' && (
        <section className="bg-gradient-to-r from-[#234386] via-[#1a3366] to-[#234386] text-white py-4 px-4 sm:px-6 lg:px-10 border-b border-[#ffc400]/30 shadow-inner">
          <div className="max-w-[1280px] mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-[#ffc400]/20 border border-[#ffc400]/40 flex items-center justify-center text-[#ffc400] font-bold">
                <User className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs text-[#ffc400] font-medium tracking-wide uppercase">Thành viên thân thiết</p>
                <h3 className="text-base sm:text-lg font-bold text-white font-['Noto_Serif',serif]">
                  Xin chào, {user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Quý khách'}!
                </h3>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-xs sm:text-sm">
              {customerHome && (
                <>
                  <Link
                    to="/account/orders"
                    className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-full backdrop-blur-xs transition-colors"
                  >
                    <ShoppingBag className="w-4 h-4 text-[#ffc400]" />
                    <span>{customerHome.recent_orders.length} đơn hàng</span>
                  </Link>

                  <Link
                    to="/account/reservations"
                    className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-full backdrop-blur-xs transition-colors"
                  >
                    <CalendarCheck className="w-4 h-4 text-[#ffc400]" />
                    <span>{customerHome.upcoming_reservations.length} bàn đặt</span>
                  </Link>

                  <Link
                    to="/account/favorites"
                    className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-full backdrop-blur-xs transition-colors"
                  >
                    <Heart className="w-4 h-4 text-red-400 fill-red-400" />
                    <span>{customerHome.favorites.length} món thích</span>
                  </Link>
                </>
              )}

              <Link
                to="/account"
                className="flex items-center gap-1 bg-[#ffc400] text-[#234386] font-semibold px-4 py-1.5 rounded-full hover:bg-[#ffc400]/90 transition-colors shadow-xs"
              >
                <span>Tài khoản</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* 1. HERO SECTION (Artistic, Editorial, Food-focused) */}
      <HeroSection
        onExploreMenu={() => navigate('/menu')}
        onBookTable={() => navigate('/reservation')}
      />

      {/* 2. HIGHLIGHT STRIP (Quality Pillars) */}
      <HighlightStrip />

      {/* 3. BRAND / STORY (Editorial Narrative) */}
      <section className="py-16 md:py-24 bg-[#fbf9f6] relative overflow-hidden">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-10">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14 items-center">
            
            {/* Visual Left */}
            <div className="lg:col-span-5 relative">
              <div className="relative rounded-[28px] sm:rounded-[36px] overflow-hidden shadow-xl border border-[#d2b68c]/35 aspect-[4/5] bg-[#234386]/5">
                <img
                  src="https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=900&q=85"
                  alt="Bếp trưởng chế biến món ăn tại Tiger 345"
                  className="w-full h-full object-cover hover:scale-105 transition-transform duration-700"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#234386]/70 via-transparent to-transparent" />
                
                <div className="absolute bottom-6 left-6 right-6 text-white">
                  <span className="font-['Dancing_Script',cursive] text-2xl sm:text-3xl text-[#ffc400] font-semibold leading-none drop-shadow-sm block mb-1.5">
                    Nâng niu từng gia vị
                  </span>
                  <p className="font-['Be_Vietnam_Pro',sans-serif] text-xs sm:text-sm text-white/90">
                    Bếp mở với ngọn lửa than hoa và những loại thảo mộc tươi chọn lọc mỗi sớm.
                  </p>
                </div>
              </div>

              {/* Floating trust badge */}
              <div className="hidden sm:flex items-center gap-2.5 absolute -bottom-5 -right-5 bg-white p-3.5 sm:p-4 rounded-2xl shadow-lg border border-[#d2b68c]/35">
                <div className="w-10 h-10 rounded-full bg-[#ffc400]/25 text-[#234386] flex items-center justify-center font-bold text-sm">
                  ★
                </div>
                <div>
                  <span className="block text-[11px] uppercase tracking-wider text-[#000000]/60 font-semibold">Triết lý bếp</span>
                  <span className="font-['Noto_Serif',serif] font-bold text-sm text-[#234386]">Tươi Mới · Thuần Khiết</span>
                </div>
              </div>
            </div>

            {/* Content Right */}
            <div className="lg:col-span-7 space-y-6">
              <div className="flex items-center gap-3">
                <span className="font-['Be_Vietnam_Pro',sans-serif] text-[11px] font-semibold tracking-[0.18em] uppercase text-[#ed7328]">
                  CÂU CHUYỆN TIGER 345
                </span>
                <span className="w-8 h-[1.5px] bg-[#d2b68c]" />
              </div>

              <h2 className="font-['Noto_Serif',serif] text-3xl sm:text-4xl lg:text-[42px] font-bold text-[#234386] tracking-tight leading-tight">
                Nơi hương vị truyền thống gặp gỡ cảm hứng đương đại
              </h2>

              <p className="font-['Be_Vietnam_Pro',sans-serif] text-sm sm:text-base text-[#000000]/75 leading-relaxed font-normal">
                Tiger 345 được sinh ra từ niềm say mê sâu sắc với ẩm thực Việt. Chúng tôi tin rằng những hương vị quen thuộc—từ vị ngọt thanh của nước dùng ninh xương thâu đêm, mùi khói than hoa của món nướng đến độ giòn tươi của rau thơm bốn mùa—đều xứng đáng được tôn vinh với góc nhìn sáng tạo và bàn tay tài hoa của người đầu bếp.
              </p>

              {/* 3 Pillars */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
                <div className="p-4 rounded-2xl bg-white border border-[#d2b68c]/30 shadow-2xs space-y-1.5">
                  <div className="w-8 h-8 rounded-full bg-[#3d5a45]/15 text-[#3d5a45] flex items-center justify-center">
                    <Sparkles size={16} />
                  </div>
                  <h4 className="font-['Noto_Serif',serif] font-bold text-sm text-[#234386]">Nguyên liệu sạch</h4>
                  <p className="text-xs text-[#000000]/65 leading-relaxed">Nông sản tươi thu hái mỗi ngày từ các trang trại uy tín.</p>
                </div>

                <div className="p-4 rounded-2xl bg-white border border-[#d2b68c]/30 shadow-2xs space-y-1.5">
                  <div className="w-8 h-8 rounded-full bg-[#ed7328]/15 text-[#ed7328] flex items-center justify-center">
                    <Award size={16} />
                  </div>
                  <h4 className="font-['Noto_Serif',serif] font-bold text-sm text-[#234386]">Gia vị thủ công</h4>
                  <p className="text-xs text-[#000000]/65 leading-relaxed">Nước sốt & thảo mộc điều chế riêng không hương liệu phụ gia.</p>
                </div>

                <div className="p-4 rounded-2xl bg-white border border-[#d2b68c]/30 shadow-2xs space-y-1.5">
                  <div className="w-8 h-8 rounded-full bg-[#ffc400]/25 text-[#234386] flex items-center justify-center">
                    <Heart size={16} />
                  </div>
                  <h4 className="font-['Noto_Serif',serif] font-bold text-sm text-[#234386]">Ấm áp như nhà</h4>
                  <p className="text-xs text-[#000000]/65 leading-relaxed">Phục vụ tận tâm chu đáo cho mọi cuộc gặp gỡ sum vầy.</p>
                </div>
              </div>

              <div className="pt-2">
                <Link
                  to="/menu"
                  className="font-['Be_Vietnam_Pro',sans-serif] inline-flex items-center gap-2 text-[#234386] hover:text-[#ed7328] font-semibold text-sm transition-colors border-b border-[#234386]/30 hover:border-[#ed7328] pb-1"
                >
                  <span>Tìm hiểu thêm về thực đơn của chúng tôi</span>
                  <ArrowRight size={15} />
                </Link>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* 4. SIGNATURE DISHES TEASER (3-4 Teaser Dishes, NOT the full menu) */}
      <section className="py-16 md:py-24 bg-white/60 border-y border-[#d2b68c]/30 relative overflow-hidden">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-10">
          
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 sm:gap-6 mb-10 md:mb-12">
            <div className="max-w-2xl">
              <div className="flex items-center gap-3 mb-3">
                <span className="font-['Be_Vietnam_Pro',sans-serif] text-[11px] font-semibold tracking-[0.18em] uppercase text-[#ed7328]">
                  MÓN NGON ĐẶC SẮC
                </span>
                <span className="w-10 h-[1.5px] bg-[#d2b68c]" />
              </div>
              <h2 className="font-['Noto_Serif',serif] text-2xl sm:text-3xl lg:text-[40px] font-bold text-[#234386] tracking-tight leading-tight">
                Tinh hoa ẩm thực làm nên tên tuổi Tiger 345
              </h2>
              <p className="font-['Be_Vietnam_Pro',sans-serif] text-[#000000]/70 text-sm sm:text-base mt-2 font-normal leading-relaxed">
                Những món ăn được thực khách yêu thích nhất—sự hòa quyện giữa phong vị truyền thống và cảm hứng đương đại.
              </p>
            </div>

            <Link
              to="/menu"
              className="font-['Be_Vietnam_Pro',sans-serif] inline-flex items-center gap-2 text-[#234386] hover:text-[#ed7328] font-semibold text-xs sm:text-sm tracking-wide uppercase transition-colors group self-start md:self-end pb-1 border-b border-[#234386]/30 hover:border-[#ed7328]"
            >
              <span>Xem toàn bộ thực đơn</span>
              <ArrowRight size={15} className="group-hover:translate-x-1.5 transition-transform" />
            </Link>
          </div>

          {/* 4 Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {isLoading ? (
              Array.from({ length: 4 }).map((_, idx) => (
                <div
                  key={`skeleton-${idx}`}
                  className="animate-pulse flex flex-col bg-white rounded-[24px] border border-[#d2b68c]/35 p-3.5 shadow-xs"
                >
                  <div className="aspect-[4/3] rounded-[18px] bg-[#234386]/10" />
                  <div className="p-3 pt-4 space-y-3">
                    <div className="h-4 bg-[#234386]/10 rounded-sm w-3/4" />
                    <div className="h-3 bg-[#234386]/10 rounded-sm w-full" />
                    <div className="h-3 bg-[#234386]/10 rounded-sm w-2/3" />
                    <div className="pt-3 border-t border-[#d2b68c]/25 flex items-center justify-between">
                      <div className="h-4 bg-[#ed7328]/20 rounded-sm w-1/3" />
                      <div className="h-3 bg-[#234386]/10 rounded-sm w-1/4" />
                    </div>
                  </div>
                </div>
              ))
            ) : (
              teaserDishes.map((dish) => {
                const isAvailable = dish.available !== false;
                const imageSrc = dish.image_path || dish.image_url || '/tiger.svg';
                const price = dish.price_vnd ?? 0;

                return (
                  <div
                    key={dish.id}
                    className={`group flex flex-col bg-white rounded-[24px] border border-[#d2b68c]/35 p-3.5 shadow-xs hover:shadow-xl transition-all duration-300 hover:-translate-y-1 ${
                      !isAvailable ? 'opacity-70 grayscale-[30%]' : ''
                    }`}
                  >
                    <div className="relative aspect-[4/3] rounded-[18px] overflow-hidden bg-[#234386]/5">
                      <img
                        src={imageSrc}
                        alt={dish.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        loading="lazy"
                      />
                      <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5">
                        {!isAvailable ? (
                          <span className="font-['Be_Vietnam_Pro',sans-serif] inline-block bg-[#758096] text-white text-[10px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full shadow-xs">
                            Tạm hết
                          </span>
                        ) : dish.is_signature ? (
                          <span className="font-['Be_Vietnam_Pro',sans-serif] inline-block bg-[#ed7328] text-white text-[10px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full shadow-xs">
                            ★ Signature
                          </span>
                        ) : (
                          <span className="font-['Be_Vietnam_Pro',sans-serif] inline-block bg-[#ed7328] text-white text-[10px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full shadow-xs">
                            Bếp trưởng chọn
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="p-3 pt-4 flex flex-col flex-grow justify-between">
                      <div>
                        <h3 className="font-['Noto_Serif',serif] text-base font-bold text-[#000000] group-hover:text-[#234386] transition-colors line-clamp-1 mb-1.5">
                          {dish.name}
                        </h3>
                        <p className="font-['Be_Vietnam_Pro',sans-serif] text-[13px] text-[#000000]/70 line-clamp-2 leading-relaxed mb-4">
                          {dish.description}
                        </p>
                      </div>

                      <div className="pt-3 border-t border-[#d2b68c]/25 flex items-center justify-between mt-auto">
                        <span className="font-['Noto_Serif',serif] text-base font-bold text-[#ed7328]">
                          {price.toLocaleString('vi-VN')} đ
                        </span>
                        <Link
                          to="/menu"
                          className="text-xs font-semibold text-[#234386] hover:text-[#ed7328] inline-flex items-center gap-1 transition-colors"
                        >
                          <span>Chi tiết</span>
                          <ArrowRight size={13} />
                        </Link>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="text-center mt-10">
            <Link
              to="/menu"
              className="font-['Be_Vietnam_Pro',sans-serif] inline-flex items-center gap-2 px-8 py-3.5 rounded-full bg-[#234386] hover:bg-[#1a3468] text-white text-sm font-semibold shadow-md active:scale-95 transition-all"
            >
              <span>Khám phá thực đơn đầy đủ ({items.length || '30+'}+ món)</span>
              <ArrowRight size={16} />
            </Link>
          </div>

        </div>
      </section>

      {/* 5. RESTAURANT ATMOSPHERE (Selling Experience & Mood) */}
      <section className="py-16 md:py-24 bg-[#fbf9f6] relative overflow-hidden">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-10">
          
          <div className="text-center max-w-2xl mx-auto mb-12 space-y-3">
            <span className="font-['Be_Vietnam_Pro',sans-serif] text-[11px] font-semibold tracking-[0.18em] uppercase text-[#ed7328]">
              KHÔNG GIAN NHÀ HÀNG
            </span>
            <h2 className="font-['Noto_Serif',serif] text-3xl sm:text-4xl font-bold text-[#234386] tracking-tight">
              Ánh sáng êm dịu, âm nhạc tinh tế & khoảnh khắc sum vầy
            </h2>
            <p className="font-['Be_Vietnam_Pro',sans-serif] text-sm text-[#000000]/70 leading-relaxed font-normal">
              Tại Tiger 345 Vĩnh An, từng góc bàn được thiết kế để mang đến sự riêng tư, ấm áp và thư thái tối đa cho mọi bữa ăn.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="group rounded-[24px] overflow-hidden bg-white border border-[#d2b68c]/35 shadow-sm hover:shadow-lg transition-all duration-300">
              <div className="aspect-[4/3] overflow-hidden">
                <img
                  src="https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=800&q=80"
                  alt="Bàn tiệc ấm cúng tại Tiger 345"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  loading="lazy"
                />
              </div>
              <div className="p-5 space-y-1.5">
                <span className="text-[10px] font-semibold tracking-wider text-[#ed7328] uppercase">Khu vực cửa sổ</span>
                <h4 className="font-['Noto_Serif',serif] font-bold text-base text-[#234386]">View sân vườn thoáng đãng</h4>
                <p className="text-xs text-[#000000]/70 leading-relaxed">
                  Ngắm nhìn dòng người qua lại dưới ánh đèn vàng ấm áp và những giai điệu acoustic êm dịu.
                </p>
              </div>
            </div>

            <div className="group rounded-[24px] overflow-hidden bg-white border border-[#d2b68c]/35 shadow-sm hover:shadow-lg transition-all duration-300">
              <div className="aspect-[4/3] overflow-hidden">
                <img
                  src="https://images.unsplash.com/photo-1550966871-3ed3cdb5ed0c?auto=format&fit=crop&w=800&q=80"
                  alt="Không gian tiệc sum họp gia đình"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  loading="lazy"
                />
              </div>
              <div className="p-5 space-y-1.5">
                <span className="text-[10px] font-semibold tracking-wider text-[#ed7328] uppercase">Bàn tiệc gia đình</span>
                <h4 className="font-['Noto_Serif',serif] font-bold text-base text-[#234386]">Gắn kết qua từng món ngon</h4>
                <p className="text-xs text-[#000000]/70 leading-relaxed">
                  Bàn tiệc lớn rộng rãi, khoảng cách thoải mái cho những cuộc trò chuyện kéo dài rộn tiếng cười.
                </p>
              </div>
            </div>

            <div className="group rounded-[24px] overflow-hidden bg-white border border-[#d2b68c]/35 shadow-sm hover:shadow-lg transition-all duration-300">
              <div className="aspect-[4/3] overflow-hidden">
                <img
                  src="https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=800&q=80"
                  alt="Quầy đồ uống thủ công"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  loading="lazy"
                />
              </div>
              <div className="p-5 space-y-1.5">
                <span className="text-[10px] font-semibold tracking-wider text-[#ed7328] uppercase">Quầy thảo mộc</span>
                <h4 className="font-['Noto_Serif',serif] font-bold text-base text-[#234386]">Thức uống sáng tạo Việt</h4>
                <p className="text-xs text-[#000000]/70 leading-relaxed">
                  Các loại trà hoa quả theo mùa và thức uống thanh mát bổ dưỡng pha chế từ thảo mộc tự nhiên.
                </p>
              </div>
            </div>
          </div>

        </div>
      </section>

      {/* 6. PRIMARY ACTION CARDS (Major Navigation Hub across Pages) */}
      <section className="py-16 md:py-24 bg-gradient-to-b from-[#fbf9f6] via-[#234386]/5 to-[#fbf9f6] relative overflow-hidden">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-10">
          
          <div className="text-center max-w-xl mx-auto mb-12 space-y-2">
            <span className="font-['Be_Vietnam_Pro',sans-serif] text-[11px] font-semibold tracking-[0.18em] uppercase text-[#ed7328]">
              TRẢI NGHIỆM TIGER 345
            </span>
            <h2 className="font-['Noto_Serif',serif] text-3xl sm:text-4xl font-bold text-[#234386] tracking-tight">
              Bạn muốn thưởng thức thế nào hôm nay?
            </h2>
          </div>

          {/* 4 Cards: 4-col on desktop, 2x2 on tablet, stacked on phone */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            
            {/* Card 1: Thực đơn tại quán */}
            <Link
              to="/menu?mode=dine-in"
              className="group bg-white rounded-[24px] overflow-hidden border border-[#d2b68c]/35 shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-1.5 flex flex-col justify-between"
            >
              <div className="aspect-[16/10] overflow-hidden bg-black/5 relative">
                <img
                  src="https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=600&q=80"
                  alt="Thực đơn tại quán Tiger 345"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  loading="lazy"
                />
                <div className="absolute top-3 left-3 bg-[#234386] text-white p-2 rounded-full shadow-xs">
                  <Utensils size={15} />
                </div>
              </div>
              <div className="p-5 flex flex-col flex-grow justify-between">
                <div>
                  <h3 className="font-['Noto_Serif',serif] text-lg font-bold text-[#234386] group-hover:text-[#ed7328] transition-colors mb-1.5">
                    Thực đơn tại quán
                  </h3>
                  <p className="text-xs text-[#000000]/70 leading-relaxed mb-4">
                    Thưởng thức trọn vẹn hương vị trong không gian ấm áp tại Tiger 345 Vĩnh An.
                  </p>
                </div>
                <div className="pt-3 border-t border-[#d2b68c]/25 flex items-center justify-between text-xs font-semibold text-[#234386] group-hover:text-[#ed7328] transition-colors">
                  <span>Khám phá món tại quán</span>
                  <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            </Link>

            {/* Card 2: Giao tận nơi */}
            <Link
              to="/menu?mode=delivery"
              className="group bg-white rounded-[24px] overflow-hidden border border-[#d2b68c]/35 shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-1.5 flex flex-col justify-between"
            >
              <div className="aspect-[16/10] overflow-hidden bg-black/5 relative">
                <img
                  src="https://images.unsplash.com/photo-1526367790999-0150786686a2?auto=format&fit=crop&w=600&q=80"
                  alt="Giao món tận nơi nóng sốt"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  loading="lazy"
                />
                <div className="absolute top-3 left-3 bg-[#ed7328] text-white p-2 rounded-full shadow-xs">
                  <Bike size={15} />
                </div>
              </div>
              <div className="p-5 flex flex-col flex-grow justify-between">
                <div>
                  <h3 className="font-['Noto_Serif',serif] text-lg font-bold text-[#ed7328] group-hover:text-[#234386] transition-colors mb-1.5">
                    Giao tận nơi
                  </h3>
                  <p className="text-xs text-[#000000]/70 leading-relaxed mb-4">
                    Đóng hộp giữ nhiệt thân thiện môi trường, cam kết nóng sốt trong 30-40 phút.
                  </p>
                </div>
                <div className="pt-3 border-t border-[#d2b68c]/25 flex items-center justify-between text-xs font-semibold text-[#ed7328] group-hover:text-[#234386] transition-colors">
                  <span>Đặt món giao ngay</span>
                  <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            </Link>

            {/* Card 3: Đặt bàn trực tuyến */}
            <Link
              to="/reservation"
              className="group bg-white rounded-[24px] overflow-hidden border border-[#d2b68c]/35 shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-1.5 flex flex-col justify-between"
            >
              <div className="aspect-[16/10] overflow-hidden bg-black/5 relative">
                <img
                  src="https://images.unsplash.com/photo-1550966871-3ed3cdb5ed0c?auto=format&fit=crop&w=600&q=80"
                  alt="Đặt bàn hẹn hò gặp mặt"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  loading="lazy"
                />
                <div className="absolute top-3 left-3 bg-[#234386] text-white p-2 rounded-full shadow-xs">
                  <Calendar size={15} />
                </div>
              </div>
              <div className="p-5 flex flex-col flex-grow justify-between">
                <div>
                  <h3 className="font-['Noto_Serif',serif] text-lg font-bold text-[#234386] group-hover:text-[#ed7328] transition-colors mb-1.5">
                    Đặt bàn trực tuyến
                  </h3>
                  <p className="text-xs text-[#000000]/70 leading-relaxed mb-4">
                    Giữ chỗ nhanh trong 1 phút, chọn vị trí ngồi view phố hoặc phòng tiệc riêng.
                  </p>
                </div>
                <div className="pt-3 border-t border-[#d2b68c]/25 flex items-center justify-between text-xs font-semibold text-[#234386] group-hover:text-[#ed7328] transition-colors">
                  <span>Giữ chỗ ngay</span>
                  <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            </Link>

            {/* Card 4: Ghé thăm Tiger 345 */}
            <Link
              to="/location"
              className="group bg-white rounded-[24px] overflow-hidden border border-[#d2b68c]/35 shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-1.5 flex flex-col justify-between"
            >
              <div className="aspect-[16/10] overflow-hidden bg-black/5 relative">
                <img
                  src="https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=600&q=80"
                  alt="Địa chỉ nhà hàng Tiger 345 Vĩnh An"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  loading="lazy"
                />
                <div className="absolute top-3 left-3 bg-[#3d5a45] text-white p-2 rounded-full shadow-xs">
                  <MapPin size={15} />
                </div>
              </div>
              <div className="p-5 flex flex-col flex-grow justify-between">
                <div>
                  <h3 className="font-['Noto_Serif',serif] text-lg font-bold text-[#234386] group-hover:text-[#ed7328] transition-colors mb-1.5">
                    Ghé thăm Tiger 345
                  </h3>
                  <p className="text-xs text-[#000000]/70 leading-relaxed mb-4">
                    17 Đường Số 1, Vĩnh An, Vĩnh Cửu, Đồng Nai. Có bãi đỗ xe ô tô & xe máy thuận tiện.
                  </p>
                </div>
                <div className="pt-3 border-t border-[#d2b68c]/25 flex items-center justify-between text-xs font-semibold text-[#234386] group-hover:text-[#ed7328] transition-colors">
                  <span>Xem chỉ đường & giờ mở</span>
                  <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            </Link>

          </div>

        </div>
      </section>

      {/* 7. FINAL CTA BANNER */}
      <section className="py-20 bg-[#234386] text-white relative overflow-hidden">
        <div 
          aria-hidden="true" 
          className="absolute -right-10 top-0 w-80 h-80 opacity-15 pointer-events-none"
        >
          <BotanicalBranch className="w-full h-full rotate-45" color="#ffffff" />
        </div>

        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-10 text-center relative z-10 space-y-6">
          <div className="flex items-center justify-center gap-2">
            <BotanicalSprig className="w-5 h-5 -rotate-12" color="#ffc400" />
            <span className="font-['Dancing_Script',cursive] text-2xl sm:text-3xl text-[#ffc400] font-semibold">
              Hân hạnh được đón tiếp bạn
            </span>
          </div>

          <h2 className="font-['Noto_Serif',serif] text-3xl sm:text-4xl lg:text-[46px] font-bold tracking-tight max-w-3xl mx-auto leading-tight">
            Chọn một bàn. Gọi vài món.<br />Phần còn lại để Tiger 345 lo.
          </h2>

          <p className="font-['Be_Vietnam_Pro',sans-serif] text-sm sm:text-base text-white/80 max-w-xl mx-auto leading-relaxed">
            Dù là buổi hẹn đôi thân mật hay bữa ăn ấm cúng cùng gia đình, chúng tôi luôn sẵn sàng phục vụ bạn bằng cả sự tận tâm.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
            <Link
              to="/reservation"
              className="w-full sm:w-auto font-['Be_Vietnam_Pro',sans-serif] px-8 py-3.5 rounded-full bg-[#ed7328] hover:bg-[#d86218] text-white font-semibold text-sm shadow-lg active:scale-95 transition-all"
            >
              Đặt bàn trực tuyến ngay
            </Link>

            <Link
              to="/menu"
              className="w-full sm:w-auto font-['Be_Vietnam_Pro',sans-serif] px-8 py-3.5 rounded-full bg-white/10 hover:bg-white/20 text-white font-semibold text-sm border border-white/30 active:scale-95 transition-all"
            >
              Khám phá thực đơn
            </Link>
          </div>
        </div>
      </section>

    </div>
  );
};
