'use client';
import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { engine, defaults, manualFields, type Fields, type Region } from './ocr';
import { errorMessage } from '@/lib/ledger/api';
type Side = 'b' | 'a';
type Picture = { image: HTMLImageElement; fields?: Fields };
export function ScreenshotReader({
  onRead,
  onBusy,
}: {
  onRead: (values: Partial<Record<'bm' | 'am' | 'bf' | 'af', string>>) => void;
  onBusy: (value: boolean) => void;
}) {
  const [pictures, setPictures] = useState<Partial<Record<Side, Picture>>>({}),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useState('사진 두 장을 올리면 자동으로 읽어요.'),
    [manual, setManual] = useState(false);
  const [regions, setRegions] = useState<Region[]>(() => {
    try {
      const r = JSON.parse(localStorage.getItem('maple-ledger-v1-regions') || 'null');
      if (
        Array.isArray(r) &&
        r.length === 4 &&
        r.every((v) =>
          ['x', 'y', 'w', 'h'].every((k) => Number.isFinite(v[k]) && v[k] >= 0 && v[k] <= 1920),
        )
      )
        return r;
    } catch {}
    return defaults.map((r) => ({ ...r }));
  });
  const urls = useRef<string[]>([]),
    mounted = useRef(true),
    running = useRef(false);
  useEffect(() => {
    const owned = urls.current;
    mounted.current = true;
    return () => {
      mounted.current = false;
      owned.forEach(URL.revokeObjectURL);
    };
  }, []);
  async function recognize(next = pictures) {
    if (running.current || !next.b || !next.a) return;
    running.current = true;
    setBusy(true);
    onBusy(true);
    onRead({ bm: '', am: '', bf: '', af: '' });
    try {
      const ocr = await engine();
      let uncertain = false;
      for (const k of ['b', 'a'] as const) {
        if (!mounted.current) return;
        const p = next[k];
        if (!p) continue;
        const fields = manual ? manualFields(p.image, regions) : await ocr.detect(p.image);
        next = { ...next, [k]: { ...p, fields } };
        setPictures(next);
        const result = await ocr.read(p.image, fields, (text) => {
          if (mounted.current) setStatus((k === 'b' ? '사냥 전' : '사냥 후') + ' · ' + text);
        });
        if (!mounted.current) return;
        uncertain ||=
          result.fragmentIssue !== null || result.meso === null || result.fragment === null;
        onRead(
          k === 'b'
            ? { bm: result.meso ?? '', bf: result.fragment ?? '' }
            : { am: result.meso ?? '', af: result.fragment ?? '' },
        );
      }
      setStatus(
        uncertain
          ? '불확실한 칸은 비웠어요. 확대 사진을 보고 직접 확인해 주세요.'
          : '인식 완료 · 사진과 비교 후 저장하세요.',
      );
    } catch (e) {
      if (mounted.current) setStatus(errorMessage(e));
      if (window.MapleOCR) await window.MapleOCR.resetWorkers();
    } finally {
      running.current = false;
      if (mounted.current) {
        setBusy(false);
        onBusy(false);
      }
    }
  }
  async function upload(k: Side, file?: File) {
    if (!file || running.current) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type) || file.size > 25 * 1024 * 1024) {
      setStatus('25MB 이하 PNG, JPG, WebP 사진을 선택하세요.');
      return;
    }
    const url = URL.createObjectURL(file);
    urls.current.push(url);
    const image = new window.Image();
    try {
      image.src = url;
      await image.decode();
      if (image.width * image.height > 30000000) throw Error('사진 크기가 너무 커요.');
      if (!mounted.current) return;
      const next = { ...pictures, [k]: { image } };
      setPictures(next);
      onRead(k === 'b' ? { bm: '', bf: '' } : { am: '', af: '' });
      if (next.a && next.b) await recognize(next);
    } catch (e) {
      URL.revokeObjectURL(url);
      setStatus(errorMessage(e));
    }
  }
  function setRegion(i: number, key: keyof Region, value: number) {
    if (
      !Number.isInteger(value) ||
      value < (key === 'x' || key === 'y' ? 0 : 1) ||
      value > (key === 'y' || key === 'h' ? 1080 : 1920)
    )
      return;
    const next = regions.map((r, index) => (index === i ? { ...r, [key]: value } : r));
    setRegions(next);
    try {
      localStorage.setItem('maple-ledger-v1-regions', JSON.stringify(next));
    } catch {
      setStatus('위치 설정을 저장하지 못했어요.');
    }
  }
  return (
    <>
      <div className="uploads">
        {(['b', 'a'] as const).map((k) => (
          <label
            className="upload"
            key={k}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              void upload(k, e.dataTransfer.files[0]);
            }}
          >
            <span>{k === 'b' ? '01 · 사냥 전' : '02 · 사냥 후'}</span>
            {pictures[k] ? (
              <Image
                unoptimized
                src={pictures[k].image.src}
                width={180}
                height={100}
                alt={(k === 'b' ? '사냥 전' : '사냥 후') + ' 스크린샷'}
              />
            ) : (
              <b>＋</b>
            )}
            <small>클릭하거나 사진을 끌어 놓으세요</small>
            <input
              type="file"
              disabled={busy}
              accept="image/png,image/jpeg,image/webp"
              aria-label={(k === 'b' ? '사냥 전' : '사냥 후') + ' 사진'}
              onChange={(e) => void upload(k, e.target.files?.[0])}
            />
          </label>
        ))}
      </div>
      <div className="recognition">
        <button
          className="secondary"
          type="button"
          disabled={busy}
          onClick={() => void recognize()}
        >
          ✧ 사진에서 숫자 읽기
        </button>
        <span role="status">{status}</span>
      </div>
      <details>
        <summary>인벤토리 자동 탐지 / 수동 위치 조정</summary>
        <p>
          동전 옆 메소 금액과 첫 칸 솔 에르다 조각 수량을 찾습니다. 인식이 어려우면 위치를
          조정하거나 직접 입력하세요.
        </p>
        <label>
          <input
            type="checkbox"
            checked={manual}
            disabled={busy}
            onChange={(e) => setManual(e.target.checked)}
          />{' '}
          수동 위치 사용
        </label>
        <div id="regionInputs">
          <div>
            <span>1920×1080 기준</span>
            {['X', 'Y', '폭', '높이'].map((t) => (
              <span key={t}>{t}</span>
            ))}
          </div>
          {regions.map((r, i) => (
            <div key={i}>
              <span>{['메소 억', '메소 만', '메소 끝자리', '조각 첫 칸'][i]}</span>
              {(['x', 'y', 'w', 'h'] as const).map((k) => (
                <input
                  key={k}
                  type="number"
                  disabled={busy}
                  value={r[k]}
                  aria-label={`${i + 1}번 영역 ${k}`}
                  onChange={(e) => setRegion(i, k, Number(e.target.value))}
                />
              ))}
            </div>
          ))}
        </div>
        <button
          className="text-btn"
          type="button"
          disabled={busy}
          onClick={() => {
            setRegions(defaults.map((r) => ({ ...r })));
            try {
              localStorage.removeItem('maple-ledger-v1-regions');
            } catch {}
          }}
        >
          기본 위치로 되돌리기
        </button>
      </details>
      <div id="cropPreviews" className="crop-previews">
        {(['b', 'a'] as const).map((k) => {
          const p = pictures[k];
          return p ? (
            <CropPreview
              key={k}
              picture={p}
              fields={manual ? manualFields(p.image, regions) : p.fields}
              label={k === 'b' ? '사냥 전' : '사냥 후'}
            />
          ) : null;
        })}
      </div>
    </>
  );
}
function CropPreview({
  picture,
  fields,
  label,
}: {
  picture: Picture;
  fields?: Fields;
  label: string;
}) {
  const meso = useRef<HTMLCanvasElement>(null),
    fragment = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    for (const [key, ref] of [
      ['meso', meso],
      ['fragment', fragment],
    ] as const) {
      const canvas = ref.current,
        box = fields?.[key];
      if (!canvas) continue;
      const context = canvas.getContext('2d');
      if (!context) continue;
      context.clearRect(0, 0, canvas.width, canvas.height);
      if (!box) continue;
      canvas.width = Math.max(1, Math.round(box.w * 3));
      canvas.height = Math.max(1, Math.round(box.h * 3));
      context.imageSmoothingEnabled = false;
      context.drawImage(
        picture.image,
        box.x,
        box.y,
        box.w,
        box.h,
        0,
        0,
        canvas.width,
        canvas.height,
      );
    }
  }, [picture, fields]);
  return (
    <div>
      <b>{label} · 인식 영역</b>
      <span>동전 옆 메소{!fields?.meso && ' · 아직 찾지 못했어요'}</span>
      <canvas hidden={!fields?.meso} ref={meso} />
      <span>솔 에르다 조각 수량{!fields?.fragment && ' · 아직 찾지 못했어요'}</span>
      <canvas hidden={!fields?.fragment} ref={fragment} />
    </div>
  );
}
