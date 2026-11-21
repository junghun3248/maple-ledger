/** 소리 파일 없이 Web Audio로 짧은 알림음을 낸다. 첫 사용자 클릭 뒤에만 소리가 난다. */
let audio: AudioContext | null = null;

export function unlockSound() {
  audio ??= new AudioContext();
  if (audio.state === 'suspended') void audio.resume();
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

/**
 * 브라우저 내장 음성(Web Speech API)으로 알림을 말한다. 서버로 보내지 않는다.
 * 한국어 음성이 없거나 음성 기능이 없으면 알림음으로 대신한다.
 */
export function speak(text: string, volume: number) {
  if (volume <= 0) return;
  const synth = typeof speechSynthesis === 'undefined' ? null : speechSynthesis;
  const voice = synth?.getVoices().find((v) => v.lang.toLowerCase().startsWith('ko'));
  if (!synth || !voice) {
    beep(volume);
    return;
  }
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'ko-KR';
  utterance.voice = voice;
  utterance.volume = volume;
  utterance.rate = 1.1;
  synth.speak(utterance);
}

/** 음성 목록은 처음에 비어 있을 수 있어 미리 불러 둔다. */
export function warmVoices() {
  if (typeof speechSynthesis !== 'undefined') speechSynthesis.getVoices();
}
