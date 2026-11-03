import test from 'node:test';
import assert from 'node:assert/strict';
import { bossDraftKey, readBossDraft, writeBossDraft } from '../features/boss/draft-storage';
test('보스 초안은 새 저장소 접근에서 복원되고 기록장끼리 분리된다', () => {
  const data = new Map<string, string>();
  const storage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
  };
  const state = { characters: [{ id: 'one', name: '테스트', runs: [] }] };
  assert.equal(writeBossDraft(storage, null, state, 0), true);
  assert.deepEqual(readBossDraft(storage, null)?.state, state);
  assert.equal(readBossDraft(storage, '다른 기록장'), null);
  assert.notEqual(bossDraftKey(null), bossDraftKey('guest'));
  assert.equal(writeBossDraft(storage, '기록장', state, 3), true);
  assert.equal(readBossDraft(storage, '기록장')?.revision, 3);
  data.set(bossDraftKey('손상'), '{');
  assert.equal(readBossDraft(storage, '손상'), null);
});
test('저장 공간 오류를 성공으로 표시하지 않는다', () => {
  assert.equal(
    writeBossDraft(
      {
        setItem() {
          throw Error('quota');
        },
      },
      null,
      { characters: [] },
      0,
    ),
    false,
  );
});
