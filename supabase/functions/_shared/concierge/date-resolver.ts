/**
 * Fact-Forcing Metadata:
 * - Importers/Callers: supabase/functions/_shared/concierge/runtime.ts, supabase/functions/_shared/concierge/tools.ts, tests/server/concierge-reservation-ui.test.ts
 * - Affected API: resolveReservationDateTime, extractReservationDetails, createVnIsoString, getVnDateTimeComponents
 * - Data Schemas: ResolvedReservationDateTime, ExtractedReservationDetails
 * - Verbatim Instruction: "Resolve ngày tương đối bằng Asia/Ho_Chi_Minh và clock server; ngày giờ mơ hồ hỏi lại; xác nhận ngày tuyệt đối. Thu thập tên/phone/guests/ngày giờ thật; area/note theo policy, không fake fallback."
 */

export interface ResolvedReservationDateTime {
  success: boolean
  startsAt?: Date
  startsAtIso?: string
  startsAtFormatted?: string
  reason?: string
  missingField?: 'date' | 'time'
  isOutOfHours?: boolean
  isPast?: boolean
  isNoticeTooShort?: boolean
  isTooFarAhead?: boolean
  ambiguous?: boolean
}

export interface ExtractedReservationDetails {
  customer_name?: string
  phone?: string
  guest_count?: number
  starts_at_iso?: string
  starts_at_formatted?: string
  seating_area_name?: string
  note?: string
  missing_fields: ('customer_name' | 'phone' | 'guest_count' | 'starts_at_iso')[]
  is_complete: boolean
}

const GENERIC_NAME_REJECT_LIST = [
  'quý khách',
  'quy khach',
  'khách hàng',
  'khach hang',
  'ẩn danh',
  'an danh',
  'khách',
  'khach',
  'guest',
  'customer',
  'user',
  'người dùng',
  'nguoi dung',
  'bạn',
  'ban',
]

/**
 * Normalizes input string for accent-tolerant pattern matching.
 */
function normalizeText(text: string): string {
  return text.toLowerCase().trim()
}

/**
 * Helper to get year, month, date, weekday, hour, minute in UTC+7 (Asia/Ho_Chi_Minh).
 */
export function getVnDateTimeComponents(ref: Date): {
  year: number
  month: number // 1..12
  date: number // 1..31
  day: number // 0..6 (0 is Sunday)
  hour: number // 0..23
  minute: number // 0..59
} {
  const vnTime = new Date(ref.getTime() + 7 * 3600 * 1000)
  return {
    year: vnTime.getUTCFullYear(),
    month: vnTime.getUTCMonth() + 1,
    date: vnTime.getUTCDate(),
    day: vnTime.getUTCDay(),
    hour: vnTime.getUTCHours(),
    minute: vnTime.getUTCMinutes(),
  }
}

/**
 * Creates an ISO 8601 string in Asia/Ho_Chi_Minh (+07:00).
 */
export function createVnIsoString(
  year: number,
  month: number,
  date: number,
  hour: number,
  minute: number
): { iso: string; date: Date } {
  const pad = (n: number) => String(n).padStart(2, '0')
  const iso = `${year}-${pad(month)}-${pad(date)}T${pad(hour)}:${pad(minute)}:00+07:00`
  const epochMs = Date.UTC(year, month - 1, date, hour - 7, minute, 0)
  return { iso, date: new Date(epochMs) }
}

/**
 * Resolves natural Vietnamese date and time expressions relative to referenceDate in Asia/Ho_Chi_Minh.
 */
export function resolveReservationDateTime(
  text: string,
  referenceDate: Date = new Date()
): ResolvedReservationDateTime {
  const norm = normalizeText(text)
  const vnRef = getVnDateTimeComponents(referenceDate)

  // 1. Detect near midnight / out of hours requests immediately
  if (
    norm.includes('nửa đêm') ||
    norm.includes('nua dem') ||
    norm.includes('gần nửa đêm') ||
    norm.includes('gan nua dem') ||
    norm.includes('12h đêm') ||
    norm.includes('12h dem') ||
    norm.includes('24h') ||
    norm.includes('0h') ||
    norm.includes('23h') ||
    norm.includes('23:00')
  ) {
    return {
      success: false,
      isOutOfHours: true,
      reason:
        'Nhà hàng Tiger 345 mở cửa từ 10:30 sáng và đóng cửa lúc 22:30 tối (ngừng nhận đặt bàn sau 20:30 để đảm bảo thời gian phục vụ 120 phút). Bạn vui lòng chọn khung giờ trong khoảng 10:30 đến 20:30 nhé.',
    }
  }

  // 2. Resolve Date
  let targetYear = vnRef.year
  let targetMonth = vnRef.month
  let targetDate: number | null = null
  let dateFound = false

  // Relative indicators
  if (
    norm.includes('ngày mốt') ||
    norm.includes('ngay mot') ||
    norm.includes('ngày kia') ||
    norm.includes('ngay kia')
  ) {
    const d = new Date(referenceDate.getTime() + 7 * 3600 * 1000 + 2 * 24 * 3600 * 1000)
    targetYear = d.getUTCFullYear()
    targetMonth = d.getUTCMonth() + 1
    targetDate = d.getUTCDate()
    dateFound = true
  } else if (
    norm.includes('ngày mai') ||
    norm.includes('ngay mai') ||
    norm.includes('mai') ||
    norm.includes('tối mai') ||
    norm.includes('toi mai') ||
    norm.includes('trưa mai') ||
    norm.includes('trua mai') ||
    norm.includes('chiều mai') ||
    norm.includes('chieu mai') ||
    norm.includes('sáng mai') ||
    norm.includes('sang mai')
  ) {
    const d = new Date(referenceDate.getTime() + 7 * 3600 * 1000 + 1 * 24 * 3600 * 1000)
    targetYear = d.getUTCFullYear()
    targetMonth = d.getUTCMonth() + 1
    targetDate = d.getUTCDate()
    dateFound = true
  } else if (
    norm.includes('hôm nay') ||
    norm.includes('hom nay') ||
    norm.includes('bữa nay') ||
    norm.includes('bua nay') ||
    norm.includes('tối nay') ||
    norm.includes('toi nay') ||
    norm.includes('trưa nay') ||
    norm.includes('trua nay') ||
    norm.includes('chiều nay') ||
    norm.includes('chieu nay')
  ) {
    targetDate = vnRef.date
    dateFound = true
  }

  // Explicit date: DD/MM/YYYY or DD-MM-YYYY
  if (!dateFound) {
    const dmyMatch = norm.match(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{4})\b/)
    if (dmyMatch) {
      targetDate = parseInt(dmyMatch[1], 10)
      targetMonth = parseInt(dmyMatch[2], 10)
      targetYear = parseInt(dmyMatch[3], 10)
      dateFound = true
    }
  }

  // Explicit date: DD/MM or DD-MM
  if (!dateFound) {
    const dmMatch = norm.match(/\b(\d{1,2})[/-](\d{1,2})\b/)
    if (dmMatch) {
      targetDate = parseInt(dmMatch[1], 10)
      targetMonth = parseInt(dmMatch[2], 10)
      if (
        targetMonth < vnRef.month ||
        (targetMonth === vnRef.month && targetDate < vnRef.date)
      ) {
        targetYear = vnRef.year + 1
      } else {
        targetYear = vnRef.year
      }
      dateFound = true
    }
  }

  // Explicit date: YYYY-MM-DD
  if (!dateFound) {
    const ymdMatch = norm.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/)
    if (ymdMatch) {
      targetYear = parseInt(ymdMatch[1], 10)
      targetMonth = parseInt(ymdMatch[2], 10)
      targetDate = parseInt(ymdMatch[3], 10)
      dateFound = true
    }
  }

  // Day of week matching
  if (!dateFound) {
    const dowMap: Record<string, number> = {
      'chủ nhật': 0,
      'chu nhat': 0,
      'cn': 0,
      'thứ 2': 1,
      'thu 2': 1,
      'thứ hai': 1,
      'thu hai': 1,
      'thứ 3': 2,
      'thu 3': 2,
      'thứ ba': 2,
      'thu ba': 2,
      'thứ 4': 3,
      'thu 4': 3,
      'thứ tư': 3,
      'thu tu': 3,
      'thứ 5': 4,
      'thu 5': 4,
      'thứ năm': 4,
      'thu nam': 4,
      'thứ 6': 5,
      'thu 6': 5,
      'thứ sáu': 5,
      'thu sau': 5,
      'thứ 7': 6,
      'thu 7': 6,
      'thứ bảy': 6,
      'thu bay': 6,
    }

    for (const [key, dow] of Object.entries(dowMap)) {
      if (norm.includes(key)) {
        const isNextWeek = norm.includes('tuần sau') || norm.includes('tuan sau') || norm.includes('tuần tới') || norm.includes('tuan toi')
        let diff = dow - vnRef.day
        if (isNextWeek) {
          diff += 7
        } else if (diff < 0) {
          diff += 7
        }
        const d = new Date(referenceDate.getTime() + 7 * 3600 * 1000 + diff * 24 * 3600 * 1000)
        targetYear = d.getUTCFullYear()
        targetMonth = d.getUTCMonth() + 1
        targetDate = d.getUTCDate()
        dateFound = true
        break
      }
    }
  }

  // 3. Resolve Time
  let targetHour: number | null = null
  let targetMinute = 0
  let timeFound = false

  // Detect time of day modifiers
  const hasToi = norm.includes('tối') || norm.includes('toi') || norm.includes('đêm') || norm.includes('dem')
  const hasChieu = norm.includes('chiều') || norm.includes('chieu')
  const hasTrua = norm.includes('trưa') || norm.includes('trua')
  const hasSang = norm.includes('sáng') || norm.includes('sang')

  // Patterns for HH:mm or HHh or HHhMM
  const timeRegexes = [
    // 19:30, 19:00
    /\b(\d{1,2}):(\d{2})\b/,
    // 19h30, 19g30, 19 giờ 30, 19h, 19g, 19 giờ
    /\b(\d{1,2})\s*(?:h|g|giờ)\s*(\d{1,2})?\b/,
  ]

  for (const regex of timeRegexes) {
    const match = norm.match(regex)
    if (match) {
      let h = parseInt(match[1], 10)
      const m = match[2] ? parseInt(match[2], 10) : 0

      // Handle 12-hour AM/PM shifts based on Vietnamese context
      if (h < 12) {
        if (hasToi && h < 12) {
          h += 12
        } else if (hasChieu && h < 12 && h < 6) {
          h += 12
        } else if (hasTrua && h === 11) {
          // 11h trưa is 11:00
        } else if (hasTrua && h === 12) {
          // 12h trưa is 12:00
        } else if (h >= 1 && h <= 9 && !hasSang && (h === 7 || h === 8 || h === 6 || h === 5)) {
          // If customer mentions 6h, 7h, 8h in a dinner context without saying "sáng",
          // restaurant does not open before 10:30, so 6h, 7h, 8h without modifier refers to evening
          if (norm.includes('tối') || norm.includes('bữa tối') || norm.includes('ăn tối') || h === 7 || h === 8 || h === 6 || h === 5) {
            h += 12
          }
        }
      }

      targetHour = h
      targetMinute = m
      timeFound = true
      break
    }
  }

  // Handle standalone words like "12h" or "12:00"
  if (!timeFound) {
    if (norm.includes('12h trưa') || norm.includes('12:00 trưa') || norm.includes('buổi trưa') || norm.includes('bữa trưa')) {
      targetHour = 12
      targetMinute = 0
      timeFound = true
    }
  }

  // Check if either date or time is missing
  if (!dateFound && !timeFound) {
    return {
      success: false,
      missingField: 'date',
      reason:
        'Vui lòng cung cấp Ngày và Giờ bạn dự định đến dùng bữa (ví dụ: ngày mai 19h, thứ 7 lúc 18:30).',
    }
  }

  if (!dateFound) {
    return {
      success: false,
      missingField: 'date',
      reason:
        'Bạn muốn đặt bàn vào ngày nào ạ? (Ví dụ: hôm nay, ngày mai, hoặc thứ 7 tuần này).',
    }
  }

  if (!timeFound || targetHour === null) {
    return {
      success: false,
      missingField: 'time',
      reason:
        'Bạn dự định đến dùng bữa vào mấy giờ ạ? Khung giờ nhận khách của Tiger 345 là từ 10:30 sáng đến 20:30 tối.',
    }
  }

  // 4. Validate Operating Hours
  // Intake hours: 10:30 - 20:30
  if (targetHour < 10 || (targetHour === 10 && targetMinute < 30)) {
    return {
      success: false,
      isOutOfHours: true,
      reason:
        'Nhà hàng Tiger 345 bắt đầu đón khách từ 10:30 sáng. Bạn vui lòng chọn khung giờ từ 10:30 trở đi nhé.',
    }
  }

  if (targetHour > 20 || (targetHour === 20 && targetMinute > 30)) {
    return {
      success: false,
      isOutOfHours: true,
      reason:
        'Nhà hàng đóng cửa lúc 22:30 tối và ngừng nhận đặt bàn sau 20:30 (để đảm bảo thời gian phục vụ 120 phút). Bạn vui lòng chọn giờ hẹn trong khoảng 10:30 - 20:30 nhé.',
    }
  }

  // Construct absolute date and time
  const { iso, date: startsAtDate } = createVnIsoString(
    targetYear,
    targetMonth,
    targetDate!,
    targetHour,
    targetMinute
  )

  // 5. Policy Timing Checks relative to referenceDate
  const refMs = referenceDate.getTime()
  const startMs = startsAtDate.getTime()

  // Past check
  if (startMs <= refMs) {
    return {
      success: false,
      isPast: true,
      reason: 'Thời gian đặt bàn phải ở tương lai. Vui lòng chọn thời điểm sau thời điểm hiện tại.',
    }
  }

  // Notice window check: >= 30 min
  const diffMinutes = (startMs - refMs) / (60 * 1000)
  if (diffMinutes < 30) {
    return {
      success: false,
      isNoticeTooShort: true,
      reason:
        'Vui lòng đặt bàn trước giờ dùng bữa ít nhất 30 phút theo quy định của nhà hàng.',
    }
  }

  // Horizon check: <= 30 days
  const diffDays = (startMs - refMs) / (24 * 3600 * 1000)
  if (diffDays > 30) {
    return {
      success: false,
      isTooFarAhead: true,
      reason: 'Nhà hàng Tiger 345 chỉ nhận đặt bàn trước tối đa 30 ngày.',
    }
  }

  const pad = (n: number) => String(n).padStart(2, '0')
  const startsAtFormatted = `${pad(targetHour)}:${pad(targetMinute)} ngày ${pad(targetDate!)}/${pad(targetMonth)}/${targetYear}`

  return {
    success: true,
    startsAt: startsAtDate,
    startsAtIso: iso,
    startsAtFormatted,
  }
}

/**
 * Extracts and validates customer name, phone, guest count, and reservation time from text,
 * merging with existing draft details.
 */
export function extractReservationDetails(
  text: string,
  existingDraft?: {
    customer_name?: string
    phone?: string
    guest_count?: number
    starts_at_iso?: string
    starts_at_formatted?: string
    seating_area_name?: string
    note?: string
  },
  referenceDate: Date = new Date()
): ExtractedReservationDetails {
  const norm = normalizeText(text)

  let customerName = existingDraft?.customer_name
  let phone = existingDraft?.phone
  let guestCount = existingDraft?.guest_count
  let startsAtIso = existingDraft?.starts_at_iso
  let startsAtFormatted = existingDraft?.starts_at_formatted
  let seatingAreaName = existingDraft?.seating_area_name
  let note = existingDraft?.note

  // 1. Phone number extraction
  // Vietnamese phone regex: starts with 0 or 84, followed by 3, 5, 7, 8, 9, total 9-11 digits
  const phoneMatch = norm.match(/(?:84|0)(?:3[2-9]|5[25689]|7[06-9]|8[1-9]|9[0-9])[0-9]{7}\b/)
  if (phoneMatch) {
    phone = phoneMatch[0]
  }

  // 2. Guest count extraction
  const guestMatch = norm.match(/(\d+)\s*(?:người|khách|bạn|chỗ|vé)/i)
  if (guestMatch) {
    guestCount = parseInt(guestMatch[1], 10)
  } else {
    // Written numbers in casual Vietnamese
    const wordNumbers: Record<string, number> = {
      'hai người': 2,
      'hai khách': 2,
      'ba người': 3,
      'ba khách': 3,
      'bốn người': 4,
      'bốn khách': 4,
      'năm người': 5,
      'năm khách': 5,
      'sáu người': 6,
      'sáu khách': 6,
      'bảy người': 7,
      'bảy khách': 7,
      'tám người': 8,
      'tám khách': 8,
      'chín người': 9,
      'chín khách': 9,
      'mười người': 10,
      'mười khách': 10,
    }
    for (const [phrase, num] of Object.entries(wordNumbers)) {
      if (norm.includes(phrase)) {
        guestCount = num
        break
      }
    }
  }

  // 3. Customer name extraction
  const namePatterns = [
    /(?:tên tôi là|tên mình là|tên em là|tên anh là|tên chị là)\s+([a-zà-ỹ\s]{2,35})/i,
    /(?:mình tên là|tôi tên là|em tên là)\s+([a-zà-ỹ\s]{2,35})/i,
    /(?:mình là|tôi là|em là)\s+([A-ZÀ-Ỹ][a-zà-ỹ]+(?:\s+[A-ZÀ-Ỹa-zà-ỹ]+){0,4})/,
    /(?:cho|của)\s+(?:anh|chị|chú|bác|cô)\s+([A-ZÀ-Ỹ][a-zà-ỹ]+(?:\s+[A-ZÀ-Ỹa-zà-ỹ]+){0,3})/,
  ]

  for (const pattern of namePatterns) {
    const m = text.match(pattern)
    if (m && m[1]) {
      const candidate = m[1].trim()
      // Reject generic names
      if (
        candidate.length >= 2 &&
        !GENERIC_NAME_REJECT_LIST.includes(candidate.toLowerCase())
      ) {
        customerName = candidate
        break
      }
    }
  }

  // 4. Date & Time extraction
  const dateRes = resolveReservationDateTime(text, referenceDate)
  if (dateRes.success && dateRes.startsAtIso && dateRes.startsAtFormatted) {
    startsAtIso = dateRes.startsAtIso
    startsAtFormatted = dateRes.startsAtFormatted
  }

  // 5. Seating Area
  if (norm.includes('sân vườn') || norm.includes('san vuon') || norm.includes('ngoài trời')) {
    seatingAreaName = 'Khu vực sân vườn thoáng mát'
  } else if (norm.includes('phòng lạnh') || norm.includes('phong lanh') || norm.includes('máy lạnh')) {
    seatingAreaName = 'Phòng máy lạnh ấm cúng'
  } else if (norm.includes('vip') || norm.includes('phòng riêng')) {
    seatingAreaName = 'Phòng VIP riêng tư'
  }

  // 6. Note
  if (norm.includes('ghế trẻ em') || norm.includes('ghe tre em')) {
    note = (note ? note + ', ' : '') + 'Cần ghế trẻ em'
  }
  if (norm.includes('sinh nhật') || norm.includes('sinh nhat')) {
    note = (note ? note + ', ' : '') + 'Tiệc sinh nhật'
  }

  // Check which required fields are missing
  const missing_fields: ('customer_name' | 'phone' | 'guest_count' | 'starts_at_iso')[] = []
  if (!customerName || customerName.trim().length < 2 || GENERIC_NAME_REJECT_LIST.includes(customerName.toLowerCase().trim())) {
    missing_fields.push('customer_name')
  }
  if (!phone || phone.trim().length < 9) {
    missing_fields.push('phone')
  }
  if (!guestCount || guestCount < 1) {
    missing_fields.push('guest_count')
  }
  if (!startsAtIso) {
    missing_fields.push('starts_at_iso')
  }

  return {
    customer_name: customerName,
    phone,
    guest_count: guestCount,
    starts_at_iso: startsAtIso,
    starts_at_formatted: startsAtFormatted,
    seating_area_name: seatingAreaName,
    note,
    missing_fields,
    is_complete: missing_fields.length === 0,
  }
}
