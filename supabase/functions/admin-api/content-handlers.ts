/**
 * Tiger 345 - Admin Content, Settings, Storage & QR Handlers (Task T13)
 * Implements CRUD with OCC for categories, menu items, settings, hours/closures,
 * seating areas, delivery zones, storage uploads with magic-bytes check, and audit logs.
 */

import { Buffer } from 'node:buffer'
import type { SupabaseClient } from '@supabase/supabase-js'
import type pg from 'pg'
import { jsonResponse, parseJsonBody } from '../_shared/request.ts'
import { AppError } from '../_shared/errors.ts'
import type { AuthActor } from '../_shared/types.ts'

export function slugify(text: string): string {
  const normalized = text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return normalized || 'item'
}

export function detectValidImageMime(buffer: Buffer): 'image/jpeg' | 'image/png' | 'image/webp' | null {
  if (buffer.length < 12) return null

  // Check JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg'
  }

  // Check PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'image/png'
  }

  // Check WebP: RIFF (bytes 0..3) ... WEBP (bytes 8..11)
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return 'image/webp'
  }

  return null
}

export async function handleContentRoutes(
  req: Request,
  path: string,
  actor: AuthActor,
  pool: pg.Pool,
  supabaseAdmin: SupabaseClient,
  requestId: string
): Promise<Response | null> {
  const url = new URL(req.url)

  // --------------------------------------------------------------------------
  // 1. CATEGORIES ENDPOINTS
  // --------------------------------------------------------------------------

  // GET /categories - List all categories (including inactive) for admin
  if (path === '/categories' && req.method === 'GET') {
    const res = await pool.query(
      `SELECT id, name, slug, sort_order, active, version, created_at, updated_at
       FROM public.categories
       ORDER BY sort_order ASC, name ASC`
    )
    return jsonResponse({ items: res.rows }, requestId, req, 200, { 'Cache-Control': 'no-store' })
  }

  // POST /categories - Create new category
  if (path === '/categories' && req.method === 'POST') {
    const body = await parseJsonBody<{
      name?: string
      slug?: string
      sort_order?: number
      active?: boolean
    }>(req)

    const name = typeof body.name === 'string' ? body.name.trim() : ''
    if (!name || name.length < 2 || name.length > 100) {
      throw AppError.validation('Tên danh mục phải từ 2 đến 100 ký tự', {
        name: ['Bắt buộc, 2-100 ký tự'],
      })
    }

    let slug = typeof body.slug === 'string' ? body.slug.trim() : slugify(name)
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) {
      slug = slugify(slug || name)
    }

    const sortOrder = typeof body.sort_order === 'number' ? body.sort_order : 0
    const active = body.active !== undefined ? Boolean(body.active) : true

    const client = await pool.connect()
    try {
      await client.query('BEGIN')

      const insertRes = await client.query(
        `INSERT INTO public.categories (id, name, slug, sort_order, active, version)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, 1)
         RETURNING *`,
        [name, slug, sortOrder, active]
      )
      const newCategory = insertRes.rows[0]

      await client.query(
        `INSERT INTO public.audit_logs (admin_id, actor_kind, action, entity_type, entity_id, metadata)
         VALUES ($1, 'admin', 'create_category', 'category', $2, $3)`,
        [actor.userId, newCategory.id, JSON.stringify({ name, slug, active })]
      )

      await client.query('COMMIT')
      return jsonResponse(newCategory, requestId, req, 201, { 'Cache-Control': 'no-store' })
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  }

  // PATCH /categories/:id - Update category with OCC
  const categoryIdMatch = path.match(/^\/categories\/([0-9a-fA-F-]{36})$/)
  if (categoryIdMatch && req.method === 'PATCH') {
    const categoryId = categoryIdMatch[1]
    const body = await parseJsonBody<{
      expected_version?: number
      name?: string
      slug?: string
      sort_order?: number
      active?: boolean
    }>(req)

    const expectedVersion =
      typeof body.expected_version === 'number' ? body.expected_version : Number(body.expected_version)
    if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
      throw AppError.validation('expected_version là bắt buộc để cập nhật danh mục', {
        expected_version: ['Bắt buộc, số nguyên dương'],
      })
    }

    const client = await pool.connect()
    try {
      await client.query('BEGIN')

      const curRes = await client.query(
        'SELECT * FROM public.categories WHERE id = $1 FOR UPDATE',
        [categoryId]
      )
      if (curRes.rows.length === 0) {
        throw AppError.notFound('Danh mục không tồn tại')
      }
      const current = curRes.rows[0]
      if (Number(current.version) !== expectedVersion) {
        throw AppError.versionConflict(
          `Danh mục đã bị cập nhật bởi người khác (hiện tại v${current.version}, yêu cầu v${expectedVersion})`
        )
      }

      const name = body.name !== undefined ? body.name.trim() : current.name
      if (name.length < 2 || name.length > 100) {
        throw AppError.validation('Tên danh mục phải từ 2 đến 100 ký tự')
      }

      let slug = body.slug !== undefined ? body.slug.trim() : current.slug
      if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) {
        slug = slugify(slug || name)
      }

      const sortOrder = body.sort_order !== undefined ? Number(body.sort_order) : current.sort_order
      const active = body.active !== undefined ? Boolean(body.active) : current.active

      const updateRes = await client.query(
        `UPDATE public.categories
         SET name = $1,
             slug = $2,
             sort_order = $3,
             active = $4,
             version = version + 1,
             updated_at = now()
         WHERE id = $5 AND version = $6
         RETURNING *`,
        [name, slug, sortOrder, active, categoryId, expectedVersion]
      )

      if (updateRes.rows.length === 0) {
        throw AppError.versionConflict('Xung đột phiên bản khi lưu danh mục')
      }
      const updated = updateRes.rows[0]

      await client.query(
        `INSERT INTO public.audit_logs (admin_id, actor_kind, action, entity_type, entity_id, metadata)
         VALUES ($1, 'admin', 'update_category', 'category', $2, $3)`,
        [
          actor.userId,
          categoryId,
          JSON.stringify({
            old_version: expectedVersion,
            new_version: updated.version,
            name: updated.name,
            active: updated.active,
          }),
        ]
      )

      await client.query('COMMIT')
      return jsonResponse(updated, requestId, req, 200, { 'Cache-Control': 'no-store' })
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  }

  // DELETE /categories/:id - Archive or delete category
  if (categoryIdMatch && req.method === 'DELETE') {
    const categoryId = categoryIdMatch[1]
    const client = await pool.connect()
    try {
      await client.query('BEGIN')

      // Check if any menu items reference this category
      const countRes = await client.query(
        'SELECT count(*) as count FROM public.menu_items WHERE category_id = $1',
        [categoryId]
      )
      const itemCount = Number(countRes.rows[0].count)

      if (itemCount > 0) {
        // Archive category instead of hard delete
        const archiveRes = await client.query(
          `UPDATE public.categories
           SET active = false,
               version = version + 1,
               updated_at = now()
           WHERE id = $1
           RETURNING *`,
          [categoryId]
        )
        if (archiveRes.rows.length === 0) {
          throw AppError.notFound('Danh mục không tồn tại')
        }

        await client.query(
          `INSERT INTO public.audit_logs (admin_id, actor_kind, action, entity_type, entity_id, metadata)
           VALUES ($1, 'admin', 'archive_category', 'category', $2, $3)`,
          [actor.userId, categoryId, JSON.stringify({ reason: 'has_menu_items', items_count: itemCount })]
        )

        await client.query('COMMIT')
        return jsonResponse(
          { success: true, archived: true, message: 'Danh mục đã được lưu trữ (ẩn) vì có món ăn liên kết' },
          requestId,
          req,
          200,
          { 'Cache-Control': 'no-store' }
        )
      } else {
        // Hard delete safe since no items
        const delRes = await client.query(
          'DELETE FROM public.categories WHERE id = $1 RETURNING id',
          [categoryId]
        )
        if (delRes.rows.length === 0) {
          throw AppError.notFound('Danh mục không tồn tại')
        }

        await client.query(
          `INSERT INTO public.audit_logs (admin_id, actor_kind, action, entity_type, entity_id, metadata)
           VALUES ($1, 'admin', 'delete_category', 'category', $2, '{}'::jsonb)`,
          [actor.userId, categoryId]
        )

        await client.query('COMMIT')
        return jsonResponse(
          { success: true, archived: false, message: 'Đã xóa danh mục hoàn toàn' },
          requestId,
          req,
          200,
          { 'Cache-Control': 'no-store' }
        )
      }
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  }

  // --------------------------------------------------------------------------
  // 2. MENU ITEMS ENDPOINTS
  // --------------------------------------------------------------------------

  // GET /menu-items - List menu items with filters
  if (path === '/menu-items' && req.method === 'GET') {
    const categoryId = url.searchParams.get('category_id')
    const search = url.searchParams.get('search')?.trim()
    const published = url.searchParams.get('published')
    const available = url.searchParams.get('available')
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 100, 1), 200)
    const offset = Math.max(Number(url.searchParams.get('offset')) || 0, 0)

    const conditions: string[] = []
    const values: unknown[] = []

    if (categoryId) {
      values.push(categoryId)
      conditions.push(`m.category_id = $${values.length}`)
    }
    if (search) {
      values.push(`%${search}%`)
      conditions.push(`(m.name ILIKE $${values.length} OR m.description ILIKE $${values.length})`)
    }
    if (published !== null && published !== undefined && published !== '') {
      values.push(published === 'true')
      conditions.push(`m.published = $${values.length}`)
    }
    if (available !== null && available !== undefined && available !== '') {
      values.push(available === 'true')
      conditions.push(`m.available = $${values.length}`)
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    const countRes = await pool.query(
      `SELECT count(*) as total FROM public.menu_items m ${whereClause}`,
      values
    )
    const total = Number(countRes.rows[0].total)

    values.push(limit, offset)
    const queryStr = `
      SELECT
        m.*,
        c.name as category_name,
        c.active as category_active
      FROM public.menu_items m
      JOIN public.categories c ON m.category_id = c.id
      ${whereClause}
      ORDER BY c.sort_order ASC, m.featured_rank ASC NULLS LAST, m.name ASC
      LIMIT $${values.length - 1} OFFSET $${values.length}
    `
    const listRes = await pool.query(queryStr, values)

    return jsonResponse(
      {
        items: listRes.rows.map((r) => ({
          ...r,
          price_vnd: Number(r.price_vnd),
          version: Number(r.version),
        })),
        total,
      },
      requestId,
      req,
      200,
      { 'Cache-Control': 'no-store' }
    )
  }

  // GET /menu-items/:id - Single item
  const menuItemIdMatch = path.match(/^\/menu-items\/([0-9a-fA-F-]{36})$/)
  if (menuItemIdMatch && req.method === 'GET') {
    const itemId = menuItemIdMatch[1]
    const res = await pool.query(
      `SELECT m.*, c.name as category_name
       FROM public.menu_items m
       JOIN public.categories c ON m.category_id = c.id
       WHERE m.id = $1`,
      [itemId]
    )
    if (res.rows.length === 0) {
      throw AppError.notFound('Món ăn không tồn tại')
    }
    const r = res.rows[0]
    return jsonResponse(
      {
        ...r,
        price_vnd: Number(r.price_vnd),
        version: Number(r.version),
      },
      requestId,
      req,
      200,
      { 'Cache-Control': 'no-store' }
    )
  }

  // POST /menu-items - Create new menu item
  if (path === '/menu-items' && req.method === 'POST') {
    const body = await parseJsonBody<{
      category_id?: string
      name?: string
      slug?: string
      description?: string
      price_vnd?: number
      image_path?: string | null
      published?: boolean
      available?: boolean
      allow_dine_in?: boolean
      allow_delivery?: boolean
      featured_rank?: number | null
      tags?: string[]
      serving_size?: string | null
      pairing_note?: string | null
      delivery_eta?: string | null
      spice_level?: number | null
      is_signature?: boolean
      is_bestseller?: boolean
      is_new?: boolean
    }>(req)

    const categoryId = typeof body.category_id === 'string' ? body.category_id.trim() : ''
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    const priceVnd = typeof body.price_vnd === 'number' ? body.price_vnd : Number(body.price_vnd)

    if (!categoryId) {
      throw AppError.validation('category_id là bắt buộc')
    }
    if (!name || name.length < 2 || name.length > 120) {
      throw AppError.validation('Tên món phải từ 2 đến 120 ký tự')
    }
    if (isNaN(priceVnd) || priceVnd < 0 || priceVnd > 1_000_000_000) {
      throw AppError.validation('Giá tiền không hợp lệ (0 đến 1.000.000.000 VND)')
    }

    const allowDineIn = body.allow_dine_in !== undefined ? Boolean(body.allow_dine_in) : true
    const allowDelivery = body.allow_delivery !== undefined ? Boolean(body.allow_delivery) : true
    if (!allowDineIn && !allowDelivery) {
      throw AppError.validation('Món ăn phải bật ít nhất một phương thức phục vụ (tại quán hoặc giao hàng)')
    }

    let slug = typeof body.slug === 'string' ? body.slug.trim() : slugify(name)
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) {
      slug = slugify(slug || name)
    }

    const client = await pool.connect()
    try {
      await client.query('BEGIN')

      // Check category exists
      const catCheck = await client.query('SELECT id FROM public.categories WHERE id = $1', [categoryId])
      if (catCheck.rows.length === 0) {
        throw AppError.validation('Danh mục không tồn tại')
      }

      // Check slug uniqueness; append random suffix if collision
      const slugCheck = await client.query('SELECT id FROM public.menu_items WHERE slug = $1', [slug])
      if (slugCheck.rows.length > 0) {
        slug = `${slug}-${Math.floor(1000 + Math.random() * 9000)}`
      }

      const insertRes = await client.query(
        `INSERT INTO public.menu_items (
           id, category_id, name, slug, description, price_vnd, image_path,
           published, available, allow_dine_in, allow_delivery,
           featured_rank, tags, serving_size, pairing_note, delivery_eta,
           spice_level, is_signature, is_bestseller, is_new, version
         ) VALUES (
           gen_random_uuid(), $1, $2, $3, $4, $5, $6,
           $7, $8, $9, $10,
           $11, $12, $13, $14, $15,
           $16, $17, $18, $19, 1
         ) RETURNING *`,
        [
          categoryId,
          name,
          slug,
          body.description || '',
          priceVnd,
          body.image_path || null,
          body.published !== undefined ? Boolean(body.published) : true,
          body.available !== undefined ? Boolean(body.available) : true,
          allowDineIn,
          allowDelivery,
          body.featured_rank !== undefined ? body.featured_rank : null,
          body.tags || [],
          body.serving_size || null,
          body.pairing_note || null,
          body.delivery_eta || null,
          body.spice_level !== undefined ? body.spice_level : null,
          body.is_signature !== undefined ? Boolean(body.is_signature) : false,
          body.is_bestseller !== undefined ? Boolean(body.is_bestseller) : false,
          body.is_new !== undefined ? Boolean(body.is_new) : false,
        ]
      )
      const newItem = insertRes.rows[0]

      await client.query(
        `INSERT INTO public.audit_logs (admin_id, actor_kind, action, entity_type, entity_id, metadata)
         VALUES ($1, 'admin', 'create_menu_item', 'menu_item', $2, $3)`,
        [actor.userId, newItem.id, JSON.stringify({ name, price_vnd: priceVnd, category_id: categoryId })]
      )

      await client.query('COMMIT')
      return jsonResponse(
        { ...newItem, price_vnd: Number(newItem.price_vnd), version: Number(newItem.version) },
        requestId,
        req,
        201,
        { 'Cache-Control': 'no-store' }
      )
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  }

  // PATCH /menu-items/:id - Update menu item with OCC
  if (menuItemIdMatch && req.method === 'PATCH') {
    const itemId = menuItemIdMatch[1]
    const body = await parseJsonBody<Record<string, unknown>>(req)

    const client = await pool.connect()
    try {
      await client.query('BEGIN')

      const curRes = await client.query(
        'SELECT * FROM public.menu_items WHERE id = $1 FOR UPDATE',
        [itemId]
      )
      if (curRes.rows.length === 0) {
        throw AppError.notFound('Món ăn không tồn tại')
      }
      const current = curRes.rows[0]

      let targetVersion = Number(current.version)
      if (body.expected_version !== undefined && body.expected_version !== null) {
        const expectedVersion = Number(body.expected_version)
        if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
          throw AppError.validation('expected_version phải là số nguyên dương', {
            expected_version: ['Số nguyên dương'],
          })
        }
        if (Number(current.version) !== expectedVersion) {
          throw AppError.versionConflict(
            `Món ăn đã bị thay đổi bởi người khác (hiện tại v${current.version}, yêu cầu v${expectedVersion})`
          )
        }
        targetVersion = expectedVersion
      }

      const categoryId = body.category_id !== undefined ? String(body.category_id).trim() : current.category_id
      const name = body.name !== undefined ? String(body.name).trim() : current.name
      if (name.length < 2 || name.length > 120) {
        throw AppError.validation('Tên món phải từ 2 đến 120 ký tự')
      }

      let slug = body.slug !== undefined ? String(body.slug).trim() : current.slug
      if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) {
        slug = slugify(slug || name)
      }

      const priceVnd = body.price_vnd !== undefined ? Number(body.price_vnd) : Number(current.price_vnd)
      if (isNaN(priceVnd) || priceVnd < 0 || priceVnd > 1_000_000_000) {
        throw AppError.validation('Giá tiền không hợp lệ (0 đến 1.000.000.000 VND)')
      }

      const allowDineIn =
        body.allow_dine_in !== undefined ? Boolean(body.allow_dine_in) : current.allow_dine_in
      const allowDelivery =
        body.allow_delivery !== undefined ? Boolean(body.allow_delivery) : current.allow_delivery
      if (!allowDineIn && !allowDelivery) {
        throw AppError.validation('Món ăn phải bật ít nhất một phương thức phục vụ (tại quán hoặc giao hàng)')
      }

      const updateRes = await client.query(
        `UPDATE public.menu_items
         SET category_id = $1,
             name = $2,
             slug = $3,
             description = $4,
             price_vnd = $5,
             image_path = $6,
             published = $7,
             available = $8,
             allow_dine_in = $9,
             allow_delivery = $10,
             featured_rank = $11,
             tags = $12,
             serving_size = $13,
             pairing_note = $14,
             delivery_eta = $15,
             spice_level = $16,
             is_signature = $17,
             is_bestseller = $18,
             is_new = $19,
             version = version + 1,
             updated_at = now()
         WHERE id = $20 AND version = $21
         RETURNING *`,
        [
          categoryId,
          name,
          slug,
          body.description !== undefined ? String(body.description) : current.description,
          priceVnd,
          body.image_path !== undefined ? body.image_path : current.image_path,
          body.published !== undefined ? Boolean(body.published) : current.published,
          body.is_available !== undefined
            ? Boolean(body.is_available)
            : body.available !== undefined
            ? Boolean(body.available)
            : current.available,
          allowDineIn,
          allowDelivery,
          body.featured_rank !== undefined ? body.featured_rank : current.featured_rank,
          body.tags !== undefined ? body.tags : current.tags,
          body.serving_size !== undefined ? body.serving_size : current.serving_size,
          body.pairing_note !== undefined ? body.pairing_note : current.pairing_note,
          body.delivery_eta !== undefined ? body.delivery_eta : current.delivery_eta,
          body.spice_level !== undefined ? body.spice_level : current.spice_level,
          body.is_signature !== undefined ? Boolean(body.is_signature) : current.is_signature,
          body.is_bestseller !== undefined ? Boolean(body.is_bestseller) : current.is_bestseller,
          body.is_new !== undefined ? Boolean(body.is_new) : current.is_new,
          itemId,
          targetVersion,
        ]
      )

      if (updateRes.rows.length === 0) {
        throw AppError.versionConflict('Xung đột phiên bản khi cập nhật món ăn')
      }
      const updated = updateRes.rows[0]

      await client.query(
        `INSERT INTO public.audit_logs (admin_id, actor_kind, action, entity_type, entity_id, metadata)
         VALUES ($1, 'admin', 'update_menu_item', 'menu_item', $2, $3)`,
        [
          actor.userId,
          itemId,
          JSON.stringify({
            old_version: targetVersion,
            new_version: updated.version,
            price_vnd: Number(updated.price_vnd),
            published: updated.published,
            available: updated.available,
          }),
        ]
      )

      await client.query('COMMIT')
      return jsonResponse(
        {
          ...updated,
          is_available: updated.available,
          price_vnd: Number(updated.price_vnd),
          version: Number(updated.version),
        },
        requestId,
        req,
        200,
        { 'Cache-Control': 'no-store' }
      )
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  }

  // DELETE /menu-items/:id - Archive menu item (hide from catalog)
  if (menuItemIdMatch && req.method === 'DELETE') {
    const itemId = menuItemIdMatch[1]
    const client = await pool.connect()
    try {
      await client.query('BEGIN')

      const res = await client.query(
        `UPDATE public.menu_items
         SET published = false,
             available = false,
             version = version + 1,
             updated_at = now()
         WHERE id = $1
         RETURNING *`,
        [itemId]
      )
      if (res.rows.length === 0) {
        throw AppError.notFound('Món ăn không tồn tại')
      }
      const archived = res.rows[0]

      await client.query(
        `INSERT INTO public.audit_logs (admin_id, actor_kind, action, entity_type, entity_id, metadata)
         VALUES ($1, 'admin', 'archive_menu_item', 'menu_item', $2, $3)`,
        [actor.userId, itemId, JSON.stringify({ version: Number(archived.version) })]
      )

      await client.query('COMMIT')
      return jsonResponse(
        {
          success: true,
          item: { ...archived, price_vnd: Number(archived.price_vnd), version: Number(archived.version) },
        },
        requestId,
        req,
        200,
        { 'Cache-Control': 'no-store' }
      )
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  }

  // --------------------------------------------------------------------------
  // 3. SETTINGS & ATOMIC COLLECTIONS ENDPOINTS
  // --------------------------------------------------------------------------

  // GET /settings - Restaurant settings
  if (path === '/settings' && req.method === 'GET') {
    const res = await pool.query('SELECT * FROM public.restaurant_settings WHERE id = 1')
    if (res.rows.length === 0) {
      throw AppError.notFound('Cài đặt nhà hàng chưa được khởi tạo')
    }
    const r = res.rows[0]
    return jsonResponse(
      {
        ...r,
        min_delivery_order_vnd: Number(r.min_delivery_order_vnd),
        version: Number(r.version),
      },
      requestId,
      req,
      200,
      { 'Cache-Control': 'no-store' }
    )
  }

  // PATCH /settings - Update restaurant settings with OCC
  if (path === '/settings' && req.method === 'PATCH') {
    const body = await parseJsonBody<Record<string, unknown>>(req)
    const expectedVersion =
      typeof body.expected_version === 'number' ? body.expected_version : Number(body.expected_version)
    if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
      throw AppError.validation('expected_version là bắt buộc để cập nhật cài đặt', {
        expected_version: ['Bắt buộc, số nguyên dương'],
      })
    }

    const client = await pool.connect()
    try {
      await client.query('BEGIN')

      const curRes = await client.query(
        'SELECT * FROM public.restaurant_settings WHERE id = 1 FOR UPDATE'
      )
      if (curRes.rows.length === 0) {
        throw AppError.notFound('Cài đặt không tồn tại')
      }
      const current = curRes.rows[0]
      if (Number(current.version) !== expectedVersion) {
        throw AppError.versionConflict(
          `Cài đặt đã bị sửa đổi bởi người khác (hiện tại v${current.version}, yêu cầu v${expectedVersion})`
        )
      }

      const name = body.name !== undefined ? String(body.name).trim() : current.name
      const phone = body.phone !== undefined ? String(body.phone).trim() : current.phone
      const address = body.address !== undefined ? String(body.address).trim() : current.address
      const zalo = body.zalo !== undefined ? String(body.zalo).trim() : current.zalo
      const facebook = body.facebook !== undefined ? String(body.facebook).trim() : current.facebook
      const mapsUrl = body.maps_url !== undefined ? String(body.maps_url).trim() : current.maps_url
      const timezone = body.timezone !== undefined ? String(body.timezone).trim() : current.timezone

      const acceptingOrders =
        body.accepting_orders !== undefined ? Boolean(body.accepting_orders) : current.accepting_orders
      const acceptingDineInOrders =
        body.accepting_dine_in_orders !== undefined
          ? Boolean(body.accepting_dine_in_orders)
          : current.accepting_dine_in_orders
      const acceptingDeliveryOrders =
        body.accepting_delivery_orders !== undefined
          ? Boolean(body.accepting_delivery_orders)
          : current.accepting_delivery_orders
      const bookingEnabled =
        body.booking_enabled !== undefined ? Boolean(body.booking_enabled) : current.booking_enabled

      const minDeliveryOrderVnd =
        body.min_delivery_order_vnd !== undefined
          ? Number(body.min_delivery_order_vnd)
          : Number(current.min_delivery_order_vnd)
      const resvMinNotice =
        body.reservation_min_notice_minutes !== undefined
          ? Number(body.reservation_min_notice_minutes)
          : current.reservation_min_notice_minutes
      const resvMaxDays =
        body.reservation_max_days_ahead !== undefined
          ? Number(body.reservation_max_days_ahead)
          : current.reservation_max_days_ahead
      const resvDuration =
        body.reservation_duration_minutes !== undefined
          ? Number(body.reservation_duration_minutes)
          : current.reservation_duration_minutes
      const resvCancelNotice =
        body.reservation_cancel_notice_minutes !== undefined
          ? Number(body.reservation_cancel_notice_minutes)
          : current.reservation_cancel_notice_minutes
      const resvNoShowGrace =
        body.reservation_no_show_grace_minutes !== undefined
          ? Number(body.reservation_no_show_grace_minutes)
          : current.reservation_no_show_grace_minutes

      const updateRes = await client.query(
        `UPDATE public.restaurant_settings
         SET name = $1,
             phone = $2,
             address = $3,
             zalo = $4,
             facebook = $5,
             maps_url = $6,
             timezone = $7,
             accepting_orders = $8,
             accepting_dine_in_orders = $9,
             accepting_delivery_orders = $10,
             booking_enabled = $11,
             min_delivery_order_vnd = $12,
             reservation_min_notice_minutes = $13,
             reservation_max_days_ahead = $14,
             reservation_duration_minutes = $15,
             reservation_cancel_notice_minutes = $16,
             reservation_no_show_grace_minutes = $17,
             version = version + 1,
             updated_at = now()
         WHERE id = 1 AND version = $18
         RETURNING *`,
        [
          name,
          phone,
          address,
          zalo,
          facebook,
          mapsUrl,
          timezone,
          acceptingOrders,
          acceptingDineInOrders,
          acceptingDeliveryOrders,
          bookingEnabled,
          minDeliveryOrderVnd,
          resvMinNotice,
          resvMaxDays,
          resvDuration,
          resvCancelNotice,
          resvNoShowGrace,
          expectedVersion,
        ]
      )

      if (updateRes.rows.length === 0) {
        throw AppError.versionConflict('Xung đột phiên bản khi lưu cài đặt')
      }
      const updated = updateRes.rows[0]

      await client.query(
        `INSERT INTO public.audit_logs (admin_id, actor_kind, action, entity_type, entity_id, metadata)
         VALUES ($1, 'admin', 'update_settings', 'restaurant_settings', '1', $2)`,
        [
          actor.userId,
          JSON.stringify({
            old_version: expectedVersion,
            new_version: updated.version,
            booking_enabled: updated.booking_enabled,
            accepting_orders: updated.accepting_orders,
          }),
        ]
      )

      await client.query('COMMIT')
      return jsonResponse(
        {
          ...updated,
          min_delivery_order_vnd: Number(updated.min_delivery_order_vnd),
          version: Number(updated.version),
        },
        requestId,
        req,
        200,
        { 'Cache-Control': 'no-store' }
      )
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  }

  // GET /business-hours or /settings/hours - List hours
  if ((path === '/business-hours' || path === '/settings/hours') && req.method === 'GET') {
    const res = await pool.query(
      `SELECT id, weekday, service_type, open_time, close_time, active, created_at
       FROM public.business_hours
       ORDER BY weekday ASC, service_type ASC, open_time ASC`
    )
    return jsonResponse({ items: res.rows }, requestId, req, 200, { 'Cache-Control': 'no-store' })
  }

  // PUT /business-hours or /settings/hours - Atomic replacement under optimistic lock
  if ((path === '/business-hours' || path === '/settings/hours') && req.method === 'PUT') {
    const body = await parseJsonBody<{
      expected_settings_version: number
      hours: Array<{
        weekday: number
        service_type: string
        open_time: string
        close_time: string
        active?: boolean
      }>
    }>(req)

    const expectedVersion =
      typeof body.expected_settings_version === 'number'
        ? body.expected_settings_version
        : Number(body.expected_settings_version)
    if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
      throw AppError.validation('expected_settings_version là bắt buộc')
    }
    if (!Array.isArray(body.hours)) {
      throw AppError.validation('hours phải là một mảng')
    }

    try {
      const res = await pool.query(
        `SELECT public.replace_business_hours($1, $2::jsonb, $3) as result`,
        [expectedVersion, JSON.stringify(body.hours), actor.userId]
      )
      const result = res.rows[0].result
      return jsonResponse(
        {
          ...result,
          rows_inserted: result.rows_inserted ?? result.count,
          new_settings_version: result.new_settings_version ?? result.new_version,
        },
        requestId,
        req,
        200,
        { 'Cache-Control': 'no-store' }
      )
    } catch (err: unknown) {
      if (err && typeof err === 'object') {
        const msg = (err as { message?: string }).message || ''
        if (msg.includes('HOURS_OVERLAP')) {
          throw new AppError('HOURS_OVERLAP', msg.replace(/^[^:]+:\s*/, ''), 409)
        }
        if (msg.includes('VERSION_CONFLICT')) {
          throw AppError.versionConflict(msg.replace(/^[^:]+:\s*/, ''))
        }
        if (msg.includes('VALIDATION_ERROR')) {
          throw AppError.validation(msg.replace(/^[^:]+:\s*/, ''))
        }
      }
      throw err
    }
  }

  // GET /business-closures or /settings/closures - List closures
  if ((path === '/business-closures' || path === '/settings/closures') && req.method === 'GET') {
    const res = await pool.query(
      `SELECT id, date, service_type, reason, created_at
       FROM public.business_closures
       ORDER BY date ASC, service_type ASC`
    )
    return jsonResponse({ items: res.rows }, requestId, req, 200, { 'Cache-Control': 'no-store' })
  }

  // PUT /business-closures or /settings/closures - Atomic replacement under optimistic lock
  if ((path === '/business-closures' || path === '/settings/closures') && req.method === 'PUT') {
    const body = await parseJsonBody<{
      expected_settings_version: number
      closures: Array<{
        date: string
        service_type: string
        reason: string
      }>
    }>(req)

    const expectedVersion =
      typeof body.expected_settings_version === 'number'
        ? body.expected_settings_version
        : Number(body.expected_settings_version)
    if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
      throw AppError.validation('expected_settings_version là bắt buộc')
    }
    if (!Array.isArray(body.closures)) {
      throw AppError.validation('closures phải là một mảng')
    }

    try {
      const res = await pool.query(
        `SELECT public.replace_business_closures($1, $2::jsonb, $3) as result`,
        [expectedVersion, JSON.stringify(body.closures), actor.userId]
      )
      const result = res.rows[0].result
      return jsonResponse(
        {
          ...result,
          rows_inserted: result.rows_inserted ?? result.count,
          new_settings_version: result.new_settings_version ?? result.new_version,
        },
        requestId,
        req,
        200,
        { 'Cache-Control': 'no-store' }
      )
    } catch (err: unknown) {
      if (err && typeof err === 'object') {
        const msg = (err as { message?: string }).message || ''
        if (msg.includes('VERSION_CONFLICT')) {
          throw AppError.versionConflict(msg.replace(/^[^:]+:\s*/, ''))
        }
        if (msg.includes('VALIDATION_ERROR')) {
          throw AppError.validation(msg.replace(/^[^:]+:\s*/, ''))
        }
      }
      throw err
    }
  }

  // --------------------------------------------------------------------------
  // 4. SEATING AREAS & DELIVERY ZONES ENDPOINTS
  // --------------------------------------------------------------------------

  // GET /seating-areas
  if (path === '/seating-areas' && req.method === 'GET') {
    const res = await pool.query(
      `SELECT id, code, name, active, sort_order, version, created_at, updated_at
       FROM public.seating_areas
       ORDER BY sort_order ASC, name ASC`
    )
    return jsonResponse({ items: res.rows }, requestId, req, 200, { 'Cache-Control': 'no-store' })
  }

  // POST /seating-areas
  if (path === '/seating-areas' && req.method === 'POST') {
    const body = await parseJsonBody<{
      code?: string
      name?: string
      sort_order?: number
      active?: boolean
    }>(req)

    const code = typeof body.code === 'string' ? body.code.trim().toUpperCase() : ''
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    if (!code || !name) {
      throw AppError.validation('Mã khu vực và tên khu vực là bắt buộc')
    }

    const sortOrder = typeof body.sort_order === 'number' ? body.sort_order : 0
    const active = body.active !== undefined ? Boolean(body.active) : true

    const insertRes = await pool.query(
      `INSERT INTO public.seating_areas (id, code, name, sort_order, active, version)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, 1)
       RETURNING *`,
      [code, name, sortOrder, active]
    )
    const newArea = insertRes.rows[0]

    await pool.query(
      `INSERT INTO public.audit_logs (admin_id, actor_kind, action, entity_type, entity_id, metadata)
       VALUES ($1, 'admin', 'create_seating_area', 'seating_area', $2, $3)`,
      [actor.userId, newArea.id, JSON.stringify({ code, name })]
    )

    return jsonResponse(newArea, requestId, req, 201, { 'Cache-Control': 'no-store' })
  }

  // PATCH /seating-areas/:id
  const areaIdMatch = path.match(/^\/seating-areas\/([0-9a-fA-F-]{36})$/)
  if (areaIdMatch && req.method === 'PATCH') {
    const areaId = areaIdMatch[1]
    const body = await parseJsonBody<{
      expected_version: number
      code?: string
      name?: string
      sort_order?: number
      active?: boolean
    }>(req)

    if (typeof body.expected_version !== 'number') {
      throw AppError.validation('expected_version là bắt buộc')
    }

    const client = await pool.connect()
    try {
      await client.query('BEGIN')

      const curRes = await client.query(
        'SELECT * FROM public.seating_areas WHERE id = $1 FOR UPDATE',
        [areaId]
      )
      if (curRes.rows.length === 0) {
        throw AppError.notFound('Khu vực không tồn tại')
      }
      const current = curRes.rows[0]
      if (current.version !== body.expected_version) {
        throw AppError.versionConflict('Khu vực đã bị thay đổi bởi người khác')
      }

      const code = body.code !== undefined ? body.code.trim().toUpperCase() : current.code
      const name = body.name !== undefined ? body.name.trim() : current.name
      const sortOrder = body.sort_order !== undefined ? Number(body.sort_order) : current.sort_order
      const active = body.active !== undefined ? Boolean(body.active) : current.active

      const updateRes = await client.query(
        `UPDATE public.seating_areas
         SET code = $1, name = $2, sort_order = $3, active = $4,
             version = version + 1, updated_at = now()
         WHERE id = $5 AND version = $6
         RETURNING *`,
        [code, name, sortOrder, active, areaId, body.expected_version]
      )
      const updated = updateRes.rows[0]

      await client.query(
        `INSERT INTO public.audit_logs (admin_id, actor_kind, action, entity_type, entity_id, metadata)
         VALUES ($1, 'admin', 'update_seating_area', 'seating_area', $2, $3)`,
        [actor.userId, areaId, JSON.stringify({ code, name, active })]
      )

      await client.query('COMMIT')
      return jsonResponse(updated, requestId, req, 200, { 'Cache-Control': 'no-store' })
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  }

  // GET /delivery-zones
  if (path === '/delivery-zones' && req.method === 'GET') {
    const res = await pool.query(
      `SELECT id, name, description, fee_vnd, free_threshold_vnd, active, sort_order, version, created_at, updated_at
       FROM public.delivery_zones
       ORDER BY sort_order ASC, fee_vnd ASC`
    )
    return jsonResponse(
      {
        items: res.rows.map((r) => ({
          ...r,
          fee_vnd: Number(r.fee_vnd),
          free_threshold_vnd: r.free_threshold_vnd !== null ? Number(r.free_threshold_vnd) : null,
          version: Number(r.version),
        })),
      },
      requestId,
      req,
      200,
      { 'Cache-Control': 'no-store' }
    )
  }

  // POST /delivery-zones
  if (path === '/delivery-zones' && req.method === 'POST') {
    const body = await parseJsonBody<{
      name?: string
      description?: string
      fee_vnd?: number
      free_threshold_vnd?: number | null
      sort_order?: number
      active?: boolean
    }>(req)

    const name = typeof body.name === 'string' ? body.name.trim() : ''
    const feeVnd = typeof body.fee_vnd === 'number' ? body.fee_vnd : Number(body.fee_vnd)

    if (!name) {
      throw AppError.validation('Tên khu vực giao hàng là bắt buộc')
    }
    if (isNaN(feeVnd) || feeVnd < 0) {
      throw AppError.validation('Phí giao hàng không hợp lệ')
    }

    const freeThreshold =
      body.free_threshold_vnd !== undefined && body.free_threshold_vnd !== null
        ? Number(body.free_threshold_vnd)
        : null
    const sortOrder = typeof body.sort_order === 'number' ? body.sort_order : 0
    const active = body.active !== undefined ? Boolean(body.active) : true

    const insertRes = await pool.query(
      `INSERT INTO public.delivery_zones (
         id, name, description, fee_vnd, free_threshold_vnd, sort_order, active, version
       ) VALUES (
         gen_random_uuid(), $1, $2, $3, $4, $5, $6, 1
       ) RETURNING *`,
      [name, body.description || '', feeVnd, freeThreshold, sortOrder, active]
    )
    const newZone = insertRes.rows[0]

    await pool.query(
      `INSERT INTO public.audit_logs (admin_id, actor_kind, action, entity_type, entity_id, metadata)
       VALUES ($1, 'admin', 'create_delivery_zone', 'delivery_zone', $2, $3)`,
      [actor.userId, newZone.id, JSON.stringify({ name, fee_vnd: feeVnd })]
    )

    return jsonResponse(
      {
        ...newZone,
        fee_vnd: Number(newZone.fee_vnd),
        free_threshold_vnd:
          newZone.free_threshold_vnd !== null ? Number(newZone.free_threshold_vnd) : null,
        version: Number(newZone.version),
      },
      requestId,
      req,
      201,
      { 'Cache-Control': 'no-store' }
    )
  }

  // PATCH /delivery-zones/:id
  const zoneIdMatch = path.match(/^\/delivery-zones\/([0-9a-fA-F-]{36})$/)
  if (zoneIdMatch && req.method === 'PATCH') {
    const zoneId = zoneIdMatch[1]
    const body = await parseJsonBody<{
      expected_version: number
      name?: string
      description?: string
      fee_vnd?: number
      free_threshold_vnd?: number | null
      sort_order?: number
      active?: boolean
    }>(req)

    if (typeof body.expected_version !== 'number') {
      throw AppError.validation('expected_version là bắt buộc')
    }

    const client = await pool.connect()
    try {
      await client.query('BEGIN')

      const curRes = await client.query(
        'SELECT * FROM public.delivery_zones WHERE id = $1 FOR UPDATE',
        [zoneId]
      )
      if (curRes.rows.length === 0) {
        throw AppError.notFound('Khu vực giao hàng không tồn tại')
      }
      const current = curRes.rows[0]
      if (current.version !== body.expected_version) {
        throw AppError.versionConflict('Khu vực giao hàng đã bị thay đổi bởi người khác')
      }

      const name = body.name !== undefined ? body.name.trim() : current.name
      const description =
        body.description !== undefined ? body.description.trim() : current.description
      const feeVnd =
        body.fee_vnd !== undefined ? Number(body.fee_vnd) : Number(current.fee_vnd)
      const freeThreshold =
        body.free_threshold_vnd !== undefined
          ? body.free_threshold_vnd !== null
            ? Number(body.free_threshold_vnd)
            : null
          : current.free_threshold_vnd !== null
          ? Number(current.free_threshold_vnd)
          : null
      const sortOrder = body.sort_order !== undefined ? Number(body.sort_order) : current.sort_order
      const active = body.active !== undefined ? Boolean(body.active) : current.active

      const updateRes = await client.query(
        `UPDATE public.delivery_zones
         SET name = $1, description = $2, fee_vnd = $3, free_threshold_vnd = $4,
             sort_order = $5, active = $6, version = version + 1, updated_at = now()
         WHERE id = $7 AND version = $8
         RETURNING *`,
        [name, description, feeVnd, freeThreshold, sortOrder, active, zoneId, body.expected_version]
      )
      const updated = updateRes.rows[0]

      await client.query(
        `INSERT INTO public.audit_logs (admin_id, actor_kind, action, entity_type, entity_id, metadata)
         VALUES ($1, 'admin', 'update_delivery_zone', 'delivery_zone', $2, $3)`,
        [actor.userId, zoneId, JSON.stringify({ name, fee_vnd: feeVnd, active })]
      )

      await client.query('COMMIT')
      return jsonResponse(
        {
          ...updated,
          fee_vnd: Number(updated.fee_vnd),
          free_threshold_vnd:
            updated.free_threshold_vnd !== null ? Number(updated.free_threshold_vnd) : null,
          version: Number(updated.version),
        },
        requestId,
        req,
        200,
        { 'Cache-Control': 'no-store' }
      )
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  }

  // --------------------------------------------------------------------------
  // 5. STORAGE & MEDIA UPLOAD ENDPOINTS (Invariant V17)
  // --------------------------------------------------------------------------

  // POST /media/upload - Strict magic-bytes verification, <=5MB, reject SVG
  if (path === '/media/upload' && req.method === 'POST') {
    const contentType = req.headers.get('content-type') || ''
    let fileBuffer: Buffer
    let clientMimeType = ''

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData()
      const file = formData.get('file')
      if (!(file instanceof File)) {
        throw AppError.validation('File ảnh không hợp lệ hoặc thiếu trường "file"')
      }
      if (file.size > 5 * 1024 * 1024) {
        throw new AppError('FILE_TOO_LARGE', 'File ảnh vượt quá kích thước cho phép (tối đa 5MB)', 413)
      }
      clientMimeType = file.type
      const arrayBuffer = await file.arrayBuffer()
      fileBuffer = Buffer.from(arrayBuffer)
    } else {
      // Direct binary upload
      const arrayBuffer = await req.arrayBuffer()
      fileBuffer = Buffer.from(arrayBuffer)
      if (fileBuffer.length > 5 * 1024 * 1024) {
        throw new AppError('FILE_TOO_LARGE', 'File ảnh vượt quá kích thước cho phép (tối đa 5MB)', 413)
      }
      clientMimeType = contentType.split(';')[0].trim().toLowerCase()
    }

    if (fileBuffer.length === 0) {
      throw AppError.validation('Dữ liệu file rỗng')
    }

    // Strict rejection of SVG and HTML
    const prefixStr = fileBuffer.subarray(0, 2048).toString('utf8').toLowerCase()
    if (
      clientMimeType === 'image/svg+xml' ||
      prefixStr.includes('<svg') ||
      prefixStr.includes('<?xml') ||
      prefixStr.includes('<html') ||
      prefixStr.includes('<script')
    ) {
      throw new AppError('INVALID_FILE_TYPE', 'Định dạng SVG hoặc mã thực thi không được phép tải lên', 422)
    }

    // Sniff binary magic bytes
    const detectedMime = detectValidImageMime(fileBuffer)
    if (!detectedMime) {
      throw new AppError(
        'INVALID_FILE_TYPE',
        'Định dạng ảnh không hợp lệ (magic bytes không khớp). Chỉ chấp nhận ảnh JPEG, PNG hoặc WebP',
        422
      )
    }

    const extMap: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
    }
    const ext = extMap[detectedMime]
    const filename = `img_${Date.now()}_${crypto.randomUUID().slice(0, 8)}.${ext}`

    // Upload to Supabase Storage bucket 'restaurant-media'
    const { error: uploadErr } = await supabaseAdmin.storage
      .from('restaurant-media')
      .upload(filename, fileBuffer, {
        contentType: detectedMime,
        upsert: false,
      })

    if (uploadErr) {
      throw new AppError('STORAGE_ERROR', `Lỗi lưu trữ media: ${uploadErr.message}`, 500)
    }

    const { data: publicData } = supabaseAdmin.storage
      .from('restaurant-media')
      .getPublicUrl(filename)

    // Audit log
    await pool.query(
      `INSERT INTO public.audit_logs (admin_id, actor_kind, action, entity_type, entity_id, metadata)
       VALUES ($1, 'admin', 'upload_media', 'storage_object', $2, $3)`,
      [
        actor.userId,
        filename,
        JSON.stringify({
          filename,
          size_bytes: fileBuffer.length,
          mime_type: detectedMime,
          url: publicData.publicUrl,
        }),
      ]
    )

    return jsonResponse(
      {
        url: publicData.publicUrl,
        path: filename,
        size_bytes: fileBuffer.length,
        mime_type: detectedMime,
      },
      requestId,
      req,
      201,
      { 'Cache-Control': 'no-store' }
    )
  }

  // --------------------------------------------------------------------------
  // 6. AUDIT LOGS ENDPOINTS
  // --------------------------------------------------------------------------

  // GET /audit or /audit-logs - Query audit logs with filters
  if ((path === '/audit' || path === '/audit-logs') && req.method === 'GET') {
    const action = url.searchParams.get('action')?.trim()
    const entityType = url.searchParams.get('entity_type')?.trim()
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 50, 1), 100)
    const offset = Math.max(Number(url.searchParams.get('offset')) || 0, 0)

    const conditions: string[] = []
    const values: unknown[] = []

    if (action) {
      values.push(action)
      conditions.push(`a.action = $${values.length}`)
    }
    if (entityType) {
      values.push(entityType)
      conditions.push(`a.entity_type = $${values.length}`)
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    const countRes = await pool.query(
      `SELECT count(*) as total FROM public.audit_logs a ${whereClause}`,
      values
    )
    const total = Number(countRes.rows[0].total)

    values.push(limit, offset)
    const queryStr = `
      SELECT
        a.id, a.admin_id, a.actor_kind, a.action, a.entity_type, a.entity_id,
        a.metadata, a.created_at,
        p.display_name as admin_name
      FROM public.audit_logs a
      LEFT JOIN public.admin_profiles p ON a.admin_id = p.user_id
      ${whereClause}
      ORDER BY a.created_at DESC
      LIMIT $${values.length - 1} OFFSET $${values.length}
    `
    const listRes = await pool.query(queryStr, values)

    return jsonResponse(
      {
        items: listRes.rows,
        total,
      },
      requestId,
      req,
      200,
      { 'Cache-Control': 'no-store' }
    )
  }

  return null
}
