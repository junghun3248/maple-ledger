export interface CashItem {
  name: string;
  probability: number;
  price: number;
}
export interface CashBox {
  id: string;
  name: string;
  ticket: string;
  ticketPrice: number;
  ticketsPerBox: number;
  items: CashItem[];
}
export interface Prices {
  ticket: number;
  items: Record<string, number>;
}
export const amounts = [1, 5, 10, 100, 1000] as const;
export function validateBox(box: CashBox) {
  if (
    !box.items.length ||
    box.items.some(
      (i) => !Number.isFinite(i.probability) || i.probability <= 0 || !validPrice(i.price),
    ) ||
    new Set(box.items.map((i) => i.name)).size !== box.items.length ||
    Math.abs(box.items.reduce((s, i) => s + i.probability, 0) - 100) > 1e-8 ||
    !Number.isSafeInteger(box.ticketsPerBox) ||
    box.ticketsPerBox < 1 ||
    !validPrice(box.ticketPrice)
  )
    throw Error('상자 확률 또는 가격 설정을 확인해 주세요.');
}
export function validPrice(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1e9;
}
export function restorePrices(box: CashBox, raw: unknown): Prices {
  const value = raw && typeof raw === 'object' ? (raw as Partial<Prices>) : {};
  return {
    ticket: validPrice(value.ticket) ? value.ticket : box.ticketPrice,
    items: Object.fromEntries(
      box.items.map((i) => [
        i.name,
        validPrice(value.items?.[i.name]) ? value.items![i.name] : i.price,
      ]),
    ),
  };
}
export function expectation(box: CashBox, prices: Prices) {
  const cost = prices.ticket * box.ticketsPerBox;
  const value = box.items.reduce((s, i) => s + (prices.items[i.name] * i.probability) / 100, 0);
  return { cost, value, net: value - cost, roi: cost > 0 ? ((value - cost) / cost) * 100 : null };
}
export function openBoxes(
  box: CashBox,
  prices: Prices,
  count: (typeof amounts)[number],
  random = Math.random,
) {
  validateBox(box);
  if (!amounts.includes(count)) throw Error('개봉 횟수를 확인해 주세요.');
  const counts = new Map<string, number>();
  for (let n = 0; n < count; n++) {
    const roll = random() * 100;
    let sum = 0;
    const item = box.items.find((i) => roll < (sum += i.probability));
    if (!item) throw Error('추첨 범위를 확인해 주세요.');
    counts.set(item.name, (counts.get(item.name) || 0) + 1);
  }
  const drops = box.items
    .filter((i) => counts.has(i.name))
    .map((i) => ({ ...i, price: prices.items[i.name], quantity: counts.get(i.name)! }))
    .sort((a, b) => b.price - a.price);
  const cost = count * box.ticketsPerBox * prices.ticket,
    value = drops.reduce((s, i) => s + i.quantity * i.price, 0);
  return { count, cost, value, net: value - cost, drops };
}
export function meso(value: number) {
  return Math.abs(value) >= 10000
    ? (value / 10000).toLocaleString('ko-KR', { maximumFractionDigits: 4 }) + '억'
    : value.toLocaleString('ko-KR', { maximumFractionDigits: 2 }) + '만';
}
