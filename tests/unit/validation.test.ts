import { describe, it, expect } from 'vitest';
import {
  normalizePhoneNumber,
  validatePhoneNumber,
  getVietnamNow,
  validateReservationDateTime,
} from '@/lib/validation';
import { normalizeVietnamPhone, VIETNAM_PHONE_REGEX } from '@contracts/common';

describe('Vietnam Phone Validation and Normalization', () => {
  it('normalizes +84 to 0', () => {
    expect(normalizePhoneNumber('+84902809929')).toBe('0902809929');
    expect(normalizeVietnamPhone('+84 902 809 929')).toBe('0902809929');
    expect(normalizeVietnamPhone('+84-902-809-929')).toBe('0902809929');
  });

  it('normalizes 84 with 11 digits to 0', () => {
    expect(normalizePhoneNumber('84902809929')).toBe('0902809929');
  });

  it('strips spaces, periods, and hyphens', () => {
    expect(normalizePhoneNumber('090.280.9929')).toBe('0902809929');
    expect(normalizePhoneNumber('090 280 99 29')).toBe('0902809929');
    expect(normalizePhoneNumber('090-280-9929')).toBe('0902809929');
  });

  it('accepts valid 10-digit Vietnam mobile prefixes (03, 05, 07, 08, 09)', () => {
    const validNumbers = [
      '0902809929', // 09 Mobifone
      '0868123456', // 08 Viettel
      '0703123456', // 07 Mobifone
      '0389123456', // 03 Viettel
      '0567123456', // 05 Vietnamobile
    ];

    for (const num of validNumbers) {
      const result = validatePhoneNumber(num);
      expect(result.isValid).toBe(true);
      expect(result.normalized).toBe(num);
      expect(VIETNAM_PHONE_REGEX.test(num)).toBe(true);
    }
  });

  it('rejects invalid phone numbers with descriptive error', () => {
    const invalidNumbers = [
      '',
      '   ',
      '123456', // Too short
      '02438123456', // Landline 11 digits
      '0123456789', // Invalid prefix 01
      '0401234567', // Invalid prefix 04
      '0902abc929', // Contains non-digits
      '090280992912', // Too long
    ];

    for (const num of invalidNumbers) {
      const result = validatePhoneNumber(num);
      expect(result.isValid).toBe(false);
      expect(result.error).toBeDefined();
    }
  });
});

describe('Vietnam Timezone (UTC+7) Date Validation', () => {
  it('computes Vietnam time accurately regardless of machine timezone', () => {
    // 2026-09-19T03:30:00Z corresponds to 2026-09-19 10:30:00 in Vietnam (UTC+7)
    const fixedUtcTime = new Date('2026-09-19T03:30:00Z');
    const vnTime = getVietnamNow(fixedUtcTime);

    expect(vnTime.year).toBe(2026);
    expect(vnTime.month).toBe(9);
    expect(vnTime.day).toBe(19);
    expect(vnTime.hour).toBe(10);
    expect(vnTime.minute).toBe(30);
    expect(vnTime.isoDate).toBe('2026-09-19');
    expect(vnTime.timeString).toBe('10:30');
  });

  it('handles midnight edge case where UTC date differs from Vietnam date', () => {
    // 2026-09-19T20:00:00Z corresponds to 2026-09-20 03:00:00 in Vietnam (UTC+7)
    const fixedUtcTime = new Date('2026-09-19T20:00:00Z');
    const vnTime = getVietnamNow(fixedUtcTime);

    expect(vnTime.day).toBe(20);
    expect(vnTime.hour).toBe(3);
    expect(vnTime.isoDate).toBe('2026-09-20');
  });
});

describe('Restaurant Reservation Operating Hours Validation', () => {
  // Mock current time in Vietnam: 2026-09-19 at 09:00 AM (02:00 UTC)
  const simulatedMorning = new Date('2026-09-19T02:00:00Z');

  it('rejects reservation slots before 07:00 VN', () => {
    const res = validateReservationDateTime('2026-09-19', '06:30', simulatedMorning);
    expect(res.isValid).toBe(false);
    expect(res.error).toContain('không phục vụ trước 07:00 sáng');
  });

  it('rejects slots outside lunch (10:30-14:00) and dinner (17:30-22:30)', () => {
    const outsideHours = ['08:00', '10:00', '14:30', '15:00', '16:00', '17:00', '23:00'];
    for (const slot of outsideHours) {
      const res = validateReservationDateTime('2026-09-19', slot, simulatedMorning);
      expect(res.isValid).toBe(false);
      expect(res.error).toContain('không nằm trong giờ phục vụ');
    }
  });

  it('accepts valid lunch and dinner slots', () => {
    const validSlots = ['10:30', '11:30', '12:00', '13:30', '14:00', '17:30', '18:30', '20:00', '22:00', '22:30'];
    for (const slot of validSlots) {
      const res = validateReservationDateTime('2026-09-20', slot, simulatedMorning);
      expect(res.isValid).toBe(true);
    }
  });

  it('rejects dates in the past', () => {
    const res = validateReservationDateTime('2026-09-18', '18:00', simulatedMorning);
    expect(res.isValid).toBe(false);
    expect(res.error).toContain('quá khứ');
  });

  it('enforces minimum advance window of 30 minutes on current day', () => {
    // Current VN time: 11:00 AM (04:00 UTC)
    const simulatedLunchTime = new Date('2026-09-19T04:00:00Z');

    // Past time on same day (10:30)
    const pastSlot = validateReservationDateTime('2026-09-19', '10:30', simulatedLunchTime);
    expect(pastSlot.isValid).toBe(false);
    expect(pastSlot.error).toContain('đã qua trong ngày');

    // Within 30 min window (11:15 is only 15 min ahead)
    const tooSoonSlot = validateReservationDateTime('2026-09-19', '11:15', simulatedLunchTime);
    expect(tooSoonSlot.isValid).toBe(false);
    expect(tooSoonSlot.error).toContain('trước giờ đến ít nhất 30 phút');

    // Valid advance window (12:00 is 60 min ahead)
    const validAdvanceSlot = validateReservationDateTime('2026-09-19', '12:00', simulatedLunchTime);
    expect(validAdvanceSlot.isValid).toBe(true);
  });
});
