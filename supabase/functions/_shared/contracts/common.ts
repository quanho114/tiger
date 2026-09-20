import { z } from 'zod';

/**
 * Standard API Error Detail
 */
export const ApiErrorDetailSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
});

export type ApiErrorDetail = z.infer<typeof ApiErrorDetailSchema>;

/**
 * Standard API Success Response Envelope
 */
export const ApiSuccessResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    success: z.literal(true),
    data: dataSchema,
  });

export type ApiSuccessResponse<T> = {
  success: true;
  data: T;
};

/**
 * Standard API Error Response Envelope
 */
export const ApiErrorResponseSchema = z.object({
  success: z.literal(false),
  error: ApiErrorDetailSchema,
});

export type ApiErrorResponse = z.infer<typeof ApiErrorResponseSchema>;

/**
 * Combined API Response Schema helper
 */
export const ApiResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.discriminatedUnion('success', [
    ApiSuccessResponseSchema(dataSchema),
    ApiErrorResponseSchema,
  ]);

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

/**
 * Normalized Vietnamese Phone Number Schema
 * Accepts formats: 0902809929, +84902809929, 090 280 99 29, 090-280-9929
 * Validates and normalizes to standard 10-digit format starting with 0
 */
export const normalizeVietnamPhone = (input: string): string => {
  const cleaned = input.replace(/[\s.-]/g, '');
  if (cleaned.startsWith('+84')) {
    return '0' + cleaned.slice(3);
  }
  if (cleaned.startsWith('84') && cleaned.length === 11) {
    return '0' + cleaned.slice(2);
  }
  return cleaned;
};

export const VIETNAM_PHONE_REGEX = /^(0)(3|5|7|8|9)[0-9]{8}$/;

export const VietnamPhoneSchema = z
  .string()
  .transform(normalizeVietnamPhone)
  .pipe(
    z
      .string()
      .regex(
        VIETNAM_PHONE_REGEX,
        'Số điện thoại không hợp lệ. Vui lòng nhập số di động 10 chữ số tại Việt Nam (đầu số 03, 05, 07, 08, 09).'
      )
  );

/**
 * Domain Enum Schemas matching DB definition
 */
export const OrderTypeSchema = z.enum(['dine_in', 'delivery']);
export type OrderType = z.infer<typeof OrderTypeSchema>;

export const OrderStatusSchema = z.enum([
  'pending',
  'confirmed',
  'preparing',
  'served',
  'delivering',
  'completed',
  'cancelled',
  'rejected',
]);
export type OrderStatus = z.infer<typeof OrderStatusSchema>;

export const PaymentMethodSchema = z.enum(['cash', 'bank_transfer']);
export type PaymentMethod = z.infer<typeof PaymentMethodSchema>;

export const PaymentStatusSchema = z.enum(['unpaid', 'paid', 'refunded']);
export type PaymentStatus = z.infer<typeof PaymentStatusSchema>;

export const ReservationStatusSchema = z.enum([
  'pending',
  'confirmed',
  'cancelled',
  'rejected',
]);
export type ReservationStatus = z.infer<typeof ReservationStatusSchema>;

/**
 * Date and Time primitives
 */
export const DateStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Định dạng ngày phải là YYYY-MM-DD');

export const TimeSlotSchema = z
  .string()
  .regex(/^\d{2}:\d{2}$/, 'Định dạng giờ phải là HH:mm');
