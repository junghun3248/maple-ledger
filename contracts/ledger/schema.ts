import { z } from 'zod';

const amount = z.string().regex(/^\d{1,16}$/);
export const ledgerRecordSchema = z.object({
  id: z.string().min(1).max(99),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine(
      (value) =>
        !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value,
    ),
  bm: amount,
  am: amount,
  bf: amount,
  af: amount,
  memo: z.string().max(200),
  minutes: z.number().int().min(1).max(1440).nullable(),
});
export const saveLedgerSchema = z.object({
  // 기록장 이름은 생성 시 길이 제한이 없으므로 여기서도 제한하지 않는다.
  book: z.string().min(1),
  revision: z.number().int().refine(Number.isSafeInteger),
  records: z
    .array(ledgerRecordSchema)
    .max(10000)
    .refine((rows) => new Set(rows.map((row) => row.id)).size === rows.length),
});
export const requestEnvelopeSchema = z
  .object({ action: z.string().optional() })
  .catchall(z.unknown());
