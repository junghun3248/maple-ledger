import type { Run, Drop, ItemDefinition } from '@/contracts/boss/state';
export function dropsFor(
  run: Run,
  items: ItemDefinition[],
  rules: Record<string, string[]>,
): Drop[] {
  const ids = rules[run.name + '|' + run.difficulty] || [],
    saved = new Map(run.drops.map((d) => [d.id, d]));
  return [
    ...ids.flatMap((id) => {
      const savedDrop = saved.get(id);
      if (savedDrop) return [savedDrop];
      const item = items.find((i) => i.id === id);
      return item ? [{ ...item, selected: false, qty: 1, price: '' }] : [];
    }),
    ...run.drops.filter((d) => !ids.includes(d.id)),
  ];
}
export function toggleDrop(
  run: Run,
  id: string,
  items: ItemDefinition[],
  rules: Record<string, string[]>,
) {
  if (id === BOX_ID) return false;
  let d = run.drops.find((d) => d.id === id);
  if (!d) {
    const found = items.find((i) => i.id === id);
    const item =
      dropsFor(run, items, rules).find((d) => d.id === id) ||
      (found ? { ...found, selected: false, qty: 1, price: '' } : undefined);
    if (!item || run.drops.length >= 50) return false;
    d = { ...item };
    run.drops.push(d);
  }
  d.selected = !d.selected;
  return true;
}
export const BOX_ID = 'item-38';
export const BOX_REWARDS = ['item-0', 'item-1', 'item-2', 'item-3', 'item-4', 'item-6', 'item-5'];
export const isBoxReward = (d: { id: string }) => /^box-item-[0-6]$/.test(d.id);
export function toggleBoxReward(run: Run, id: string, items: ItemDefinition[]) {
  if (!BOX_REWARDS.includes(id)) return false;
  const resultId = 'box-' + id;
  let drop = run.drops.find((d) => d.id === resultId);
  if (!drop) {
    const item = items.find((i) => i.id === id);
    if (!item || run.drops.length >= 50) return false;
    drop = {
      ...item,
      id: resultId,
      name: item.name + ' · 칠흑 상자',
      selected: false,
      qty: 1,
      price: '',
    };
    run.drops.push(drop);
  }
  drop.selected = !drop.selected;
  return true;
}
