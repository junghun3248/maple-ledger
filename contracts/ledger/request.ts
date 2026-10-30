import type { z } from 'zod';
import type { ledgerRecordSchema, saveLedgerSchema, requestEnvelopeSchema } from './schema';
export type LedgerRecord = z.infer<typeof ledgerRecordSchema>;
export type SaveLedgerRequest = z.infer<typeof saveLedgerSchema>;
export type RequestEnvelope = z.infer<typeof requestEnvelopeSchema>;
