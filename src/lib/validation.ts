import { normalizeVietnamPhone, VIETNAM_PHONE_REGEX } from '@contracts/common';

export interface VietnamDateTime {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  isoDate: string; // YYYY-MM-DD
  timeString: string; // HH:mm
}

export const RESTAURANT_HOURS = {
  lunchStart: '10:30',
  lunchEnd: '14:00',
  dinnerStart: '17:30',
  dinnerEnd: '22:30',
  minAdvanceMinutes: 30,
};

/**
 * Returns current date and time in Vietnam timezone (Asia/Ho_Chi_Minh - UTC+7)
 * Never relies on local machine timezone assumptions.
 */
export function getVietnamNow(date: Date = new Date()): VietnamDateTime {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const partMap: Record<string, string> = {};
  for (const p of parts) {
    if (p.type !== 'literal') {
      partMap[p.type] = p.value;
    }
  }

  const year = parseInt(partMap.year, 10);
  const month = parseInt(partMap.month, 10);
  const day = parseInt(partMap.day, 10);
  // In 24-hour format with hour12: false, hour "24" may appear in some JS engines for midnight; normalize to 0.
  let hour = parseInt(partMap.hour, 10);
  if (hour === 24) hour = 0;
  const minute = parseInt(partMap.minute, 10);

  const pad = (n: number) => n.toString().padStart(2, '0');
  const isoDate = `${year}-${pad(month)}-${pad(day)}`;
  const timeString = `${pad(hour)}:${pad(minute)}`;

  return {
    year,
    month,
    day,
    hour,
    minute,
    isoDate,
    timeString,
  };
}

/**
 * Validates a Vietnamese phone number
 */
export function validatePhoneNumber(phone: string): {
  isValid: boolean;
  normalized?: string;
  error?: string;
} {
  const trimmed = phone.trim();
  if (!trimmed) {
    return {
      isValid: false,
      error: 'Vui lòng nhập số điện thoại liên hệ.',
    };
  }

  const normalized = normalizeVietnamPhone(trimmed);
  if (!VIETNAM_PHONE_REGEX.test(normalized)) {
    return {
      isValid: false,
      error:
        'Số điện thoại không hợp lệ. Vui lòng nhập số di động 10 chữ số tại Việt Nam (đầu số 03, 05, 07, 08, 09).',
    };
  }

  return {
    isValid: true,
    normalized,
  };
}

export const normalizePhoneNumber = normalizeVietnamPhone;

/**
 * Validates reservation date and time against restaurant operating hours and ICT time.
 * - Restaurant opening hours: 10:30-14:00 and 17:30-22:30.
 * - Disallows past dates or past times on current day.
 * - Specifically rejects any slot before 07:00 VN or outside business hours.
 */
export function validateReservationDateTime(
  dateStr: string,
  timeSlot: string,
  now: Date = new Date()
): { isValid: boolean; error?: string } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return { isValid: false, error: 'Định dạng ngày không hợp lệ (YYYY-MM-DD).' };
  }

  if (!/^\d{2}:\d{2}$/.test(timeSlot)) {
    return { isValid: false, error: 'Định dạng giờ không hợp lệ (HH:mm).' };
  }

  const [slotHourStr, slotMinStr] = timeSlot.split(':');
  const slotHour = parseInt(slotHourStr, 10);
  const slotMin = parseInt(slotMinStr, 10);

  if (slotHour < 0 || slotHour > 23 || slotMin < 0 || slotMin > 59) {
    return { isValid: false, error: 'Giờ đặt bàn không hợp lệ.' };
  }

  // Check if slot is before 07:00 VN
  if (slotHour < 7) {
    return {
      isValid: false,
      error: 'Nhà hàng không phục vụ trước 07:00 sáng. Vui lòng chọn khung giờ từ 10:30.',
    };
  }

  // Check if slot falls within restaurant operating hours
  const totalMinutes = slotHour * 60 + slotMin;
  const isLunch = totalMinutes >= 10 * 60 + 30 && totalMinutes <= 14 * 60;
  const isDinner = totalMinutes >= 17 * 60 + 30 && totalMinutes <= 22 * 60 + 30;

  if (!isLunch && !isDinner) {
    return {
      isValid: false,
      error:
        'Khung giờ không nằm trong giờ phục vụ. Nhà hàng mở cửa Trưa: 10:30 – 14:00 và Tối: 17:30 – 22:30.',
    };
  }

  const vnNow = getVietnamNow(now);

  // Check if date is in the past
  if (dateStr < vnNow.isoDate) {
    return {
      isValid: false,
      error: 'Không thể đặt bàn cho ngày trong quá khứ.',
    };
  }

  // If date is today, check if time has already passed or is within 30 min advance window
  if (dateStr === vnNow.isoDate) {
    const currentMinutes = vnNow.hour * 60 + vnNow.minute;
    if (totalMinutes < currentMinutes) {
      return {
        isValid: false,
        error: 'Khung giờ bạn chọn đã qua trong ngày hôm nay.',
      };
    }
    if (totalMinutes < currentMinutes + RESTAURANT_HOURS.minAdvanceMinutes) {
      return {
        isValid: false,
        error:
          'Quý khách vui lòng đặt bàn trước giờ đến ít nhất 30 phút. Nếu cần gấp, vui lòng gọi hotline 090 280 99 29.',
      };
    }
  }

  return { isValid: true };
}
