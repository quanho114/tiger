import type { RestaurantSettings } from '@/features/catalog/types';

/**
 * Public display adapter for database-backed restaurant settings.
 * Unavailable settings must not be replaced with invented contact details or hours.
 */
export const SITE = {
  name: 'Tiger 345',
  phoneDisplay: 'Chưa cập nhật',
  phoneHref: '',
  zalo: '',
  facebook: '',
  addressShort: 'Chưa cập nhật',
  addressFull: 'Chưa cập nhật',
  mapPlaceQuery: '',
  mapsUrl: '',
  hours: 'Chưa cập nhật',
  hoursNote: 'Vui lòng kiểm tra lại sau',
} as const;

export function formatPhoneDisplay(phone?: string): string {
  if (!phone) return SITE.phoneDisplay;
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) {
    return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
  }
  return phone;
}

export function getSiteInfo(settings?: RestaurantSettings | null) {
  if (!settings) {
    return SITE;
  }

  const phone = settings.phone || '';
  const phoneClean = phone.replace(/\s+/g, '');
  const restaurantHours = settings.business_hours.filter(hour => hour.service_type === 'restaurant' || hour.service_type === 'both');
  const weekdays = new Set(restaurantHours.map(hour => hour.weekday));
  const slots = new Set(restaurantHours.map(hour => `${hour.open_time.slice(0, 5)} – ${hour.close_time.slice(0, 5)}`));
  const hours = weekdays.size === 7 && restaurantHours.length === 7 && slots.size === 1
    ? [...slots][0] : restaurantHours.length ? 'Giờ phục vụ thay đổi theo ngày' : SITE.hours;

  return {
    name: settings.name || SITE.name,
    phoneDisplay: formatPhoneDisplay(phone),
    phoneHref: phoneClean ? `tel:${phoneClean}` : '',
    zalo: settings.zalo || '',
    facebook: settings.facebook || '',
    addressShort: settings.address || SITE.addressShort,
    addressFull: settings.address || SITE.addressFull,
    mapPlaceQuery: settings.address || '',
    mapsUrl: settings.maps_url || '',
    hours,
    hoursNote: 'Lịch thường lệ; có thể có ngày nghỉ',
  };
}
