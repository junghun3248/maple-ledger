import { GET as readLedger, POST as writeLedger } from '@/server/ledger/http';

export const dynamic = 'force-dynamic';
export const GET = readLedger;
export const POST = writeLedger;
