const magicJobs = new Set([
  '아크메이지(불,독)',
  '아크메이지(썬,콜)',
  '비숍',
  '플레임위자드',
  '배틀메이지',
  '에반',
  '루미너스',
  '일리움',
  '키네시스',
  '라라',
  '레테',
]);

export function jobWeaponStat(job: string): 'attack' | 'magic' {
  return magicJobs.has(job.replace(/\s+/g, '')) ? 'magic' : 'attack';
}
