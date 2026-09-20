import type { RestaurantSettings } from '../features/catalog/types';

/**
 * Single source of truth for Tiger 345 public contact info.
 * Static fallback is preserved strictly for offline phone/address lookup when API is unavailable.
 */
export const SITE = {
  name: 'Tiger 345',
  phoneDisplay: '090 280 99 29',
  phoneHref: 'tel:0902809929',
  zalo: 'https://zalo.me/0902809929',
  facebook: 'https://www.facebook.com/Tiger345HT/',
  addressShort: '17 Đường Số 1, Vĩnh An, Vĩnh Cửu, Đồng Nai',
  addressFull:
    '17, Đường Số 1, Tổ 6, Khu Phố 2, Thị Trấn Vĩnh An, Huyện Vĩnh Cửu, Tỉnh Đồng Nai',
  mapsUrl:
    'https://maps.google.com/?q=Tiger+345+Duong+So+1+Vinh+An+Vinh+Cuu+Dong+Nai',
  hours: '10:00 – 22:30',
  hoursNote: 'Thứ 2 – Chủ Nhật',
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

  const phone = settings.phone || SITE.phoneDisplay;
  const phoneClean = phone.replace(/\s+/g, '');

  return {
    name: settings.name || SITE.name,
    phoneDisplay: formatPhoneDisplay(phone),
    phoneHref: `tel:${phoneClean}`,
    zalo: settings.zalo || SITE.zalo,
    facebook: settings.facebook || SITE.facebook,
    addressShort: settings.address || SITE.addressShort,
    addressFull: settings.address || SITE.addressFull,
    mapsUrl: settings.maps_url || SITE.mapsUrl,
    hours: '10:00 – 22:30',
    hoursNote: 'Thứ 2 – Chủ Nhật',
  };
}
