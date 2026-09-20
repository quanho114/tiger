import { z } from 'zod';
import { VietnamPhoneSchema, OrderTypeSchema } from './common.ts';

/**
 * Customer Profile Patch Schema
 * Strict allowlist preventing modification of role, user_id, deletion_requested_at, etc.
 */
export const CustomerProfilePatchSchema = z
  .object({
    display_name: z
      .string()
      .trim()
      .min(1, 'Tên hiển thị phải có ít nhất 1 ký tự')
      .max(100, 'Tên hiển thị không được vượt quá 100 ký tự')
      .optional(),
    phone: VietnamPhoneSchema.nullable().optional(),
    avatar_url: z
      .string()
      .trim()
      .url('Đường dẫn ảnh đại diện không hợp lệ')
      .max(500, 'Đường dẫn ảnh quá dài')
      .nullable()
      .optional(),
    marketing_opt_in: z.boolean().optional(),
  })
  .strict();

export type CustomerProfilePatch = z.infer<typeof CustomerProfilePatchSchema>;

/**
 * Customer Address Creation Schema
 */
export const CustomerAddressCreateSchema = z
  .object({
    label: z
      .string()
      .trim()
      .min(1, 'Nhãn địa chỉ phải từ 1 đến 50 ký tự')
      .max(50, 'Nhãn địa chỉ không quá 50 ký tự'),
    recipient_name: z
      .string()
      .trim()
      .min(2, 'Tên người nhận phải từ 2 đến 100 ký tự')
      .max(100, 'Tên người nhận không quá 100 ký tự'),
    phone: VietnamPhoneSchema,
    address_line: z
      .string()
      .trim()
      .min(5, 'Địa chỉ chi tiết phải từ 5 đến 255 ký tự')
      .max(255, 'Địa chỉ chi tiết không quá 255 ký tự'),
    ward: z.string().trim().max(100).nullable().optional(),
    district: z.string().trim().max(100).nullable().optional(),
    province: z.string().trim().max(100).nullable().optional(),
    delivery_note: z.string().trim().max(500).optional().default(''),
    is_default: z.boolean().optional().default(false),
  })
  .strict();

export type CustomerAddressCreate = z.infer<typeof CustomerAddressCreateSchema>;

/**
 * Customer Address Update Schema (with optimistic concurrency version check)
 */
export const CustomerAddressUpdateSchema = z
  .object({
    expected_version: z.number().int().min(1, 'expected_version phải là số nguyên >= 1'),
    label: z.string().trim().min(1).max(50).optional(),
    recipient_name: z.string().trim().min(2).max(100).optional(),
    phone: VietnamPhoneSchema.optional(),
    address_line: z.string().trim().min(5).max(255).optional(),
    ward: z.string().trim().max(100).nullable().optional(),
    district: z.string().trim().max(100).nullable().optional(),
    province: z.string().trim().max(100).nullable().optional(),
    delivery_note: z.string().trim().max(500).optional(),
    is_default: z.boolean().optional(),
  })
  .strict();

export type CustomerAddressUpdate = z.infer<typeof CustomerAddressUpdateSchema>;

/**
 * Customer Reservation Cancellation Schema
 */
export const CustomerCancelReservationSchema = z
  .object({
    expected_version: z.number().int().min(1, 'expected_version phải là số nguyên >= 1'),
    reason: z.string().trim().max(255, 'Lý do hủy không vượt quá 255 ký tự').optional(),
  })
  .strict();

export type CustomerCancelReservation = z.infer<typeof CustomerCancelReservationSchema>;

/**
 * Customer Reorder Schema
 */
export const CustomerReorderSchema = z
  .object({
    source_order_id: z.string().uuid('source_order_id phải là UUID hợp lệ'),
    target_order_type: OrderTypeSchema.optional(),
  })
  .strict();

export type CustomerReorder = z.infer<typeof CustomerReorderSchema>;
