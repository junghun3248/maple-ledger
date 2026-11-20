import { GET as listFeedback, POST as writeFeedback } from '@/server/feedback/http';

export const dynamic = 'force-dynamic';
export const GET = listFeedback;
export const POST = writeFeedback;
