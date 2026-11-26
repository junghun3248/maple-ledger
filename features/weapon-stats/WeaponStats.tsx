'use client';

import { useState } from 'react';
import type { WeaponStatsSnapshot } from '@/contracts/weapon-stats/schema';
import { jobWeaponStat } from '@/lib/weapon-stats/job-stat';

const number = new Intl.NumberFormat('ko-KR');
const percentage = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 2 });
const rate = (count: number, total: number) =>
  total > 0 ? percentage.format((count / total) * 100) + '%' : '—';

export function WeaponStats({ stats }: { stats?: WeaponStatsSnapshot }) {
  const [query, setQuery] = useState('');
  if (!stats) return <p className="weapon-stats-panel">첫 랭킹 집계가 완료되면 통계가 표시돼요.</p>;

  const { date, minLevel, pageLimit, totals, jobs } = stats;
  const eligible = totals.genesis + totals.destiny;
  const rows = jobs.filter((row) => row.job.includes(query.trim()));
  return (
    <>
      <p className="weapon-stats-source">
        {date} 기준 · 넥슨 종합 랭킹
        {minLevel > 0 && ` · Lv.${minLevel} 이상`}
        {pageLimit !== null && ` · 월드 유형별 최대 ${number.format(pageLimit)}페이지 표본`}
        {' · '}총 {number.format(totals.ranked)}캐릭터 · 해방 확인 {number.format(totals.checked)}
        캐릭터
      </p>
      <div className="weapon-stats-summary">
        <div className="weapon-stats-panel">
          <span>제네시스 이상 해방률</span>
          <strong>{rate(totals.liberated, totals.checked)}</strong>
          <small>
            {number.format(totals.liberated)} / {number.format(totals.checked)}명
          </small>
        </div>
        <div className="weapon-stats-panel">
          <span>에공삼 비율</span>
          <strong>{rate(totals.attack, eligible)}</strong>
          <small>
            {number.format(totals.attack)} / {number.format(eligible)}명
          </small>
        </div>
        <div className="weapon-stats-panel">
          <span>에마삼 비율</span>
          <strong>{rate(totals.magic, eligible)}</strong>
          <small>
            {number.format(totals.magic)} / {number.format(eligible)}명
          </small>
        </div>
      </div>
      <section className="weapon-stats-panel">
        <div className="weapon-stats-toolbar">
          <h2>직업별 비율</h2>
          <input
            type="search"
            aria-label="직업 검색"
            placeholder="직업 검색"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <div className="weapon-stats-scroll">
          <table>
            <thead>
              <tr>
                <th scope="col">직업</th>
                <th scope="col">제네 이상 해방</th>
                <th scope="col">해방 무기 확인</th>
                <th scope="col">에공삼</th>
                <th scope="col">에마삼</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ job, liberated, genesis, destiny, attack, magic }) => (
                <tr key={job}>
                  <th scope="row">{job}</th>
                  <td>{number.format(liberated)}</td>
                  <td>{number.format(genesis + destiny)}</td>
                  <td>
                    {jobWeaponStat(job) === 'attack' ? (
                      <>
                        {rate(attack, genesis + destiny)} <small>({number.format(attack)}명)</small>
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>
                    {jobWeaponStat(job) === 'magic' ? (
                      <>
                        {rate(magic, genesis + destiny)} <small>({number.format(magic)}명)</small>
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!rows.length && <p role="status">검색에 맞는 직업이 없어요.</p>}
      </section>
      <p className="weapon-stats-source">
        에공삼·에마삼 비율은 해방 제네시스 또는 데스티니 주무기 착용이 확인된 캐릭터 기준이에요.
        마법사는 마력%, 나머지 직업은 공격력%만 유효 옵션으로 집계해요. 제네 에디는 12·9·9%,
        12·12·9%, 12·12·12%를 집계해요. 데티 에디는 같은 공격력% 또는 마력% 옵션 3줄을 집계해요.
      </p>
    </>
  );
}
