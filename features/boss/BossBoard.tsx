import Image from 'next/image';
import type { Character, Run, BossDefinition } from '@/contracts/boss/state';
import { money, sumRuns, boardRuns, settle } from './model';
export function BossBoard({
  characters,
  catalog,
  onRoster,
  date,
  period,
  onManage,
  onRun,
}: {
  characters: Character[];
  catalog: BossDefinition[];
  onRoster: (id: string) => void;
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
                <span className="board-avatar portrait-frame">
                  <Image
                    unoptimized
                    width={144}
                    height={144}
                    src={c.profile.image}
                    alt={c.name + ' 캐릭터'}
                  />
                </span>
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
              <div className="board-income-parts">
                <span>
                  결정석 <b>{money(runs.reduce((v, r) => v + settle(r).crystal, 0n))}</b>
                </span>
                <span>
                  획득 물욕템 <b>{money(runs.reduce((v, r) => v + settle(r).loot, 0n))}</b>
                </span>
              </div>
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
            <div className="board-lineup-tools">
              <span>
                {period === 'week' ? '주간' : '월간'} 보스 · {runs.length}마리
              </span>
              <button className="secondary" onClick={() => onRoster(c.id)}>
                보스 선택 · 변경
              </button>
            </div>
            <div className="board-bosses">
              {runs.map((r) => (
                <button
                  className="boss-chip"
                  data-cleared={r.cleared ? 'true' : undefined}
                  key={r.id}
                  onClick={() => onRun(c.id, r)}
                  aria-label={`${c.name} ${r.name} ${r.difficulty} ${r.cleared ? '클리어 완료' : '미클리어'} 상세`}
                >
                  {catalog.find((b) => b.name === r.name && b.difficulty === r.difficulty)?.icon ? (
                    <Image
                      unoptimized
                      src={
                        catalog.find((b) => b.name === r.name && b.difficulty === r.difficulty)!
                          .icon!
                      }
                      width={56}
                      height={56}
                      alt=""
                      className="boss-portrait"
                    />
                  ) : (
                    <span className="boss-portrait boss-portrait-fallback">
                      {r.name.slice(0, 2)}
                    </span>
                  )}
                  <span className="boss-badge" data-level={r.difficulty} title={r.difficulty}>
                    {badges[r.difficulty] || r.difficulty.slice(0, 2)}
                  </span>
                  <span className="boss-chip-name">{r.name}</span>
                  {r.cleared && <span className="boss-clear-label">✓ 클리어</span>}
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
