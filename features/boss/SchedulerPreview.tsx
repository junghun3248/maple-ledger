import { memo } from 'react';
import type { NexonCharacter } from '@/contracts/boss/nexon';
import type { SchedulerBoss } from './scheduler';

export type SchedulerDraft = {
  chosen: NexonCharacter;
  selection: { selected: SchedulerBoss[]; unknown: string[] };
  date: string;
};

export const SchedulerPreview = memo(function SchedulerPreview({
  draft: d,
  targetDate,
}: {
  draft: SchedulerDraft;
  targetDate: string;
}) {
  return (
    <section className="scheduler-batch" key={d.chosen.ocid}>
      <small>
        정산 기준일 {targetDate} · API 기준일 {d.date}
      </small>
      <h3>
        {d.chosen.name} · {d.selection.selected.length}마리
      </h3>
      {(['week', 'month'] as const).map((cycle) => {
        const bosses = d.selection.selected.filter((b) => b.period === cycle);
        return (
          <section key={cycle}>
            <p className="muted">
              {cycle === 'week' ? '주간 보스' : '월간 보스'} · 완료{' '}
              {bosses.filter((b) => b.complete).length}/{bosses.length}
            </p>
            <ul
              className="scheduler-boss-grid"
              aria-label={`${d.chosen.name} ${cycle === 'week' ? '주간' : '월간'} 보스`}
            >
              {bosses.map((b) => (
                <li className="scheduler-boss-card" data-complete={b.complete === true} key={b.id}>
                  <span className="boss-badge" data-level={b.difficulty}>
                    {{
                      이지: 'EASY',
                      노멀: 'NORMAL',
                      노말: 'NORMAL',
                      하드: 'HARD',
                      카오스: 'CHAOS',
                      익스트림: 'EXTREME',
                    }[b.difficulty] || b.difficulty}
                  </span>
                  <strong>{b.name}</strong>
                  <span
                    className="scheduler-complete"
                    aria-label={
                      b.complete
                        ? '처치 완료'
                        : b.complete === false
                          ? '미완료'
                          : '완료 여부 미확인'
                    }
                  >
                    {b.complete ? '✓' : b.complete === undefined ? '?' : ''}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      {!d.selection.selected.length && (
        <p>불러올 수 있는 등록 주간·월간 보스가 없어 캐릭터만 추가합니다.</p>
      )}
      {d.selection.unknown.length > 0 && (
        <p>가격표에 없어 제외: {d.selection.unknown.join(', ')}</p>
      )}
    </section>
  );
});
