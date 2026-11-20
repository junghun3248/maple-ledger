import { z } from 'zod';

export const FEEDBACK_MAX = 300;
export const REPLY_MAX = 300;

/** 글에 링크를 남기지 못하게 한다(광고·피싱 방지). */
export const hasLink = (text: string) =>
  /(?:https?:\/\/|www\.|[a-z0-9-]+\.(?:com|net|kr|io|gg|me|xyz|co|org|link|ly)\b)/i.test(text);

const text = (max: number) =>
  z
    .string()
    .trim()
    .min(2, '두 글자 이상 적어 주세요.')
    .max(max, `${max}자까지 적을 수 있어요.`)
    .refine((v) => !hasLink(v), '링크는 남길 수 없어요.');

export const feedbackRequestSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('create'), body: text(FEEDBACK_MAX) }),
  z.object({
    action: z.literal('reply'),
    id: z.string().uuid(),
    reply: z.string().trim().max(REPLY_MAX),
    password: z.string().min(1).max(200),
  }),
  z.object({
    action: z.literal('delete'),
    id: z.string().uuid(),
    password: z.string().min(1).max(200),
  }),
  z.object({ action: z.literal('admin-check'), password: z.string().min(1).max(200) }),
]);
export type FeedbackRequest = z.infer<typeof feedbackRequestSchema>;

export const feedbackPostSchema = z.object({
  id: z.string(),
  body: z.string(),
  createdAt: z.number().int(),
  reply: z.string().nullable(),
  repliedAt: z.number().int().nullable(),
});
export type FeedbackPost = z.infer<typeof feedbackPostSchema>;

export const feedbackListSchema = z.object({ posts: z.array(feedbackPostSchema) });
