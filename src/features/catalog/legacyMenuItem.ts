import type { MenuItem as CatalogMenuItem, PricingMode, ImageSource } from '@/features/catalog/types';

export interface MenuItem {
  id: string;
  name: string;
  category: string;
  category_id?: string;
  description: string;
  price: number;
  price_vnd?: number;
  pricing_mode?: PricingMode;
  price_min?: number | null;
  price_max?: number | null;
  image_source?: ImageSource;
  review_note?: string | null;
  image: string;
  image_path?: string;
  image_url?: string;
  tags?: string[];
  isSignature?: boolean;
  is_signature?: boolean;
  isBestseller?: boolean;
  is_bestseller?: boolean;
  isNew?: boolean;
  is_new?: boolean;
  is_featured?: boolean;
  featured_rank?: number | null;
  available?: boolean;
  is_available?: boolean;
  allow_dine_in?: boolean;
  allow_delivery?: boolean;
  modes: ('dine-in' | 'delivery' | 'takeaway')[];
  // Specific attributes
  deliveryETA?: string;
  delivery_eta?: string;
  servingSize?: string;
  serving_size?: string;
  pairingNote?: string;
  pairing_note?: string;
  spiceLevel?: number;
  spice_level?: number;
}

export function toLegacyMenuItem(item: CatalogMenuItem): MenuItem {
  return {
    id: item.id,
    name: item.name,
    category: item.category_id,
    category_id: item.category_id,
    description: item.description,
    price: item.price_vnd,
    price_vnd: item.price_vnd,
    pricing_mode: item.pricing_mode || 'fixed',
    price_min: item.price_min,
    price_max: item.price_max,
    image_source: item.image_source,
    review_note: item.review_note,
    image: item.image_path || item.image_url || '/tiger.svg',
    image_path: item.image_path,
    image_url: item.image_url,
    tags: item.tags,
    isSignature: item.is_signature,
    is_signature: item.is_signature,
    isBestseller: item.is_bestseller,
    is_bestseller: item.is_bestseller,
    isNew: item.is_new,
    is_new: item.is_new,
    is_featured: item.is_featured,
    featured_rank: item.featured_rank,
    available: item.available,
    is_available: item.is_available,
    allow_dine_in: item.allow_dine_in,
    allow_delivery: item.allow_delivery,
    modes: [
      ...(item.allow_dine_in ? (['dine-in'] as const) : []),
      ...(item.allow_delivery ? (['delivery', 'takeaway'] as const) : []),
    ],
    deliveryETA: item.delivery_eta,
    delivery_eta: item.delivery_eta,
    servingSize: item.serving_size,
    serving_size: item.serving_size,
    pairingNote: item.pairing_note,
    pairing_note: item.pairing_note,
    spiceLevel: item.spice_level,
    spice_level: item.spice_level,
  };
}
