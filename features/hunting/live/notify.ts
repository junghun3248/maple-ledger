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

const FEMALE = /sunhi|heami|yuna|seoyeon|jimin|seohyeon|soonbok|yujin|google/i;
const MALE = /injoon|bongjin|gookmin|hyunsu|minsik/i;

/** 음성이 또렷한 정도. 자연스러운(Natural·Online) 음성, 여성 음성을 먼저 고른다. */
function voiceScore(v: SpeechSynthesisVoice) {
  let score = 0;
  if (/natural|online/i.test(v.name)) score += 4;
  if (/google/i.test(v.name)) score += 2;
  if (FEMALE.test(v.name)) score += 1;
  if (MALE.test(v.name)) score -= 3;
  return score;
}

/** 이 브라우저의 한국어 음성, 또렷한 순서. Edge는 자연스러운 음성(SunHi 등)을 더 준다. */
export function koreanVoices() {
  if (typeof speechSynthesis === 'undefined') return [];
  return speechSynthesis
    .getVoices()
    .filter((v) => v.lang.toLowerCase().startsWith('ko'))
    .sort((a, b) => voiceScore(b) - voiceScore(a));
}

export type VoiceSettings = { volume: number; voice: string; pitch: number; rate: number };

/**
 * 브라우저 내장 음성(Web Speech API)으로 알림을 말한다. 서버로 보내지 않는다.
 * 고른 음성이 없으면 가장 또렷한 한국어 음성을, 한국어 음성이 아예 없으면 알림음을 쓴다.
 */
export function speak(text: string, settings: VoiceSettings) {
  if (settings.volume <= 0) return;
  const voices = koreanVoices();
  const voice = voices.find((v) => v.name === settings.voice) ?? voices[0];
  if (!voice) {
    beep(settings.volume);
    return;
  }
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = voice.lang;
  utterance.voice = voice;
  utterance.volume = settings.volume;
  utterance.pitch = settings.pitch;
  utterance.rate = settings.rate;
  speechSynthesis.cancel();
  speechSynthesis.speak(utterance);
}

/** 음성 목록은 처음에 비어 있을 수 있어 미리 불러 둔다. */
export function warmVoices() {
  if (typeof speechSynthesis !== 'undefined') speechSynthesis.getVoices();
}
