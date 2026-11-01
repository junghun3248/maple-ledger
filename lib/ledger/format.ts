export const dateKey = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function money(value: string | number | bigint) {
  let n = BigInt(value);
  const sign = n < 0n ? '-' : '';
  if (n < 0n) n = -n;
  if (!n) return '0';
  return (
    sign +
    (
      [
        [1000000000000n, '조'],
        [100000000n, '억'],
        [10000n, '만'],
        [1n, ''],
      ] as const
    )
      .map(([unit, label]) => {
        const v = n / unit;
        n %= unit;
        return v ? v.toLocaleString('ko-KR') + label : '';
      })
      .filter(Boolean)
      .join(' ')
  );
}
