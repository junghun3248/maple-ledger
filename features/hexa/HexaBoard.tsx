'use client';
import Image from 'next/image';
import { Lock } from 'lucide-react';
import type { CoreKind } from './costs';
import type { PlanRow } from './model';

/** 게임 HEXA 매트릭스처럼 네 묶음(스킬·마스터리·강화·공용)으로 코어 칸을 놓는다. */
export type CoreGroup = 'skill' | 'mastery' | 'enhance' | 'common';

export const groupOf = (kind: CoreKind): CoreGroup =>
  kind === 'third' ? 'skill' : kind === 'jobCommon' ? 'common' : kind;

export const groupLabels: Record<CoreGroup, string> = {
  skill: '스킬 코어',
  mastery: '마스터리 코어',
  enhance: '강화 코어',
  common: '공용 코어',
};

// 520×500 판 위 칸 중심 좌표. 가운데에서 바깥쪽 순서로 채운다.
const BOARD = { width: 520, height: 500, hexWidth: 64, hexHeight: 72 };
const slots: Record<CoreGroup, [number, number][]> = {
  skill: [
    [203, 180],
    [133, 180],
    [167, 118],
    [97, 118],
    [132, 56],
    [62, 56],
  ],
  mastery: [
    [317, 180],
    [353, 118],
    [423, 118],
    [458, 56],
  ],
  enhance: [
    [203, 320],
    [167, 382],
    [97, 382],
    [62, 444],
  ],
  common: [
    [317, 320],
    [353, 382],
    [423, 382],
    [458, 444],
  ],
};
const groups = Object.keys(slots) as CoreGroup[];

const place = ([x, y]: [number, number]) => ({
  left: `${((x - BOARD.hexWidth / 2) / BOARD.width) * 100}%`,
  top: `${((y - BOARD.hexHeight / 2) / BOARD.height) * 100}%`,
  width: `${(BOARD.hexWidth / BOARD.width) * 100}%`,
  height: `${(BOARD.hexHeight / BOARD.height) * 100}%`,
});

export function HexaBoard({
  rows,
  icons,
  selected,
  onSelect,
  onAdd,
}: {
  rows: PlanRow[];
  icons: Record<string, string>;
  selected: string;
  onSelect: (id: string) => void;
  onAdd: (group: CoreGroup) => void;
}) {
  const overflow: PlanRow[] = [];
  const cells = groups.flatMap((group) => {
    const members = rows.filter((row) => groupOf(row.kind) === group);
    overflow.push(...members.slice(slots[group].length));
    return slots[group].map((position, index) => ({ group, position, row: members[index] }));
  });
  return (
    <div className="hexa-board-wrap">
      <div className="hexa-board" role="group" aria-label="HEXA 매트릭스">
        <svg className="hexa-board-art" viewBox="0 0 520 500" aria-hidden>
          <circle cx="260" cy="250" r="150" />
          <circle cx="260" cy="250" r="96" />
          <path d="M260 60 V440 M70 250 H450" />
          <polygon
            className="hexa-emblem"
            points="260,222 284,236 284,264 260,278 236,264 236,236"
          />
          <text x="260" y="256">
            VI
          </text>
        </svg>
        {groups.map((group) => (
          <span key={group} className={`hexa-group-label hexa-${group}`}>
            {groupLabels[group]}
          </span>
        ))}
        {cells.map(({ group, position, row }, index) =>
          row ? (
            <button
              key={row.id}
              type="button"
              className={`hexa-cell hexa-${group}`}
              style={place(position)}
              aria-pressed={selected === row.id}
              title={`${row.name} Lv.${row.level}${row.target > row.level ? ' → ' + row.target : ''}`}
              onClick={() => onSelect(row.id)}
            >
              <span className="hexa-cell-face">
                {icons[row.name] ? (
                  <Image src={icons[row.name]} alt="" width={30} height={30} unoptimized />
                ) : (
                  <span className="hexa-cell-text">
                    {row.name
                      .replace(/^새\s*/, '')
                      .replace(/\s/g, '')
                      .slice(0, 2)}
                  </span>
                )}
              </span>
              <span className="hexa-cell-level">{String(row.level).padStart(2, '0')}</span>
              {row.target > row.level && <span className="hexa-cell-target">→{row.target}</span>}
            </button>
          ) : (
            <button
              key={group + index}
              type="button"
              className={`hexa-cell hexa-${group} hexa-locked`}
              style={place(position)}
              title={`${groupLabels[group]} 직접 추가`}
              aria-label={`${groupLabels[group]} 직접 추가`}
              onClick={() => onAdd(group)}
            >
              <span className="hexa-cell-face">
                <Lock size={16} aria-hidden />
              </span>
            </button>
          ),
        )}
      </div>
      {overflow.length > 0 && (
        <div className="hexa-overflow">
          {overflow.map((row) => (
            <button
              key={row.id}
              type="button"
              className="secondary"
              aria-pressed={selected === row.id}
              onClick={() => onSelect(row.id)}
            >
              {row.name} Lv.{row.level}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
