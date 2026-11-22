/** Web Audio로 알림 대사·알림음을 낸다. 브라우저 정책상 첫 사용자 클릭 뒤에만 소리가 난다. */
let audio: AudioContext | null = null;

export function unlockSound() {
  const first = !audio;
  audio ??= new AudioContext();
  if (audio.state === 'suspended') void audio.resume();
  if (first) preloadVoices();
}

export function beep(volume: number) {
  if (!audio || volume <= 0) return;
  const start = audio.currentTime;
  [0, 0.25].forEach((offset, i) => {
    const osc = audio!.createOscillator();
    const gain = audio!.createGain();
    osc.type = 'sine';
    osc.frequency.value = i ? 1046 : 784;
    gain.gain.setValueAtTime(0, start + offset);
    gain.gain.linearRampToValueAtTime(volume * 0.4, start + offset + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + 0.22);
    osc.connect(gain).connect(audio!.destination);
    osc.start(start + offset);
    osc.stop(start + offset + 0.24);
  });
}

export const notificationsSupported = () => typeof Notification !== 'undefined';

export function showNotification(title: string, body: string) {
  if (!notificationsSupported() || Notification.permission !== 'granted') return;
  try {
    new Notification(title, { body, tag: 'maple-hunt-' + title, silent: true });
  } catch {
    // 일부 모바일 브라우저는 페이지에서 직접 만든 알림을 막는다.
  }
}

/**
 * 탭이 뒤로 가면 브라우저가 setInterval을 크게 늦춘다. 전용 Worker의 타이머는
 * 그 제한을 덜 받아서 알림이 제때 울린다. Worker를 못 만들면 일반 타이머를 쓴다.
 */
export function startTicker(onTick: () => void, ms = 1000) {
  try {
    const source = `setInterval(() => postMessage(0), ${ms});`;
    const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
    const worker = new Worker(url);
    URL.revokeObjectURL(url);
    worker.onmessage = onTick;
    return () => worker.terminate();
  } catch {
    const id = setInterval(onTick, ms);
    return () => clearInterval(id);
  }
}

/** 알림 대사. public/voice/<종류>.wav 녹음 파일을 튼다. */
export type VoiceKind = 'rune' | 'buff' | 'janus' | 'booster';
export const voiceLines: Record<VoiceKind, string> = {
  rune: '룬 떴어요',
  buff: '버프 꺼져요',
  janus: '야누스 꺼져요',
  booster: '부스터 꺼져요',
};

const clips = new Map<VoiceKind, Promise<AudioBuffer | null>>();
function clip(kind: VoiceKind) {
  let loaded = clips.get(kind);
  if (!loaded && audio) {
    const context = audio;
    loaded = fetch(`/voice/${kind}.wav`)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(Error(String(r.status)))))
      .then((data) => context.decodeAudioData(data))
      .catch(() => null);
    clips.set(kind, loaded);
  }
  return loaded ?? Promise.resolve(null);
}

/** 첫 클릭 뒤 대사 파일을 미리 불러 둔다(가려진 탭에서도 바로 틀 수 있게). */
export function preloadVoices() {
  (Object.keys(voiceLines) as VoiceKind[]).forEach((kind) => void clip(kind));
}

/** 대사를 튼다. 파일을 못 불러오면 짧은 알림음으로 대신한다. */
export async function playVoice(kind: VoiceKind, volume: number) {
  if (!audio || volume <= 0) return;
  const buffer = await clip(kind);
  if (!buffer) {
    beep(volume);
    return;
  }
  const source = audio.createBufferSource();
  const gain = audio.createGain();
  source.buffer = buffer;
  gain.gain.value = volume;
  source.connect(gain).connect(audio.destination);
  source.start();
}
