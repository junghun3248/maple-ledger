import { z } from 'zod';
import { bossStateSchema } from '@/contracts/boss/schema';
import type { BossState } from '@/contracts/boss/state';
const draftSchema = z.object({ state: bossStateSchema, revision: z.number().int() });
export function bossDraftKey(name: string | null) {
  return 'maple-boss-draft-v1:' + (name === null ? 'guest' : 'book:' + encodeURIComponent(name));
}
export function readBossDraft(storage: Pick<Storage, 'getItem'>, name: string | null) {
  try {
    const raw = storage.getItem(bossDraftKey(name));
    return raw ? draftSchema.parse(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}
export function writeBossDraft(
  storage: Pick<Storage, 'setItem'>,
  name: string | null,
  state: BossState,
  revision: number,
) {
  try {
    storage.setItem(bossDraftKey(name), JSON.stringify(draftSchema.parse({ state, revision })));
    return true;
  } catch {
    return false;
  }
}
