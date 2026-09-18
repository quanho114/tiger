import { useState } from 'react';
import type { FC, FormEvent } from 'react';
import { 
  Calendar, 
  Clock, 
  Users, 
  CheckCircle, 
  Phone, 
  ArrowRight,
  HeartHandshake
} from 'lucide-react';

interface ReservationSectionProps {
  prefilledNote?: string;
}

export const ReservationSection: FC<ReservationSectionProps> = ({ prefilledNote }) => {
  const [showFormModal, setShowFormModal] = useState(false);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [timeSlot, setTimeSlot] = useState('18:30');
  const [guestCount, setGuestCount] = useState('4');
  const [seatingArea, setSeatingArea] = useState('window');
  const [note, setNote] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [bookingCode, setBookingCode] = useState('');

  const [prevPrefilled, setPrevPrefilled] = useState(prefilledNote);
  if (prefilledNote !== prevPrefilled) {
    setPrevPrefilled(prefilledNote);
    if (prefilledNote) {
      setNote((prev) => (prev ? `${prev} | ${prefilledNote}` : prefilledNote));
      setShowFormModal(true);
    }
  }

  const timeSlots = [
    '11:30', '12:00', '12:30', '13:00',
    '17:30', '18:00', '18:30', '19:00', '19:30', '20:00',
  ];

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!fullName || !phone || !date) {
      alert('Vui lòng điền đầy đủ họ tên, số điện thoại và ngày đến.');
      return;
    }
    const code = 'TG-' + Math.floor(100000 + Math.random() * 900000);
    setBookingCode(code);
    setIsSubmitted(true);
  };

  const handleReset = () => {
    setIsSubmitted(false);
    setShowFormModal(false);
    setFullName('');
    setPhone('');
    setNote('');
  };

  return (
    <section id="reservation" className="py-12 md:py-24 bg-[#fbf9f6] relative scroll-mt-12 overflow-hidden">
      
      {/* Background Soft Blobs */}
      <div 
        aria-hidden="true" 
        className="absolute top-1/3 left-[-5%] w-[450px] h-[450px] bg-[#warm-sand]/15 rounded-full blur-3xl pointer-events-none -z-10" 
      />

      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-10">
        
        {/* Main Reservation Card (Directly inspired by Image B & C Split Card) */}
        <div className="bg-white rounded-[24px] sm:rounded-[32px] md:rounded-[40px] border border-[#d2b68c]/35 shadow-xl overflow-hidden grid grid-cols-1 lg:grid-cols-12 items-stretch">
          
          {/* Left Column: Atmospheric Warm Dining Photo (Image B) */}
          <div className="lg:col-span-5 relative min-h-[220px] sm:min-h-[320px] lg:min-h-[460px] overflow-hidden bg-[#234386]/10">
            <img
              src="https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=800&q=85"
              alt="Bàn tiệc ấm cúng tại Tiger 345"
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/20 to-transparent" />
            
            {/* Script Watermark (From Image B: "More Good Meals Together") */}
            <div className="absolute top-5 left-5 sm:top-8 sm:left-8 font-['Dancing_Script',cursive] text-xl sm:text-3xl text-white/90 font-semibold leading-none -rotate-6 drop-shadow-sm">
              More Good Meals<br />Together ♡
            </div>

            {/* Bottom Photo Caption */}
            <div className="absolute bottom-4 left-4 right-4 sm:bottom-6 sm:left-6 sm:right-6 text-white text-xs">
              <span className="font-['Be_Vietnam_Pro',sans-serif] inline-block px-3 py-1 rounded-full bg-[#ed7328] text-white font-semibold text-[10px] uppercase tracking-wider mb-2">
                Không gian tinh tế
              </span>
              <p className="font-['Noto_Serif',serif] text-base font-bold text-white drop-shadow-xs">
                Ánh sáng êm dịu & góc ngồi riêng tư cho những cuộc hẹn ý nghĩa
              </p>
            </div>
          </div>

          {/* Right Column: Headline, Copy & Booking Action (Image B & C) */}
          <div className="lg:col-span-7 p-5 sm:p-10 lg:p-14 flex flex-col justify-between">
            
            <div>
              {/* Eyebrow */}
              <div className="flex items-center gap-3 mb-4">
                <span className="font-['Be_Vietnam_Pro',sans-serif] text-[11px] font-semibold tracking-[0.18em] uppercase text-[#ed7328]">
                  ĐẶT BÀN
                </span>
                <span className="w-8 h-[1.5px] bg-[#d2b68c]" />
              </div>

              {/* Headline (Exact Image B & C copy) */}
              <h2 className="font-['Noto_Serif',serif] text-2xl sm:text-3xl lg:text-[40px] font-bold text-[#234386] tracking-tight leading-[1.18] mb-4">
                Biến bữa ăn thường ngày thành khoảnh khắc{' '}
                <span className="font-['Dancing_Script',cursive] text-3xl sm:text-4xl text-[#ed7328] font-semibold lowercase tracking-normal">
                  đặc biệt
                </span>
              </h2>

              <p className="font-['Be_Vietnam_Pro',sans-serif] text-sm sm:text-base text-[#000000]/75 leading-relaxed font-normal mb-8 max-w-lg">
                Chọn thời gian, chúng tôi sẽ chuẩn bị những điều tuyệt vời nhất để đón tiếp bạn và người thương. 
                Giữ chỗ trực tuyến nhanh trong 1 phút.
              </p>

              {/* Action Button & Hotline */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4 mb-6 sm:mb-10">
                <button
                  type="button"
                  onClick={() => setShowFormModal(true)}
                  className="font-['Be_Vietnam_Pro',sans-serif] inline-flex items-center justify-center gap-3 bg-[#234386] hover:bg-[#1a3468] text-white px-8 py-3.5 rounded-full font-semibold text-sm shadow-md hover:shadow-lg active:scale-95 transition-all duration-200 group"
                >
                  <span>Đặt bàn ngay</span>
                  <ArrowRight size={17} className="group-hover:translate-x-1 transition-transform" />
                </button>

                <a
                  href="tel:0902809929"
                  className="inline-flex items-center justify-center gap-2 text-xs font-semibold text-[#000000]/80 hover:text-[#ed7328] px-4 py-2.5 transition-colors"
                >
                  <Phone size={14} className="text-[#ed7328]" />
                  <span>Hotline: 090 280 99 29</span>
                </a>
              </div>
            </div>

            {/* Bottom Trust Indicators (Image B details) */}
            <div className="pt-5 sm:pt-6 border-t border-[#d2b68c]/30 grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 text-xs text-[#000000]/75">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-[#234386]/10 text-[#234386] flex items-center justify-center shrink-0">
                  <Users size={16} />
                </div>
                <span>Phù hợp cho nhóm, gia đình, sự kiện nhỏ</span>
              </div>

              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-[#ed7328]/15 text-[#ed7328] flex items-center justify-center shrink-0">
                  <HeartHandshake size={16} />
                </div>
                <span>Không gian ấm cúng, phục vụ tận tâm</span>
              </div>
            </div>

          </div>

        </div>

      </div>

      {/* ========================================================================= */}
      {/* INTERACTIVE BOOKING FORM MODAL */}
      {/* ========================================================================= */}
      {showFormModal && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4"
          onClick={() => setShowFormModal(false)}
        >
          <div
            className="bg-white rounded-[24px] sm:rounded-[32px] max-w-xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-[#d2b68c]/40 p-5 sm:p-8 animate-in fade-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            
            {isSubmitted ? (
              /* Confirmation Ticket */
              <div className="text-center py-6 space-y-5 animate-in fade-in duration-200">
                <div className="w-16 h-16 rounded-full bg-[#a2d3a6]/30 text-[#234386] flex items-center justify-center mx-auto">
                  <CheckCircle size={40} className="text-[#234386]" />
                </div>
                <div className="space-y-1">
                  <span className="font-['Be_Vietnam_Pro',sans-serif] text-xs font-semibold text-[#ed7328] uppercase tracking-widest">
                    ĐÃ XÁC NHẬN GIỮ CHỖ
                  </span>
                  <h3 className="font-['Noto_Serif',serif] text-2xl font-bold text-[#000000]">
                    Hẹn gặp bạn, {fullName}!
                  </h3>
                  <p className="text-xs text-[#000000]/70 max-w-xs mx-auto">
                    Mã đặt bàn đã được gửi tin nhắn tới <strong className="text-black">{phone}</strong>.
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-[#fbf9f6] border border-[#d2b68c]/35 text-xs text-left space-y-2">
                  <div className="flex justify-between pb-2 border-b border-[#d2b68c]/25">
                    <span className="text-[#000000]/60">Mã đặt bàn:</span>
                    <span className="font-['Be_Vietnam_Pro',sans-serif] font-semibold text-[#234386] text-sm tracking-[0.08em] uppercase tabular-nums">{bookingCode}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#000000]/60">Thời gian:</span>
                    <span className="font-semibold">{timeSlot} · {date}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#000000]/60">Số khách:</span>
                    <span className="font-semibold">{guestCount} người</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#000000]/60">Khu vực:</span>
                    <span className="font-semibold">
                      {seatingArea === 'window'
                        ? 'Cửa sổ view phố'
                        : seatingArea === 'indoor'
                        ? 'Trong nhà ấm cúng'
                        : seatingArea === 'balcony'
                        ? 'Ban công ngoài trời'
                        : 'Phòng riêng VIP'}
                    </span>
                  </div>
                  {note && (
                    <div className="pt-2 border-t border-[#d2b68c]/20 text-[11px] text-[#000000]/70">
                      <strong>Ghi chú:</strong> {note}
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleReset}
                  className="px-6 py-2.5 rounded-full bg-[#234386] text-white text-xs font-semibold shadow-xs hover:bg-[#1a3468]"
                >
                  Hoàn tất & Đóng
                </button>
              </div>
            ) : (
              /* Booking Form */
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="flex items-center justify-between pb-3 border-b border-[#d2b68c]/30">
                  <div>
                    <h3 className="font-['Noto_Serif',serif] text-xl font-bold text-[#234386]">
                      Đặt Bàn Trực Tuyến
                    </h3>
                    <p className="text-xs text-[#000000]/60">
                      Tiger 345 Contemporary Bistro · Vĩnh An, Đồng Nai
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowFormModal(false)}
                    className="w-8 h-8 rounded-full bg-[#fbf9f6] text-[#000000]/60 flex items-center justify-center hover:bg-black/5"
                  >
                    ✕
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-[#000000]/80 mb-1">
                      Họ và tên *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Nguyễn Văn A"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-[#d2b68c]/40 bg-[#fbf9f6] focus:outline-none focus:border-[#234386] focus:bg-white max-md:min-h-[44px] max-md:text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#000000]/80 mb-1">
                      Số điện thoại *
                    </label>
                    <input
                      type="tel"
                      required
                      placeholder="090 280 99 29"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-[#d2b68c]/40 bg-[#fbf9f6] focus:outline-none focus:border-[#234386] focus:bg-white max-md:min-h-[44px] max-md:text-sm"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-[#000000]/80 mb-1 flex items-center gap-1">
                      <Calendar size={13} className="text-[#ed7328]" />
                      <span>Ngày đến *</span>
                    </label>
                    <input
                      type="date"
                      required
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-[#d2b68c]/40 bg-[#fbf9f6] focus:outline-none focus:border-[#234386] max-md:min-h-[44px] max-md:text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#000000]/80 mb-1 flex items-center gap-1">
                      <Users size={13} className="text-[#ed7328]" />
                      <span>Số lượng khách *</span>
                    </label>
                    <select
                      value={guestCount}
                      onChange={(e) => setGuestCount(e.target.value)}
                      className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-[#d2b68c]/40 bg-[#fbf9f6] focus:outline-none focus:border-[#234386] max-md:min-h-[44px] max-md:text-sm"
                    >
                      <option value="2">2 khách (Bàn đôi)</option>
                      <option value="4">4 khách (Bàn tiêu chuẩn)</option>
                      <option value="6">6 khách (Nhóm gia đình)</option>
                      <option value="8">8-10 khách (Tiệc đông)</option>
                      <option value="12">Trên 10 khách</option>
                    </select>
                  </div>
                </div>

                {/* Seating Preference Selector */}
                <div>
                  <label className="block text-xs font-semibold text-[#000000]/80 mb-1">
                    Khu vực ngồi ưu tiên
                  </label>
                  <select
                    value={seatingArea}
                    onChange={(e) => setSeatingArea(e.target.value)}
                    className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-[#d2b68c]/40 bg-[#fbf9f6] focus:outline-none focus:border-[#234386] max-md:min-h-[44px] max-md:text-sm"
                  >
                    <option value="window">Bàn cửa sổ thoáng đãng</option>
                    <option value="indoor">Trong nhà ấm cúng & gần quầy bar</option>
                    <option value="balcony">Ban công sân vườn thoáng mát</option>
                    <option value="vip">Phòng tiệc riêng tư (VIP)</option>
                  </select>
                </div>

                {/* Time Slot Picker */}
                <div>
                  <label className="block text-xs font-semibold text-[#000000]/80 mb-1.5 flex items-center gap-1">
                    <Clock size={13} className="text-[#ed7328]" />
                    <span>Khung giờ đến *</span>
                  </label>
                  <div className="grid grid-cols-4 sm:grid-cols-5 gap-1.5">
                    {timeSlots.map((slot) => (
                      <button
                        key={slot}
                        type="button"
                        onClick={() => setTimeSlot(slot)}
                        className={`py-2 sm:py-1.5 text-xs sm:text-[11px] font-semibold rounded-lg transition-all border active:scale-95 max-md:min-h-[44px] ${
                          timeSlot === slot
                            ? 'bg-[#234386] text-white border-[#234386]'
                            : 'bg-[#fbf9f6] text-[#000000]/75 border-[#d2b68c]/30 hover:border-[#ed7328]'
                        }`}
                      >
                        {slot}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Note */}
                <div>
                  <label className="block text-xs font-semibold text-[#000000]/80 mb-1">
                    Ghi chú cho bếp (Tùy chọn)
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Ví dụ: Kỷ niệm ngày cưới, cần góc yên tĩnh, dị ứng..."
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    className="w-full text-sm sm:text-xs px-3.5 py-2 rounded-xl border border-[#d2b68c]/40 bg-[#fbf9f6] focus:outline-none focus:border-[#234386] max-md:min-h-[44px]"
                  />
                </div>

                {/* Submit */}
                <div className="pt-2">
                  <button
                    type="submit"
                    className="w-full py-3.5 sm:py-3 rounded-full bg-[#ed7328] hover:bg-[#d86218] text-white font-semibold text-sm sm:text-xs shadow-sm active:scale-95 transition-all"
                  >
                    Xác nhận đặt bàn ngay
                  </button>
                </div>
              </form>
            )}

          </div>
        </div>
      )}

    </section>
  );
};
