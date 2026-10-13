import { jsonResponse } from '../_shared/request.ts'
import { AppError } from '../_shared/errors.ts'
import type { RouteContext } from './context.ts'

export async function handleCatalogRoutes({
  req,
  path,
  url,
  pool,
  requestId,
}: RouteContext): Promise<Response | null> {
  if (path === '/menu' && req.method === 'GET') {
    const mode = url.searchParams.get('mode') // 'dine_in' | 'delivery' | 'takeaway' | null
    const categoryParam = url.searchParams.get('category') // slug or id

    // 1. Fetch active categories
    const categoriesRes = await pool.query(
      `SELECT id, name, slug, sort_order
       FROM public.categories
       WHERE active = true
       ORDER BY sort_order ASC, name ASC`
    )

    // 2. Fetch published menu items in active categories
    let itemQuery = `
      SELECT
        m.id,
        m.category_id,
        m.name,
        m.slug,
        m.description,
        m.price_vnd::numeric as price_vnd,
        m.pricing_mode,
        m.price_min::numeric as price_min,
        m.price_max::numeric as price_max,
        m.image_source,
        m.review_note,
        m.image_path,
        m.published,
        m.available,
        m.allow_dine_in,
        m.allow_delivery,
        m.featured_rank,
        m.tags,
        m.serving_size,
        m.pairing_note,
        m.delivery_eta,
        m.spice_level,
        m.is_signature,
        m.is_bestseller,
        m.is_new,
        c.sort_order as category_sort_order
      FROM public.menu_items m
      JOIN public.categories c ON m.category_id = c.id
      WHERE c.active = true AND m.published = true
    `
    const params: unknown[] = []

    if (mode === 'dine_in') {
      itemQuery += ` AND m.allow_dine_in = true`
    } else if (mode === 'delivery' || mode === 'takeaway') {
      itemQuery += ` AND m.allow_delivery = true`
    }

    if (categoryParam) {
      params.push(categoryParam)
      itemQuery += ` AND (c.slug = $${params.length} OR c.id::text = $${params.length})`
    }

    itemQuery += ` ORDER BY c.sort_order ASC, m.featured_rank ASC NULLS LAST, m.name ASC`

    const itemsRes = await pool.query(itemQuery, params)

    const categories = categoriesRes.rows.map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      sort_order: Number(row.sort_order),
    }))

    const items = itemsRes.rows.map((row) => ({
      id: row.id,
      category_id: row.category_id,
      name: row.name,
      slug: row.slug,
      description: row.description || '',
      price_vnd: Number(row.price_vnd),
      pricing_mode: (row.pricing_mode as string) || 'fixed',
      price_min: row.price_min !== null && row.price_min !== undefined ? Number(row.price_min) : null,
      price_max: row.price_max !== null && row.price_max !== undefined ? Number(row.price_max) : null,
      image_source: (row.image_source as string) || 'none',
      review_note: row.review_note || null,
      image_path: row.image_path || '',
      image_url: row.image_path || '',
      available: Boolean(row.available),
      is_available: Boolean(row.available),
      allow_dine_in: Boolean(row.allow_dine_in),
      allow_delivery: Boolean(row.allow_delivery),
      featured_rank: row.featured_rank ? Number(row.featured_rank) : null,
      is_featured: row.featured_rank !== null && row.featured_rank !== undefined,
      tags: Array.isArray(row.tags) ? row.tags : [],
      serving_size: row.serving_size || '',
      pairing_note: row.pairing_note || '',
      delivery_eta: row.delivery_eta || '',
      spice_level: Number(row.spice_level || 0),
      is_signature: Boolean(row.is_signature),
      is_bestseller: Boolean(row.is_bestseller),
      is_new: Boolean(row.is_new),
    }))

    return jsonResponse(
      {
        categories,
        items,
      },
      requestId,
      req,
      200,
      {
        'Cache-Control': 'public, max-age=30, stale-while-revalidate=60',
      }
    )
  }

  if (path === '/settings' && req.method === 'GET') {
    const [settingsRes, hoursRes, closuresRes, zonesRes, areasRes] = await Promise.all([
      pool.query(`SELECT * FROM public.restaurant_settings LIMIT 1`),
      pool.query(
        `SELECT id, weekday, service_type, open_time, close_time
         FROM public.business_hours
         WHERE active = true
         ORDER BY weekday ASC, open_time ASC`
      ),
      pool.query(
        `SELECT id, date, service_type, reason
         FROM public.business_closures
         WHERE date >= CURRENT_DATE
         ORDER BY date ASC`
      ),
      pool.query(
        `SELECT id, name, description, fee_vnd::numeric, free_threshold_vnd::numeric
         FROM public.delivery_zones
         WHERE active = true
         ORDER BY sort_order ASC, name ASC`
      ),
      pool.query(
        `SELECT id, code, name
         FROM public.seating_areas
         WHERE active = true
         ORDER BY sort_order ASC, name ASC`
      ),
    ])

    const raw = settingsRes.rows[0]
    if (!raw) throw new AppError('SERVICE_UNAVAILABLE', 'Thông tin nhà hàng chưa được cấu hình.', 503)

    const settings = {
      name: raw.name || 'Tiger 345',
      phone: raw.phone,
      zalo: raw.zalo || '',
      facebook: raw.facebook || '',
      maps_url: raw.maps_url || '',
      address: raw.address,
      timezone: raw.timezone || 'Asia/Ho_Chi_Minh',
      accepting_orders: Boolean(raw.accepting_orders),
      accepting_dine_in_orders: Boolean(raw.accepting_dine_in_orders),
      accepting_delivery_orders: Boolean(raw.accepting_delivery_orders),
      booking_enabled: Boolean(raw.booking_enabled),
      min_delivery_order_vnd: Number(raw.min_delivery_order_vnd || 0),
      reservation_policy: {
        min_notice_minutes: Number(raw.reservation_min_notice_minutes || 30),
        max_days_ahead: Number(raw.reservation_max_days_ahead || 30),
        duration_minutes: Number(raw.reservation_duration_minutes || 120),
        cancel_notice_minutes: Number(raw.reservation_cancel_notice_minutes || 60),
        no_show_grace_minutes: Number(raw.reservation_no_show_grace_minutes || 15),
      },
      business_hours: hoursRes.rows.map((row) => ({
        id: row.id,
        weekday: Number(row.weekday),
        service_type: row.service_type,
        open_time: row.open_time,
        close_time: row.close_time,
      })),
      business_closures: closuresRes.rows.map((row) => ({
        id: row.id,
        date: row.date,
        service_type: row.service_type,
        reason: row.reason || '',
      })),
      delivery_zones: zonesRes.rows.map((row) => ({
        id: row.id,
        name: row.name,
        description: row.description || '',
        fee_vnd: Number(row.fee_vnd),
        free_threshold_vnd: row.free_threshold_vnd ? Number(row.free_threshold_vnd) : null,
      })),
      seating_areas: areasRes.rows.map((row) => ({
        id: row.id,
        code: row.code,
        name: row.name,
      })),
    }

    return jsonResponse(settings, requestId, req, 200, {
      'Cache-Control': 'public, max-age=30, stale-while-revalidate=60',
    })
  }

  return null
}
