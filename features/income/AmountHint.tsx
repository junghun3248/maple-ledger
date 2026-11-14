'use client';
import { money } from '@/lib/ledger/format';

export function AmountHint({ value }: { value: string }) {
  const valid = /^\d{1,16}$/.test(value);
  return (
    <span className="asset-amount-hint" aria-live="polite" aria-atomic="true">
      {valid
        ? `${money(value)} 메소`
        : value
          ? '숫자로 입력해 주세요'
          : '금액을 입력하면 단위가 표시됩니다'}
    </span>
  );
}
