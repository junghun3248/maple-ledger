import Image from 'next/image';
import type { Character, Run } from '@/contracts/boss/state';
import { money, sumRuns, boardRuns } from './model';
export function BossBoard({
  characters,
  date,
  period,
  onManage,
  onRun,
}: {
  characters: Character[];
  date: string;
  period: 'week' | 'month';
  onManage: (id: string) => void;
  onRun: (owner: string, run: Run) => void;
}) {
  const badges: Record<string, string> = {
    이지: 'E',
    노멀: 'N',
    노말: 'N',
    하드: 'H',
    카오스: 'C',
    익스트림: 'EX',
  };
  return (
    <>
      {characters.map((c) => {
        const runs = boardRuns(c, date, period);
        return (
          <article className="board-row" key={c.id}>
            <div className="board-profile">
              {c.profile?.image ? (
                <Image
                  unoptimized
                  width={60}
                  height={70}
                  src={c.profile.image}
                  alt=""
                  className="board-avatar"
                />
              ) : (
                <span className="board-avatar placeholder">{c.name.slice(0, 1)}</span>
              )}
              <div>
                <strong>{c.name}</strong>
                <small>
                  {c.profile
                    ? `Lv.${c.profile.level} · ${c.profile.world} · ${c.profile.job}`
                    : '내 캐릭터'}
                </small>
                <button
                  className="quiet"
                  onClick={() => onManage(c.id)}
                  aria-label={c.name + ' 관리'}
                >
                  관리
                </button>
              </div>
            </div>
            <div className="board-income">
              <strong>{money(sumRuns(runs))}</strong>
              <small>메소 · 내 몫</small>
              <span>
                보스 {runs.length} · 물욕템{' '}
                {runs.reduce(
                  (n, r) => n + r.drops.filter((d) => d.selected).reduce((s, d) => s + d.qty, 0),
                  0,
                )}
                개
              </span>
            </div>
            <div className="board-bosses">
              {runs.map((r) => (
                <button
                  className="boss-chip"
                  key={r.id}
                  onClick={() => onRun(c.id, r)}
                  aria-label={`${c.name} ${r.name} ${r.difficulty} 상세`}
                >
                  <span className="boss-badge" data-level={r.difficulty} title={r.difficulty}>
                    {badges[r.difficulty] || r.difficulty.slice(0, 2)}
                  </span>
                  <span className="boss-chip-name">{r.name}</span>
                  <small>
                    {r.party}인
                    {r.drops.some((d) => d.selected)
                      ? ' · ◆' + r.drops.filter((d) => d.selected).length
                      : ''}
                  </small>
                </button>
              ))}
              {!runs.length && <p className="board-no-boss">등록한 보스가 없어요</p>}
            </div>
          </article>
        );
      })}
    </>
  );
}
