import { z } from 'zod';
import { ledgerRecordSchema } from './schema';
import { bossStateSchema } from '@/contracts/boss/schema';
const amount = z.string().regex(/^\d{1,16}$/);
const day = ledgerRecordSchema.shape.date;
const signedAmount = z.string().regex(/^-?\d{1,20}$/);
const createdAt = z.string().datetime({ offset: true }).optional();
const id = z.string().min(1).max(99);
export const assetSchema = z
  .object({
    opening: z
      .object({
        amount,
        at: z.string().datetime({ offset: true }),
        legacyDateChoice: z.enum(['include', 'exclude']).nullable(),
      })
      .nullable(),
    expenses: z
      .array(
        z.object({
          id,
          amount,
          date: day,
          category: z.enum(['equipment', 'enhancement', 'consumable', 'other']),
          memo: z.string().max(200),
          huntIncluded: z.boolean(),
          createdAt,
        }),
      )
      .max(10000),
    adjustments: z
      .array(
        z.object({
          id,
          before: signedAmount,
          after: amount,
          delta: signedAmount,
          reason: z.string().min(1).max(200),
          at: z.string().datetime({ offset: true }),
        }),
      )
      .max(10000),
    goals: z
      .array(
        z.object({
          id,
          name: z.string().trim().min(1).max(100),
          amount: amount.refine((v) => BigInt(v) > 0n, '목표 금액은 1메소 이상이어야 합니다.'),
          memo: z.string().max(200),
          priority: z.number().int().min(0).max(10000),
          active: z.boolean(),
          completed: z.boolean(),
          // 목표 시작일(KST). 이날부터 기록된 사냥·보스 수입만 진행률에 더한다.
          startDate: day.optional(),
        }),
      )
      .max(1000),
    sales: z
      .array(
        z.object({
          id,
          sourceId: z.string().max(300),
          itemName: z.string().max(200),
          proceeds: amount,
          createdAt,
          date: day,
          memo: z.string().max(200),
        }),
      )
      .max(10000),
  })
  .superRefine((value, ctx) => {
    for (const key of ['expenses', 'adjustments', 'goals', 'sales'] as const) {
      if (new Set(value[key].map((row) => row.id)).size !== value[key].length)
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [key], message: '중복된 기록입니다.' });
    }
    if (new Set(value.sales.map((row) => row.sourceId)).size !== value.sales.length)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['sales'],
        message: '이미 판매한 항목입니다.',
      });
    for (const row of value.adjustments) {
      if (
        /^-?\d+$/.test(row.before) &&
        /^\d+$/.test(row.after) &&
        /^-?\d+$/.test(row.delta) &&
        BigInt(row.after) - BigInt(row.before) !== BigInt(row.delta)
      )
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['adjustments'],
          message: '조정 차액이 일치하지 않습니다.',
        });
    }
  });
export type AssetSettings = z.infer<typeof assetSchema>;
export type Expense = AssetSettings['expenses'][number];
export type ExpenseCategory = Expense['category'];
export type Goal = AssetSettings['goals'][number];
export type Sale = AssetSettings['sales'][number];
export const financeResponseSchema = z.object({
  bookId: z.string().min(1),
  name: z.string(),
  finance: assetSchema.nullable(),
  records: z.array(ledgerRecordSchema),
  bosses: bossStateSchema,
  revision: z.number().int().nonnegative(),
});
export const financeSavedSchema = z.object({ revision: z.number().int().nonnegative() });
export const financeSaveSchema = z.object({
  bookId: z.string().min(1).max(99),
  revision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  finance: assetSchema,
});
