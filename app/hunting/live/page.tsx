import { redirect } from 'next/navigation';

/** 재획 타이머는 사냥 기록 화면 맨 위로 합쳐졌다. 예전 주소로 들어와도 사냥 기록으로 보낸다. */
export default function Page() {
  redirect('/hunting');
}
