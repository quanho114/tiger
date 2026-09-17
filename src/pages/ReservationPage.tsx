import { useState, type FC, type FormEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { 
  Calendar, 
  Clock, 
  Users, 
  CheckCircle, 
  Phone, 
  ArrowRight,
  HeartHandshake,
  ShieldCheck,
  Sparkles
} from 'lucide-react';

export const ReservationPage: FC = () => {
  const location = useLocation();
  const dishNameFromState = (location.state as { dishName?: string } | null)?.dishName;
  const initialNote = dishNameFromState ? `Thực khách mong muốn thưởng thức món: ${dishNameFromState}` : '';

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [timeSlot, setTimeSlot] = useState('18:30');
  const [guestCount, setGuestCount] = useState('4');
  const [seatingArea, setSeatingArea] = useState('window');
  const [note, setNote] = useState(initialNote);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [bookingCode, setBookingCode] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  const timeSlots = [
    '11:30', '12:00', '12:30', '13:00',
    '17:30', '18:00', '18:30', '19:00', '19:30', '20:00', '20:30'
  ];

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    if (!fullName.trim()) {
      setValidationError('Vui lòng nhập họ và tên của quý khách.');
      return;
    }
    if (!phone.trim() || phone.trim().length < 9) {
      setValidationError('Vui lòng nhập số điện thoại liên hệ hợp lệ (tối thiểu 9 số).');
      return;
    }
    if (!date) {
      setValidationError('Vui lòng chọn ngày dùng bữa.');
      return;
    }

    const code = 'TG-' + Math.floor(100000 + Math.random() * 900000);
    setBookingCode(code);
    setIsSubmitted(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleReset = () => {
    setIsSubmitted(false);
    setFullName('');
    setPhone('');
    setNote('');
    setValidationError(null);
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
              ĐẶT BÀN TRỰC TUYẾN
            </span>
            <span className="w-8 h-[1.5px] bg-[#d2b68c]" />
          </div>
          <h1 className="font-['Noto_Serif',serif] text-3xl sm:text-4xl lg:text-[44px] font-bold text-[#234386] tracking-tight leading-tight">
            Biến bữa ăn thường ngày thành khoảnh khắc đặc biệt
          </h1>
          <p className="font-['Be_Vietnam_Pro',sans-serif] text-[#000000]/70 text-sm sm:text-base mt-2.5 font-normal leading-relaxed">
            Chọn thời gian và vị trí ngồi ưng ý, Tiger 345 sẽ chuẩn bị chu đáo để chào đón bạn và những người thân yêu.
          </p>
        </div>

        {/* ========================================================================= */}
        {/* MAIN SPLIT COMPOSITION: EDITORIAL LEFT + INTERACTIVE FORM RIGHT */}
        {/* ========================================================================= */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-start">
          
          {/* Left Column: Atmospheric Dining Photo & Practical Info */}
          <div className="lg:col-span-5 space-y-6">
            
            {/* Visual Photo Card */}
            <div className="relative rounded-[28px] sm:rounded-[36px] overflow-hidden shadow-xl border border-[#d2b68c]/35 aspect-[4/3] sm:aspect-[16/11] lg:aspect-[4/5] bg-[#234386]/10">
              <img
                src="https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1000&q=85"
                alt="Không gian ẩm thực ấm áp tại Tiger 345"
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-transparent" />
              
              <div className="absolute top-6 left-6 font-['Dancing_Script',cursive] text-2xl sm:text-3xl text-white font-semibold leading-none drop-shadow-md">
                More Good Meals<br />Together ♡
              </div>

              <div className="absolute bottom-6 left-6 right-6 text-white space-y-2">
                <span className="font-['Be_Vietnam_Pro',sans-serif] inline-block px-3 py-1 rounded-full bg-[#ed7328] text-white font-semibold text-[10px] uppercase tracking-wider shadow-xs">
                  Không gian tinh tế
                </span>
                <p className="font-['Noto_Serif',serif] text-base sm:text-lg font-bold text-white drop-shadow-sm leading-snug">
                  Ánh sáng êm dịu, bàn tiệc hoa tươi & khoảng cách riêng tư cho cuộc hẹn ý nghĩa.
                </p>
              </div>
            </div>

            {/* Practical Service Information Card */}
            <div className="p-6 rounded-[24px] bg-white border border-[#d2b68c]/35 shadow-sm space-y-4 text-xs sm:text-sm text-[#000000]/80">
              <h4 className="font-['Noto_Serif',serif] text-base font-bold text-[#234386] pb-2 border-b border-[#d2b68c]/25">
                Thông tin & Lưu ý khi đặt bàn
              </h4>

              <div className="flex items-start gap-3">
                <div className="w-7 h-7 rounded-full bg-[#ed7328]/15 text-[#ed7328] flex items-center justify-center shrink-0 mt-0.5">
                  <Clock size={15} />
                </div>
                <div>
                  <strong className="block text-[#000000]">Giờ phục vụ dùng bữa</strong>
                  <span>10:30 – 14:00 (Trưa) & 17:30 – 22:30 (Tối)</span>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-7 h-7 rounded-full bg-[#234386]/10 text-[#234386] flex items-center justify-center shrink-0 mt-0.5">
                  <Phone size={15} />
                </div>
                <div>
                  <strong className="block text-[#000000]">Hotline hỗ trợ tức thì</strong>
                  <a href="tel:0908123456" className="font-semibold text-[#234386] hover:text-[#ed7328] transition-colors">
                    0908 123 456
                  </a>
                  <span className="block text-xs text-[#000000]/60">(Hỗ trợ đặt bàn tiệc đông người hoặc yêu cầu gấp)</span>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-7 h-7 rounded-full bg-[#3d5a45]/15 text-[#3d5a45] flex items-center justify-center shrink-0 mt-0.5">
                  <Sparkles size={15} />
                </div>
                <div>
                  <strong className="block text-[#000000]">Lưu ý giờ cao điểm</strong>
                  <span className="text-xs text-[#000000]/70">
                    Bàn được giữ tối đa 15 phút sau giờ hẹn. Quý khách vui lòng đến đúng giờ để có trải nghiệm trọn vẹn nhất.
                  </span>
                </div>
              </div>
            </div>

            {/* Trust Badges */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-xs text-[#000000]/75">
              <div className="p-3.5 rounded-2xl bg-white/70 border border-[#d2b68c]/30 flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-[#234386]/10 text-[#234386] flex items-center justify-center shrink-0">
                  <Users size={16} />
                </div>
                <span>Phù hợp cặp đôi, nhóm bạn & gia đình</span>
              </div>

              <div className="p-3.5 rounded-2xl bg-white/70 border border-[#d2b68c]/30 flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-[#ed7328]/15 text-[#ed7328] flex items-center justify-center shrink-0">
                  <HeartHandshake size={16} />
                </div>
                <span>Tư vấn thực đơn & trang trí sự kiện nhỏ</span>
              </div>
            </div>

          </div>

          {/* Right Column: Interactive Booking Form */}
          <div className="lg:col-span-7">
            <div className="bg-white rounded-[28px] sm:rounded-[36px] border border-[#d2b68c]/35 shadow-xl p-6 sm:p-10">
              
              {isSubmitted ? (
                /* Confirmation Ticket View */
                <div className="py-8 text-center space-y-6 animate-in fade-in zoom-in-95 duration-200">
                  <div className="w-16 h-16 rounded-full bg-[#a2d3a6]/30 text-[#234386] flex items-center justify-center mx-auto">
                    <CheckCircle size={44} className="text-[#234386]" />
                  </div>

                  <div className="space-y-1.5">
                    <span className="font-['Be_Vietnam_Pro',sans-serif] text-xs font-semibold text-[#ed7328] uppercase tracking-widest">
                      XÁC NHẬN GIỮ CHỖ THÀNH CÔNG
                    </span>
                    <h3 className="font-['Noto_Serif',serif] text-2xl sm:text-3xl font-bold text-[#234386]">
                      Hẹn gặp bạn, {fullName}!
                    </h3>
                    <p className="text-xs sm:text-sm text-[#000000]/70 max-w-sm mx-auto leading-relaxed">
                      Mã xác nhận đặt bàn đã được ghi nhận. Nhà hàng sẽ liên hệ xác nhận qua số điện thoại <strong className="text-black">{phone}</strong>.
                    </p>
                  </div>

                  {/* Summary Ticket Card */}
                  <div className="p-5 sm:p-6 rounded-2xl bg-[#fbf9f6] border border-[#d2b68c]/40 text-xs sm:text-sm text-left space-y-3 max-w-md mx-auto">
                    <div className="flex justify-between items-center pb-3 border-b border-[#d2b68c]/25">
                      <span className="text-[#000000]/60">Mã đặt bàn:</span>
                      <span className="font-['Be_Vietnam_Pro',sans-serif] font-bold text-[#234386] text-base tracking-wider tabular-nums">
                        {bookingCode}
                      </span>
                    </div>

                    <div className="flex justify-between">
                      <span className="text-[#000000]/60">Thời gian dùng bữa:</span>
                      <strong className="text-[#000000]">{timeSlot} · {date}</strong>
                    </div>

                    <div className="flex justify-between">
                      <span className="text-[#000000]/60">Số lượng khách:</span>
                      <strong className="text-[#000000]">{guestCount} người</strong>
                    </div>

                    <div className="flex justify-between">
                      <span className="text-[#000000]/60">Khu vực bàn:</span>
                      <strong className="text-[#234386]">
                        {seatingArea === 'window'
                          ? 'Cửa sổ view phố Tràng Tiền'
                          : seatingArea === 'indoor'
                          ? 'Trong nhà ấm cúng & gần quầy bar'
                          : seatingArea === 'balcony'
                          ? 'Ban công sân vườn thoáng mát'
                          : 'Phòng tiệc riêng tư (VIP)'}
                      </strong>
                    </div>

                    {note && (
                      <div className="pt-2.5 border-t border-[#d2b68c]/20 text-xs text-[#000000]/70">
                        <strong>Ghi chú:</strong> {note}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
                    <button
                      type="button"
                      onClick={handleReset}
                      className="w-full sm:w-auto px-8 py-3 rounded-full bg-[#234386] hover:bg-[#1a3468] text-white text-xs font-semibold shadow-xs active:scale-95 transition-all"
                    >
                      Đặt thêm bàn khác
                    </button>
                    <Link
                      to="/menu"
                      className="w-full sm:w-auto px-8 py-3 rounded-full border border-[#d2b68c] hover:border-[#ed7328] text-[#234386] hover:text-[#ed7328] text-xs font-semibold active:scale-95 transition-all"
                    >
                      Xem trước thực đơn món
                    </Link>
                  </div>
                </div>
              ) : (
                /* Interactive Booking Form */
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div>
                    <h3 className="font-['Noto_Serif',serif] text-2xl font-bold text-[#234386]">
                      Thông tin đặt bàn
                    </h3>
                    <p className="text-xs sm:text-sm text-[#000000]/60 mt-1">
                      Vui lòng cung cấp thông tin để chúng tôi phục vụ chu đáo nhất.
                    </p>
                  </div>

                  {validationError && (
                    <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs font-semibold text-red-600 animate-in fade-in duration-150">
                      {validationError}
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-[#000000]/80 mb-1.5">
                        Họ và tên quý khách *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="Ví dụ: Nguyễn Văn A"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        className="w-full text-sm sm:text-xs px-4 py-3 rounded-xl border border-[#d2b68c]/50 bg-[#fbf9f6] focus:outline-none focus:border-[#234386] focus:bg-white transition-colors"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-[#000000]/80 mb-1.5">
                        Số điện thoại liên hệ *
                      </label>
                      <input
                        type="tel"
                        required
                        placeholder="Ví dụ: 0908 123 456"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        className="w-full text-sm sm:text-xs px-4 py-3 rounded-xl border border-[#d2b68c]/50 bg-[#fbf9f6] focus:outline-none focus:border-[#234386] focus:bg-white transition-colors"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-[#000000]/80 mb-1.5 flex items-center gap-1">
                        <Calendar size={13} className="text-[#ed7328]" />
                        <span>Ngày dùng bữa *</span>
                      </label>
                      <input
                        type="date"
                        required
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                        className="w-full text-sm sm:text-xs px-4 py-3 rounded-xl border border-[#d2b68c]/50 bg-[#fbf9f6] focus:outline-none focus:border-[#234386] focus:bg-white transition-colors"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-[#000000]/80 mb-1.5 flex items-center gap-1">
                        <Users size={13} className="text-[#ed7328]" />
                        <span>Số lượng khách *</span>
                      </label>
                      <select
                        value={guestCount}
                        onChange={(e) => setGuestCount(e.target.value)}
                        className="w-full text-sm sm:text-xs px-4 py-3 rounded-xl border border-[#d2b68c]/50 bg-[#fbf9f6] focus:outline-none focus:border-[#234386] focus:bg-white transition-colors"
                      >
                        <option value="2">2 khách (Bàn đôi thân mật)</option>
                        <option value="4">4 khách (Bàn tiêu chuẩn)</option>
                        <option value="6">6 khách (Nhóm gia đình nhỏ)</option>
                        <option value="8">8 khách (Gia đình hoặc bạn bè)</option>
                        <option value="10">10-12 khách (Tiệc đông)</option>
                        <option value="15">Trên 15 khách (Sự kiện riêng)</option>
                      </select>
                    </div>
                  </div>

                  {/* Seating Preference Selector */}
                  <div>
                    <label className="block text-xs font-semibold text-[#000000]/80 mb-1.5">
                      Khu vực ngồi ưu tiên
                    </label>
                    <select
                      value={seatingArea}
                      onChange={(e) => setSeatingArea(e.target.value)}
                      className="w-full text-sm sm:text-xs px-4 py-3 rounded-xl border border-[#d2b68c]/50 bg-[#fbf9f6] focus:outline-none focus:border-[#234386] focus:bg-white transition-colors"
                    >
                      <option value="window">Bàn bên ô cửa sổ nhìn ra phố Tràng Tiền</option>
                      <option value="indoor">Không gian trong nhà ấm áp, ánh sáng êm dịu</option>
                      <option value="balcony">Ban công thoáng mát nhiều mảng xanh</option>
                      <option value="vip">Phòng tiệc riêng tư cho gia đình/đối tác (VIP)</option>
                    </select>
                  </div>

                  {/* Time Slot Picker */}
                  <div>
                    <label className="block text-xs font-semibold text-[#000000]/80 mb-2 flex items-center gap-1">
                      <Clock size={13} className="text-[#ed7328]" />
                      <span>Chọn khung giờ đến *</span>
                    </label>
                    <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                      {timeSlots.map((slot) => (
                        <button
                          key={slot}
                          type="button"
                          onClick={() => setTimeSlot(slot)}
                          className={`py-2 text-xs font-semibold rounded-xl transition-all border active:scale-95 ${
                            timeSlot === slot
                              ? 'bg-[#234386] text-white border-[#234386] shadow-xs'
                              : 'bg-[#fbf9f6] text-[#000000]/75 border-[#d2b68c]/35 hover:border-[#ed7328]'
                          }`}
                        >
                          {slot}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Special Requests */}
                  <div>
                    <label className="block text-xs font-semibold text-[#000000]/80 mb-1.5">
                      Ghi chú hoặc mong muốn đặc biệt (món ăn ưa thích, dịp kỷ niệm, dị ứng...)
                    </label>
                    <textarea
                      rows={3}
                      placeholder="Ví dụ: Kỷ niệm ngày cưới cần hoa tươi, có trẻ em cần ghế dặm, ăn ít cay..."
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      className="w-full text-sm sm:text-xs px-4 py-3 rounded-xl border border-[#d2b68c]/50 bg-[#fbf9f6] focus:outline-none focus:border-[#234386] focus:bg-white transition-colors"
                    />
                  </div>

                  {/* Submit Button */}
                  <button
                    type="submit"
                    className="w-full py-4 rounded-full bg-[#ed7328] hover:bg-[#d86218] text-white font-semibold text-sm sm:text-base shadow-lg active:scale-98 transition-all flex items-center justify-center gap-2"
                  >
                    <span>Xác nhận đặt bàn trực tuyến</span>
                    <ArrowRight size={17} />
                  </button>

                  <div className="flex items-center justify-center gap-1.5 text-xs text-[#000000]/55 pt-1">
                    <ShieldCheck size={14} className="text-[#3d5a45]" />
                    <span>Không yêu cầu đặt cọc trước · Hỗ trợ đổi giờ linh hoạt</span>
                  </div>
                </form>
              )}

            </div>
          </div>

        </div>

      </div>
    </div>
  );
};
