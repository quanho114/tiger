import { useState } from 'react';
import type { FC } from 'react';
import { Link } from 'react-router-dom';
import {
  MapPin,
  Phone,
  Clock,
  Navigation,
  ExternalLink,
  Car,
  Calendar,
  Mail,
  Compass,
  Copy,
  Check,
  Map as MapIcon,
  ArrowRight
} from 'lucide-react';
import { useCatalog } from '@/features/catalog';
import { getSiteInfo } from '@/features/restaurant/site';

export const LocationPage: FC = () => {
  const { settings } = useCatalog();
  const site = getSiteInfo(settings);
  const [copied, setCopied] = useState(false);

  const handleCopyAddress = async () => {
    try {
      await navigator.clipboard.writeText(site.addressFull);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      // Fallback if clipboard API is restricted
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    }
  };

  return (
    <div className="pt-24 pb-20 md:pt-32 md:pb-28 bg-[#fbf9f6] min-h-screen">
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-10">

        {/* ========================================================================= */}
        {/* PAGE HEADER */}
        {/* ========================================================================= */}
        <div className="max-w-2xl mb-10 pb-6 border-b border-[#d2b68c]/30">
          <div className="flex items-center gap-2.5 mb-2.5">
            <span className="font-['Be_Vietnam_Pro',sans-serif] text-[11px] font-semibold tracking-[0.18em] uppercase text-[#ed7328]">
              ĐỊA CHỈ & LIÊN HỆ
            </span>
            <span className="w-8 h-[1.5px] bg-[#d2b68c]" />
          </div>
          <h1 className="font-['Noto_Serif',serif] text-3xl sm:text-4xl lg:text-[44px] font-bold text-[#234386] tracking-tight leading-tight">
            Chúng tôi luôn ở đây, chờ bạn ghé thăm
          </h1>
          <p className="font-['Be_Vietnam_Pro',sans-serif] text-[#000000]/70 text-sm sm:text-base mt-2.5 font-normal leading-relaxed">
            Tọa lạc tại thị trấn Vĩnh An, huyện Vĩnh Cửu, Tiger 345 sẵn sàng chào đón bạn với không gian ấm cúng và những bữa ăn ngon lành.
          </p>
        </div>

        {/* ========================================================================= */}
        {/* MAIN TWO-COLUMN CONTENT */}
        {/* ========================================================================= */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">

          {/* Left Column: Contact Essentials & Practical Guidance */}
          <div className="lg:col-span-6 space-y-6">

            {/* Primary Details Card */}
            <div className="p-6 sm:p-8 rounded-[28px] bg-white border border-[#d2b68c]/35 shadow-sm space-y-6">
              <div className="flex items-center justify-between gap-2 pb-3 border-b border-[#d2b68c]/25">
                <h3 className="font-['Noto_Serif',serif] text-lg sm:text-xl font-bold text-[#234386] whitespace-nowrap">
                  Thông tin nhà hàng
                </h3>
                <span className="shrink-0 inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1 rounded-full bg-[#3d5a45]/10 text-[#3d5a45] text-[11px] font-medium tracking-wide">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#3d5a45] animate-pulse" />
                  <span>Kiểm tra lịch trước khi đến</span>
                </span>
              </div>

              {/* Address with One-Click Copy */}
              <div className="flex items-start gap-3.5">
                <div className="w-9 h-9 rounded-full bg-[#ed7328]/15 text-[#ed7328] flex items-center justify-center shrink-0 mt-0.5">
                  <MapPin size={17} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <strong className="block text-sm sm:text-base text-[#000000] leading-snug">
                      {site.addressFull}
                    </strong>
                    <button
                      type="button"
                      disabled={!settings?.address}
                      onClick={handleCopyAddress}
                      title="Sao chép địa chỉ"
                      aria-label="Sao chép địa chỉ vào clipboard"
                      className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[#d2b68c]/40 hover:border-[#234386] bg-[#fbf9f6] hover:bg-white text-[11px] font-medium text-[#234386] transition-colors"
                    >
                      {copied ? (
                        <>
                          <Check size={12} className="text-[#3d5a45]" />
                          <span className="text-[#3d5a45]">Đã chép</span>
                        </>
                      ) : (
                        <>
                          <Copy size={12} className="opacity-70" />
                          <span>Sao chép</span>
                        </>
                      )}
                    </button>
                  </div>
                  <span className="text-xs text-[#000000]/65 mt-1 block">
                    Mặt tiền đường lớn, dễ tìm · Có chỗ đỗ xe thuận tiện
                  </span>
                </div>
              </div>

              {/* Opening Hours */}
              <div className="flex items-start gap-3.5">
                <div className="w-9 h-9 rounded-full bg-[#3d5a45]/15 text-[#3d5a45] flex items-center justify-center shrink-0 mt-0.5">
                  <Clock size={17} />
                </div>
                <div>
                  <strong className="block text-sm sm:text-base text-[#000000]">
                    {site.hours} ({site.hoursNote})
                  </strong>
                  <span className="text-xs text-[#000000]/65 mt-0.5 block">
                    Giờ phục vụ và ngày nghỉ có thể thay đổi; vui lòng kiểm tra trước khi đến.
                  </span>
                </div>
              </div>

              {/* Phone & Hotline */}
              <div className="flex items-start gap-3.5">
                <div className="w-9 h-9 rounded-full bg-[#234386]/10 text-[#234386] flex items-center justify-center shrink-0 mt-0.5">
                  <Phone size={17} />
                </div>
                <div>
                  <strong className="block text-sm sm:text-base text-[#000000]">
                    Điện thoại liên hệ & Đặt bàn
                  </strong>
                  {site.phoneHref ? <a href={site.phoneHref} className="text-base font-bold text-[#234386] hover:text-[#ed7328] transition-colors block mt-0.5">
                    {site.phoneDisplay}
                  </a> : <span>{site.phoneDisplay}</span>}
                </div>
              </div>

              {/* Email */}
              <div className="flex items-start gap-3.5">
                <div className="w-9 h-9 rounded-full bg-[#ffc400]/25 text-[#234386] flex items-center justify-center shrink-0 mt-0.5">
                  <Mail size={17} />
                </div>
                <div>
                  <strong className="block text-sm sm:text-base text-[#000000]">
                    Email dịch vụ khách hàng
                  </strong>
                  <a href="mailto:contact@tiger345.vn" className="text-xs sm:text-sm text-[#234386] hover:text-[#ed7328] transition-colors">
                    contact@tiger345.vn
                  </a>
                </div>
              </div>

              {/* Parking & Transport Inset Note */}
              <div className="p-4 rounded-2xl bg-[#234386]/[0.035] border border-[#234386]/10 space-y-1.5 text-xs text-[#000000]/80">
                <div className="flex items-center gap-2 text-[#234386] font-semibold text-xs">
                  <Car size={15} />
                  <span>Bãi đỗ xe ô tô & xe máy miễn phí</span>
                </div>
                <p className="leading-relaxed text-[#000000]/70 text-[12px]">
                  Giữ xe máy miễn phí ngay mặt tiền và bãi đỗ xe ô tô liên kết cách nhà hàng 30m. Vui lòng hỏi nhân viên đón khách khi đến nơi để được hỗ trợ chu đáo.
                </p>
              </div>
            </div>

            {/* Action Buttons: Balanced 2-Column Primary/Secondary Layout */}
            <div className="space-y-3 pt-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {site.mapsUrl && <a
                  href={site.mapsUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="h-12 font-['Be_Vietnam_Pro',sans-serif] inline-flex items-center justify-center gap-2 px-5 rounded-2xl bg-[#234386] hover:bg-[#1a3468] text-white text-xs sm:text-[13px] font-semibold shadow-sm hover:shadow active:scale-98 transition-all"
                >
                  <Navigation size={15} />
                  <span>Chỉ đường Google Maps</span>
                  <ExternalLink size={13} className="opacity-75" />
                </a>}

                {site.phoneHref && <a
                  href={site.phoneHref}
                  className="h-12 font-['Be_Vietnam_Pro',sans-serif] inline-flex items-center justify-center gap-2 px-5 rounded-2xl bg-white border border-[#234386]/30 text-[#234386] hover:border-[#ed7328] hover:text-[#ed7328] text-xs sm:text-[13px] font-semibold active:scale-98 transition-all shadow-2xs hover:shadow-xs"
                >
                  <Phone size={15} />
                  <span>Gọi ngay {site.phoneDisplay}</span>
                </a>}
              </div>

              {/* Table Reservation Callout Banner */}
              <div className="p-4 rounded-2xl bg-gradient-to-r from-[#ed7328]/10 via-[#ed7328]/5 to-transparent border border-[#ed7328]/25 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-[#ed7328] text-white flex items-center justify-center shrink-0">
                    <Calendar size={15} />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-[#234386] block">Dự định ghé dùng bữa?</span>
                    <span className="text-[11px] text-[#000000]/65">Đặt bàn trước để quán chuẩn bị chỗ ngồi ưng ý nhất</span>
                  </div>
                </div>
                <Link
                  to="/reservation"
                  className="w-full sm:w-auto font-['Be_Vietnam_Pro',sans-serif] inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-full bg-[#ed7328] hover:bg-[#d86218] text-white text-xs font-semibold shadow-2xs transition-all shrink-0 active:scale-95"
                >
                  <span>Đặt bàn trước</span>
                  <ArrowRight size={13} />
                </Link>
              </div>
            </div>

          </div>

          {/* Right Column: Interactive Map & Storefront Atmosphere */}
          <div className="lg:col-span-6 space-y-6">

            {/* Interactive Map Card */}
            <div className="w-full bg-white rounded-[28px] border border-[#d2b68c]/40 p-4 sm:p-6 shadow-sm overflow-hidden flex flex-col">

              {/* Header */}
              <div className="flex items-center justify-between gap-3 pb-3 mb-4 border-b border-[#d2b68c]/25">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-[#234386]/10 text-[#234386] flex items-center justify-center shrink-0">
                    <MapIcon size={15} />
                  </div>
                  <h3 className="font-['Noto_Serif',serif] text-lg sm:text-xl font-bold text-[#234386]">
                    Vị trí trên bản đồ
                  </h3>
                </div>

                <span className="font-['Dancing_Script',cursive] text-base sm:text-lg text-[#ed7328] font-semibold">
                  Gặp nhau ở những điều tuyệt vời ♡
                </span>
              </div>

              {/* Interactive Google Maps Embed */}
              <div className="relative rounded-2xl overflow-hidden border border-[#d2b68c]/30 aspect-[4/3] sm:aspect-[16/10] bg-[#fbf9f6]">
                {site.mapPlaceQuery ? <iframe
                  title="Bản đồ chỉ đường đến Tiger 345"
                  src={`https://maps.google.com/maps?q=${encodeURIComponent(site.mapPlaceQuery)}&t=&z=17&ie=UTF8&iwloc=&output=embed`}
                  className="w-full h-full border-0"
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                /> : <p className="p-6 text-sm">Vị trí chưa được cập nhật.</p>}
                <div className="absolute top-2.5 right-2.5">
                  {site.mapsUrl && <a
                    href={site.mapsUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/95 backdrop-blur-xs border border-[#d2b68c]/50 text-[#234386] text-[11px] font-semibold shadow-xs hover:text-[#ed7328] hover:border-[#ed7328] transition-all"
                  >
                    <span>Mở Google Maps</span>
                    <ExternalLink size={11} />
                  </a>}
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between text-[11px] text-[#000000]/60 pt-2 border-t border-[#d2b68c]/20">
                <span className="inline-flex items-center gap-1.5">
                  <Compass size={13} className="text-[#ed7328]" />
                  <span>Không gian mở hiện đại & ấm cúng</span>
                </span>
                <span className="font-semibold text-[#234386]">{site.addressShort}</span>
              </div>
            </div>

            {/* Photo Card */}
            <div className="relative rounded-[28px] overflow-hidden aspect-[16/9] shadow-sm border border-[#d2b68c]/35">
              <img
                src="https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=1000&q=80"
                alt="Không gian đón tiếp tại nhà hàng Tiger 345"
                className="w-full h-full object-cover"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/15 to-transparent" />
              <div className="absolute bottom-4 left-6 right-6 text-white text-xs flex items-center justify-between">
                <span className="font-semibold text-[13px]">Vị trí thuận tiện ngay trung tâm thị trấn Vĩnh An</span>
                <span className="text-[11px] text-white/80 hidden sm:inline">Tiger 345 Contemporary Bistro</span>
              </div>
            </div>

          </div>

        </div>

      </div>
    </div>
  );
};
