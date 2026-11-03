import type { Mode, Option, Tables } from '@/contracts/simulator/schema';
export const grades = ['없음', '레어', '에픽', '유니크', '레전드리'];
export const parts = [
  '무기',
  '엠블렘',
  '보조무기',
  '포스실드·소울링',
  '방패',
  '모자',
  '상의',
  '한벌옷',
  '하의',
  '신발',
  '장갑',
  '망토',
  '벨트',
  '어깨장식',
  '얼굴장식',
  '눈장식',
  '귀고리',
  '반지',
  '펜던트',
  '기계심장',
];
export const upgradeRates = {
  potential: [0, 0.150000001275, 0.035, 0.014, 0],
  additional: [0, 0.02381, 0.009804, 0.007, 0],
};
export const guarantees = { potential: [0, 10, 42, 107], additional: [0, 62, 152, 214] };
export function resetCost(mode: Mode, level: number, grade: number) {
  const band = level < 160 ? 0 : level < 200 ? 1 : level < 250 ? 2 : 3;
  const costs =
    mode === 'potential'
      ? [
          [4000000, 16000000, 34000000, 40000000],
          [4250000, 17000000, 36125000, 42500000],
          [4500000, 18000000, 38250000, 45000000],
          [5000000, 20000000, 42500000, 50000000],
        ]
      : [
          [9750000, 27300000, 66300000, 78000000],
          [10375000, 29050000, 70550000, 83000000],
          [11000000, 30800000, 74800000, 88000000],
          [12250000, 34300000, 83300000, 98000000],
        ];
  if (
    !Number.isInteger(grade) ||
    grade < 1 ||
    grade > 4 ||
    !Number.isInteger(level) ||
    level < 1 ||
    level > 250
  )
    throw Error('장비 레벨과 등급을 확인해 주세요.');
  return costs[band][grade - 1];
}
export function upgrade(
  mode: Mode,
  grade: number,
  failures: number,
  miracle: boolean,
  rng = Math.random,
) {
  if (grade === 4) return { grade, failures: 0 };
  const success =
    failures >= guarantees[mode][grade] || rng() < upgradeRates[mode][grade] * (miracle ? 2 : 1);
  return { grade: grade + (success ? 1 : 0), failures: success ? 0 : failures + 1 };
}
function category(s: string) {
  if (s.includes('쓸만한')) return 'skill';
  if (s.includes('피격 후 무적시간')) return 'invincible';
  if (s.includes('피격 시') && s.includes('무적')) return 'chanceInvincible';
  if (s.includes('피격 시') && s.includes('무시')) return 'ignore';
  return '';
}
export function rollOptions(tables: Tables, rng = Math.random): string[] {
  const result: string[] = [];
  for (const table of tables) {
    const available = table.filter((o) => {
      const c = category(o.text);
      return (
        !c ||
        result.filter((s) => category(s) === c).length <
          (c === 'skill' || c === 'invincible' ? 1 : 2)
      );
    });
    const sum = available.reduce((n, o) => n + o.weight, 0);
    if (!sum) throw Error('옵션 확률표가 비어 있어요.');
    let value = rng() * sum;
    let pick: Option = available[available.length - 1];
    for (const o of available) {
      value -= o.weight;
      if (value < 0) {
        pick = o;
        break;
      }
    }
    result.push(pick.text);
  }
  return result;
}

export function percentTotal(lines: string[], stat: string) {
  return lines.reduce((total, line) => {
    const match = line.match(/^(.+?)\s*:?\s*\+?(\d+)%$/);
    if (!match) return total;
    const name = match[1].trim();
    return (
      total +
      (name === stat || (['STR', 'DEX', 'INT', 'LUK'].includes(stat) && name === '올스탯')
        ? Number(match[2])
        : 0)
    );
  }, 0);
}
