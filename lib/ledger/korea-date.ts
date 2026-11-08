export function koreaDate(now = Date.now()) {
  return new Date(now + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
export function untilKoreaMidnight(now = Date.now()) {
  return Date.parse(koreaDate(now) + 'T00:00:00+09:00') + 86400000 - now;
}
