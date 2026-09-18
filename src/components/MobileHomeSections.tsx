import type { FC } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, Utensils, Bike, Calendar, MapPin } from 'lucide-react';

/**
 * Mobile-only home sections (each root is `md:hidden`).
 * Desktop keeps the approved editorial sections untouched.
 */

/* ---------- SHORT STORY ---------- */
export const MobileStorySection: FC = () => (
  <section className="md:hidden bg-[#fbf9f6] px-4 pt-4 pb-10">
    <div className="rounded-[24px] overflow-hidden border border-[#d2b68c]/35 bg-white shadow-xs">
      <div className="relative aspect-[16/9] overflow-hidden">
        <img
          src="https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=800&q=80"
          alt="Không gian ấm cúng tại Tiger 345"
          className="w-full h-full object-cover"
          loading="lazy"
        />
        <span className="absolute top-3 left-3 bg-[#fbf9f6]/90 backdrop-blur-xs text-[#234386] text-[10px] font-semibold uppercase tracking-[0.14em] px-3 py-1 rounded-full">
          Câu chuyện
        </span>
      </div>
      <div className="p-5">
        <h2 className="font-['Noto_Serif',serif] text-[26px] leading-[1.15] font-bold text-[#234386] tracking-tight mb-2">
          Bếp Việt đương đại, hồn Việt nguyên bản
        </h2>
        <p className="font-['Be_Vietnam_Pro',sans-serif] text-[15px] leading-[1.65] text-[#000000]/70 font-normal">
          Nguyên liệu tươi mỗi sáng, lửa than hoa và công thức của Bếp trưởng — gói trọn trong từng món ăn tại Tiger 345.
        </p>
      </div>
    </div>
  </section>
);

/* ---------- ACTION CARDS ---------- */
const ACTIONS = [
  {
    to: '/menu?mode=dine-in',
    icon: Utensils,
    tint: 'bg-[#234386]/10 text-[#234386]',
    title: 'Thực đơn tại quán',
    desc: 'Trọn vị trong không gian đầy cảm hứng',
  },
  {
    to: '/menu?mode=delivery',
    icon: Bike,
    tint: 'bg-[#ed7328]/15 text-[#ed7328]',
    title: 'Giao tận nơi',
    desc: 'Nóng hổi đến cửa trong 30 phút',
  },
  {
    to: '/reservation',
    icon: Calendar,
    tint: 'bg-[#ffc400]/20 text-[#8a6d00]',
    title: 'Đặt bàn',
    desc: 'Giữ chỗ trực tuyến chỉ trong 1 phút',
  },
  {
    to: '/location',
    icon: MapPin,
    tint: 'bg-[#3d5a45]/15 text-[#3d5a45]',
    title: 'Địa chỉ',
    desc: '17 Đường Số 1, Vĩnh An, Vĩnh Cửu, Đồng Nai',
  },
];

export const MobileActionCardsSection: FC = () => (
  <section className="md:hidden bg-[#fbf9f6] px-4 pb-10">
    <div className="flex items-center gap-3 mb-4 px-1">
      <span className="font-['Be_Vietnam_Pro',sans-serif] text-[11px] font-semibold tracking-[0.18em] uppercase text-[#000000]/60">
        Bắt đầu từ đây
      </span>
      <span className="w-8 h-[1.5px] bg-[#d2b68c]" />
    </div>
    <div className="flex flex-col gap-3">
      {ACTIONS.map((action) => {
        const Icon = action.icon;
        return (
          <Link
            key={action.to}
            to={action.to}
            className="group flex items-center gap-4 bg-white border border-[#d2b68c]/35 rounded-[20px] p-3 pr-4 shadow-xs active:scale-[0.99] transition-transform"
          >
            <span className={`w-12 h-12 rounded-2xl ${action.tint} flex items-center justify-center shrink-0`}>
              <Icon size={22} />
            </span>
            <span className="flex-grow min-w-0">
              <span className="font-['Noto_Serif',serif] text-[17px] font-bold text-[#000000] block leading-tight truncate">
                {action.title}
              </span>
              <span className="font-['Be_Vietnam_Pro',sans-serif] text-[13px] text-[#000000]/65 block truncate">
                {action.desc}
              </span>
            </span>
            <span className="w-9 h-9 rounded-full bg-[#fbf9f6] border border-[#d2b68c]/40 text-[#234386] flex items-center justify-center shrink-0 group-active:bg-[#234386] group-active:text-white transition-colors">
              <ArrowUpRight size={17} />
            </span>
          </Link>
        );
      })}
    </div>
  </section>
);

/* ---------- ATMOSPHERE ---------- */
export const MobileAtmosphereSection: FC = () => (
  <section className="md:hidden bg-[#fbf9f6] px-4 pb-10">
    <div className="relative rounded-[24px] overflow-hidden border border-[#d2b68c]/35 shadow-xs">
      <img
        src="https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=800&q=80"
        alt="Mâm tiệc sum vầy tại Tiger 345"
        className="w-full aspect-[4/3] object-cover"
        loading="lazy"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/15 to-transparent" />
      <div className="absolute bottom-4 left-4 right-4">
        <p className="font-['Dancing_Script',cursive] text-[22px] text-[#ffc400] font-semibold leading-tight -rotate-1 mb-1">
          Tối nay ăn gì cũng ngon
        </p>
        <p className="font-['Noto_Serif',serif] text-lg font-bold text-white leading-snug">
          Mâm tiệc sum vầy cho 4 người, chỉ từ 890.000đ
        </p>
      </div>
    </div>
  </section>
);

/* ---------- FINAL CTA ---------- */
export const MobileFinalCtaSection: FC = () => (
  <section className="md:hidden bg-[#fbf9f6] px-4 pb-14">
    <div className="relative overflow-hidden rounded-[24px] bg-[#234386] px-6 py-8 text-center shadow-lg">
      <div
        aria-hidden="true"
        className="absolute -top-16 -right-16 w-48 h-48 bg-[#ffc400]/25 rounded-full blur-2xl pointer-events-none"
      />
      <div
        aria-hidden="true"
        className="absolute -bottom-20 -left-16 w-56 h-56 bg-[#ed7328]/30 rounded-full blur-2xl pointer-events-none"
      />
      <p className="font-['Dancing_Script',cursive] text-[22px] text-[#ffc400] font-semibold mb-1 relative">
        Good Food, Brighter Days
      </p>
      <h2 className="font-['Noto_Serif',serif] text-[26px] leading-tight font-bold text-white tracking-tight mb-2 relative">
        Sẵn sàng cho bữa ngon?
      </h2>
      <p className="font-['Be_Vietnam_Pro',sans-serif] text-sm text-white/75 mb-6 relative">
        Đặt bàn trước 30 giây, giữ góc ngồi đẹp nhất tối nay.
      </p>
      <Link
        to="/reservation"
        className="relative inline-flex items-center justify-center gap-2 w-full py-3.5 rounded-full bg-[#ed7328] text-white font-semibold text-sm shadow-md active:scale-[0.99] transition-transform"
      >
        <span>Đặt bàn ngay</span>
        <ArrowRight size={16} />
      </Link>
      <a
        href="tel:0902809929"
        className="relative block mt-3 text-xs font-semibold text-white/80"
      >
        Hoặc gọi Hotline: 090 280 99 29
      </a>
    </div>
  </section>
);
