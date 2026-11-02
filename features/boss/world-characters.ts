import { z } from 'zod';
import type { NexonCharacter } from '@/contracts/boss/nexon';
import { ledgerRequest } from '@/lib/ledger/api';
const powersSchema = z.object({
  results: z.array(
    z.object({
      ocid: z.string(),
      combatPower: z.number().optional(),
      error: z.string().optional(),
    }),
  ),
});
// Filter before batching: other worlds must never incur character/stat requests.
export async function loadWorldCharacters(
  roster: NexonCharacter[],
  world: string,
  apiKey: string,
  control: { active: () => boolean; progress: (done: number, total: number) => void },
  request: typeof ledgerRequest = ledgerRequest,
) {
  const all = world ? roster.filter((c) => c.world === world) : [];
  const qualified: NexonCharacter[] = [];
  let failed = 0;
  for (let i = 0; i < all.length; i += 8) {
    if (!control.active()) break;
    control.progress(i, all.length);
    const group = all.slice(i, i + 8);
    try {
      const response = powersSchema.parse(
        await request('nexon-powers', { apiKey, ocids: group.map((c) => c.ocid) }),
      );
      if (!control.active()) break;
      for (const c of group) {
        const result = response.results.find((r) => r.ocid === c.ocid);
        if (!result || result.error || result.combatPower === undefined) {
          failed++;
          continue;
        }
        if (result.combatPower > 10000000)
          qualified.push({ ...c, combatPower: result.combatPower });
      }
    } catch {
      failed += group.length;
    }
  }
  return { qualified, failed };
}
