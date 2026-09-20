import { useState, useId, type FC, type FormEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Clock,
  Users,
  Phone,
  ArrowRight,
  HeartHandshake,
  ShieldCheck,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react';
import { getVietnamNow, validatePhoneNumber, validateReservationDateTime } from '@/lib/validation';
import { Field } from '@/components/ui/Field';
import { useCatalog } from '@/features/catalog';
import { submitReservation, type ReservationReceipt } from '@/features/reservations';

export const ReservationPage: FC = () => {
  const location = useLocation();
  const dishNameFromState = (location.state as { dishName?: string } | null)?.dishName;
  const initialNote = dishNameFromState ? `Thực khách mong muốn thưởng thức món: ${dishNameFromState}` : '';

  const { settings } = useCatalog();
  const seatingAreas = settings?.seating_areas || [];

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [date, setDate] = useState(() => getVietnamNow().isoDate);
  const [timeSlot, setTimeSlot] = useState('18:30');
  const [guestCount, setGuestCount] = useState('4');
  const [seatingAreaId, setSeatingAreaId] = useState<string>('');
  const [note, setNote] = useState(initialNote);

  const [receipt, setReceipt] = useState<ReservationReceipt | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);

  // Stable idempotency key for retries on identical input
  const defaultKeyId = useId();
  const [idempotencyKey, setIdempotencyKey] = useState<string>(() => `idemp-resv-${Date.now()}-${defaultKeyId.replace(/[^a-zA-Z0-9]/g, '')}`);

  const timeSlots = [
    '11:00', '11:30', '12:00', '12:30', '13:00', '13:30',
    '17:30', '18:00', '18:30', '19:00', '19:30', '20:00', '20:30', '21:00'
  ];

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setValidationError(null);
    setApiError(null);

    const trimmedName = fullName.trim();
    if (!trimmedName) {
      setValidationError('Vui lòng nhập họ và tên của quý khách.');
      return;
    }

    const phoneValidation = validatePhoneNumber(phone);
    if (!phoneValidation.isValid) {
      setValidationError(phoneValidation.error || 'Số điện thoại liên hệ không hợp lệ.');
      return;
    }

    const dateTimeValidation = validateReservationDateTime(date, timeSlot);
    if (!dateTimeValidation.isValid) {
      setValidationError(dateTimeValidation.error || 'Thời gian đặt bàn không hợp lệ.');
      return;
    }

    const guests = parseInt(guestCount, 10);
    if (isNaN(guests) || guests < 1 || guests > 30) {
      setValidationError('Số lượng khách đặt bàn phải từ 1 đến 30 người.');
      return;
    }

    // Convert local VN datetime (UTC+7) to ISO 8601 UTC string
    const startsAtIso = new Date(`${date}T${timeSlot}:00+07:00`).toISOString();

    try {
      setIsSubmitting(true);
      const res = await submitReservation(
        {
          customer_name: trimmedName,
          customer_phone: phoneValidation.normalized || phone.trim(),
          starts_at: startsAtIso,
          guest_count: guests,
          seating_area_id: seatingAreaId || null,
          note: note.trim() || undefined,
        },
        idempotencyKey
      );

      setReceipt(res);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Không thể gửi yêu cầu đặt bàn';
      if (msg.includes('RESERVATION_NOTICE_TOO_SHORT')) {
        setApiError('Quán cần tối thiểu 30 phút để chuẩn bị. Vui lòng chọn giờ hẹn muộn hơn.');
      } else if (msg.includes('RESERVATION_TOO_FAR_AHEAD')) {
        setApiError('Quán chỉ nhận đặt bàn trước tối đa 30 ngày.');
      } else if (msg.includes('SERVICE_CLOSED')) {
        setApiError('Nhà hàng đóng cửa trong ngày hoặc khung giờ này. Vui lòng chọn ngày khác.');
      } else if (msg.includes('OUTSIDE_RESERVATION_HOURS')) {
        setApiError('Khung giờ nhận đặt bàn là từ 10:30 đến 21:00.');
      } else {
        setApiError(msg);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReset = () => {
    setReceipt(null);
    setValidationError(null);
    setApiError(null);
    // Refresh idempotency key for new reservation
    setIdempotencyKey(`idemp-resv-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);
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
                  <a href="tel:0902809929" className="font-semibold text-[#234386] hover:text-[#ed7328] transition-colors">
                    090 280 99 29
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

              {receipt ? (
                /* Honest Receipt & Pending Status Display */
                <div className="py-6 text-center space-y-6 animate-in fade-in zoom-in-95 duration-200">
                  <div className="w-16 h-16 rounded-full bg-amber-500/15 text-amber-600 flex items-center justify-center mx-auto">
                    <CheckCircle2 size={36} className="text-amber-600" />
                  </div>

                  <div className="space-y-2">
                    <span className="font-['Be_Vietnam_Pro',sans-serif] text-xs font-semibold text-amber-600 uppercase tracking-widest">
                      ĐÃ TIẾP NHẬN YÊU CẦU ĐẶT BÀN
                    </span>
                    <h3 className="font-['Noto_Serif',serif] text-2xl sm:text-3xl font-bold text-[#234386]">
                      Cảm ơn quý khách, {receipt.customer_name}!
                    </h3>
                    <p className="text-xs sm:text-sm text-[#000000]/75 max-w-md mx-auto leading-relaxed">
                      Yêu cầu của bạn đang ở trạng thái <strong className="text-amber-700">Chờ nhà hàng xác nhận</strong>. Nhà hàng sẽ liên hệ qua số điện thoại của bạn để chốt bàn trước giờ hẹn.
                    </p>
                  </div>

                  {/* Summary Ticket Card */}
                  <div className="p-5 sm:p-6 rounded-2xl bg-[#fbf9f6] border border-[#d2b68c]/40 text-xs sm:text-sm text-left space-y-3 max-w-md mx-auto">
                    <div className="flex justify-between items-center pb-3 border-b border-[#d2b68c]/25">
                      <span className="text-[#000000]/60">Mã đặt bàn:</span>
                      <strong className="text-[#ed7328] font-mono text-base font-bold">{receipt.code}</strong>
                    </div>

                    <div className="flex justify-between items-center">
                      <span className="text-[#000000]/60">Khách hàng:</span>
                      <strong className="text-[#234386] font-semibold">{receipt.customer_name} · {receipt.customer_phone}</strong>
                    </div>

                    <div className="flex justify-between">
                      <span className="text-[#000000]/60">Thời gian dùng bữa:</span>
                      <strong className="text-[#000000]">
                        {new Date(receipt.starts_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' })} · {new Date(receipt.starts_at).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}
                      </strong>
                    </div>

                    <div className="flex justify-between">
                      <span className="text-[#000000]/60">Số lượng khách:</span>
                      <strong className="text-[#000000]">{receipt.guest_count} người</strong>
                    </div>

                    <div className="flex justify-between">
                      <span className="text-[#000000]/60">Khu vực ưu tiên:</span>
                      <strong className="text-[#234386]">
                        {receipt.area_name_snapshot || 'Tùy chọn quán'}
                      </strong>
                    </div>

                    {receipt.note && (
                      <div className="pt-2.5 border-t border-[#d2b68c]/20 text-xs text-[#000000]/70">
                        <strong>Ghi chú:</strong> {receipt.note}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
                    <a
                      href="tel:0902809929"
                      className="w-full sm:w-auto px-6 py-3 rounded-full bg-[#ed7328] hover:bg-[#d86218] text-white text-xs font-semibold shadow-md active:scale-95 transition-all flex items-center justify-center gap-2"
                    >
                      <Phone size={14} />
                      <span>Hotline: 090 280 99 29</span>
                    </a>
                    <button
                      type="button"
                      onClick={handleReset}
                      className="w-full sm:w-auto px-6 py-3 rounded-full border border-[#d2b68c] hover:border-[#234386] text-[#234386] text-xs font-semibold active:scale-95 transition-all cursor-pointer"
                    >
                      Đặt thêm bàn khác
                    </button>
                    <Link
                      to="/menu"
                      className="w-full sm:w-auto px-6 py-3 rounded-full border border-[#d2b68c] hover:border-[#ed7328] text-[#234386] hover:text-[#ed7328] text-xs font-semibold active:scale-95 transition-all text-center"
                    >
                      Xem thực đơn
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
                    <div role="alert" className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs font-semibold text-red-600 flex items-center gap-2 animate-in fade-in duration-150">
                      <AlertCircle size={15} className="shrink-0" />
                      <span>{validationError}</span>
                    </div>
                  )}

                  {apiError && (
                    <div role="alert" className="p-3.5 rounded-xl bg-amber-50 border border-amber-300 text-xs font-semibold text-amber-800 flex items-center gap-2 animate-in fade-in duration-150">
                      <AlertCircle size={15} className="shrink-0" />
                      <span>{apiError}</span>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field label="Họ và tên quý khách" required>
                      <input
                        type="text"
                        required
                        placeholder="Ví dụ: Nguyễn Văn A"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        className="w-full text-sm sm:text-xs px-4 py-3 rounded-xl border border-[#d2b68c]/50 bg-[#fbf9f6] focus:outline-none focus:border-[#234386] focus:bg-white transition-colors"
                      />
                    </Field>

                    <Field label="Số điện thoại liên hệ" required hint="Số di động 10 chữ số tại Việt Nam">
                      <input
                        type="tel"
                        required
                        placeholder="Ví dụ: 090 280 99 29"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        className="w-full text-sm sm:text-xs px-4 py-3 rounded-xl border border-[#d2b68c]/50 bg-[#fbf9f6] focus:outline-none focus:border-[#234386] focus:bg-white transition-colors"
                      />
                    </Field>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field label="Ngày dùng bữa" required>
                      <input
                        type="date"
                        required
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                        className="w-full text-sm sm:text-xs px-4 py-3 rounded-xl border border-[#d2b68c]/50 bg-[#fbf9f6] focus:outline-none focus:border-[#234386] focus:bg-white transition-colors"
                      />
                    </Field>

                    <Field label="Số lượng khách (1 – 30 khách)" required>
                      <select
                        value={guestCount}
                        onChange={(e) => setGuestCount(e.target.value)}
                        className="w-full text-sm sm:text-xs px-4 py-3 rounded-xl border border-[#d2b68c]/50 bg-[#fbf9f6] focus:outline-none focus:border-[#234386] focus:bg-white transition-colors"
                      >
                        {[...Array(30)].map((_, i) => (
                          <option key={i + 1} value={String(i + 1)}>
                            {i + 1} khách {i === 1 ? '(Bàn đôi)' : i === 3 ? '(Bàn tiêu chuẩn)' : i >= 9 ? '(Tiệc đông)' : ''}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </div>

                  {/* Seating Preference Selector */}
                  <Field label="Khu vực ngồi ưu tiên">
                    <select
                      value={seatingAreaId}
                      onChange={(e) => setSeatingAreaId(e.target.value)}
                      className="w-full text-sm sm:text-xs px-4 py-3 rounded-xl border border-[#d2b68c]/50 bg-[#fbf9f6] focus:outline-none focus:border-[#234386] focus:bg-white transition-colors"
                    >
                      <option value="">Tùy chọn quán sắp xếp bàn thuận tiện nhất</option>
                      {seatingAreas.map((area) => (
                        <option key={area.id} value={area.id}>
                          {area.name}
                        </option>
                      ))}
                    </select>
                  </Field>

                  {/* Time Slot Picker */}
                  <div>
                    <label className="block text-xs font-semibold text-[#000000]/80 mb-2 flex items-center gap-1">
                      <Clock size={13} className="text-[#ed7328]" />
                      <span>Chọn khung giờ đến *</span>
                    </label>
                    <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
                      {timeSlots.map((slot) => (
                        <button
                          key={slot}
                          type="button"
                          onClick={() => setTimeSlot(slot)}
                          className={`py-2 text-xs font-semibold rounded-xl transition-all border active:scale-95 cursor-pointer ${
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
                  <Field label="Ghi chú hoặc mong muốn đặc biệt (món ăn ưa thích, dịp kỷ niệm, dị ứng...)">
                    <textarea
                      rows={3}
                      placeholder="Ví dụ: Kỷ niệm ngày cưới cần hoa tươi, có trẻ em cần ghế dặm, ăn ít cay..."
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      className="w-full text-sm sm:text-xs px-4 py-3 rounded-xl border border-[#d2b68c]/50 bg-[#fbf9f6] focus:outline-none focus:border-[#234386] focus:bg-white transition-colors"
                    />
                  </Field>

                  {/* Submit Button */}
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full py-4 rounded-full bg-[#ed7328] hover:bg-[#d86218] text-white font-semibold text-sm sm:text-base shadow-lg active:scale-98 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
                  >
                    {isSubmitting ? (
                      <>
                        <RefreshCw size={17} className="animate-spin" />
                        <span>Đang gửi yêu cầu đặt bàn...</span>
                      </>
                    ) : (
                      <>
                        <span>Gửi yêu cầu đặt bàn</span>
                        <ArrowRight size={17} />
                      </>
                    )}
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
