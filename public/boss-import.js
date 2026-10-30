import {schedulerSelection,mergeScheduler} from './boss-scheduler.js?v=7';
import {validState,dateKey,money} from './boss-model.js?v=7';
export const eligibleCharacter=c=>Number.isSafeInteger(c.combatPower)&&c.combatPower>10000000;
export function mergeCharacterBatch(state,drafts,makeId=()=>crypto.randomUUID()){
 const candidate=structuredClone(state),ids=[];let added=0,conflicts=0;
 for(const {chosen,selection,date} of drafts){
  const c=candidate.characters.find(c=>c.nexonId===chosen.ocid)||candidate.characters.find(c=>c.name===chosen.name&&(!c.profile||c.profile.world===chosen.world));
  const merged=mergeScheduler(c?.runs||[],selection.selected,date,makeId);
  const updated={...(c||{id:makeId(),name:chosen.name}),nexonId:chosen.ocid,profile:{world:chosen.world,job:chosen.job.trim(),level:chosen.level,image:c?.profile?.image||'',checkedAt:new Date().toISOString()},runs:merged.runs};
  if(c)candidate.characters[candidate.characters.indexOf(c)]=updated;else candidate.characters.push(updated);
  ids.push(updated.id);added+=merged.added;conflicts+=merged.conflicts.length;
 }
 if(!validState(candidate))throw Error('추가하면 저장 가능한 캐릭터·보스 기록 수를 넘거나 정보 형식이 맞지 않아요. 기존 기록은 변경하지 않았어요.');
 return {state:candidate,ids,added,conflicts};
}
export function initSchedulerUI({$,api,escape,bosses,apply}){
 const storage='maple-boss-nexon-api-key';let remembered='',characters=[],selected=new Set(),drafts=[],busy=false,epoch=0;
 try{remembered=localStorage.getItem(storage)||''}catch{}
 const message=text=>$('schedulerStatus').textContent=text;
 function remember(key){remembered=key;try{if(key)localStorage.setItem(storage,key);else localStorage.removeItem(storage)}catch{}}
 function invalidate(){epoch++;drafts=[];$('schedulerPreview').innerHTML='';$('applyScheduler').hidden=true}
 function controls(){
  $('loadNexonCharacters').disabled=busy;$('loadScheduler').disabled=busy||!selected.size;
  $('nexonSelectAll').disabled=busy;$('nexonClearAll').disabled=busy;
  $('applyScheduler').disabled=busy;$('nexonSelectedCount').textContent=selected.size+'명 선택';
  $('loadScheduler').textContent=selected.size?`선택한 ${selected.size}명의 주간 보스 가져오기`:'캐릭터를 선택해 주세요';
  document.querySelectorAll('[data-nexon-index]').forEach(b=>b.disabled=busy);
 }
 function cards(){
  $('nexonCharacterCards').innerHTML=characters.map((c,i)=>`<button type="button" class="nexon-choice" data-nexon-index="${i}" aria-pressed="${selected.has(c.ocid)}"><strong>${selected.has(c.ocid)?'✓ ':''}${escape(c.name)}</strong><small>Lv.${c.level} · ${escape(c.world)}</small><small>${escape(c.job)}</small><b class="combat-power">전투력 ${money(c.combatPower)}</b></button>`).join('');controls();
 }
 function clear(){invalidate();characters=[];selected.clear();$('nexonKey').value='';$('schedulerAccount').hidden=true;$('nexonCharacterCards').innerHTML='';controls()}
 function open(){clear();message('');$('nexonKey').value=remembered;$('forgetNexonKey').hidden=!remembered;$('schedulerDialog').showModal();$('schedulerDialog').querySelector('.api-guide').open=!remembered;if(remembered&&!busy)$('schedulerConnect').requestSubmit()}
 $('schedulerDialog').addEventListener('close',clear);
 $('openScheduler').onclick=open;$('addCharacter').onclick=open;$('emptyScheduler').onclick=open;
 $('forgetNexonKey').onclick=()=>{remember('');clear();$('forgetNexonKey').hidden=true;message('저장한 API 키를 삭제했어요. 다른 키를 입력할 수 있어요.')};
 $('nexonKey').oninput=()=>{invalidate();characters=[];selected.clear();$('schedulerAccount').hidden=true;controls()};
 $('nexonCharacterCards').onclick=e=>{
  const b=e.target.closest('[data-nexon-index]');if(!b||busy)return;
  const id=characters[Number(b.dataset.nexonIndex)].ocid;
  if(selected.has(id))selected.delete(id);else{if(selected.size>=36)return message('한 번에 최대 36명까지 선택할 수 있어요.');selected.add(id)}invalidate();cards();
 };
 $('nexonSelectAll').onclick=()=>{selected=new Set(characters.slice(0,36).map(c=>c.ocid));invalidate();cards();if(characters.length>36)message('한 번에 최대 36명까지 선택됩니다.')};
 $('nexonClearAll').onclick=()=>{selected.clear();invalidate();cards()};
 $('schedulerConnect').onsubmit=async e=>{
  e.preventDefault();if(busy)return;invalidate();const token=epoch,key=$('nexonKey').value.trim();busy=true;characters=[];selected.clear();$('schedulerAccount').hidden=true;controls();message('내 캐릭터를 조회하고 있어요…');
  try{
   const result=await api('nexon-characters',{apiKey:key});if(token!==epoch)return;
   remember(key);$('forgetNexonKey').hidden=false;
   const all=[...new Map(result.characters.map(c=>[c.ocid,c])).values()],qualified=[];let failed=0,checked=0;
   for(let i=0;i<all.length;i+=8){
    if(token!==epoch)return;const group=all.slice(i,i+8);
    message(`전투력 확인 중 · ${checked} / ${all.length}명`);
    try{
     const response=await api('nexon-powers',{apiKey:key,ocids:group.map(c=>c.ocid)});if(token!==epoch)return;
     for(const c of group){const power=response.results.find(r=>r.ocid===c.ocid);if(!power||power.error){failed++;continue}const checkedCharacter={...c,combatPower:power.combatPower};if(eligibleCharacter(checkedCharacter))qualified.push(checkedCharacter)}
     if(response.results.some(r=>r.status===429)){failed+=all.length-i-group.length;break}
    }catch(err){if(token!==epoch)return;failed+=group.length;if(err.status===429){failed+=all.length-i-group.length;break}}
    checked+=group.length;
   }
   if(token!==epoch)return;
   characters=qualified.sort((a,b)=>b.combatPower-a.combatPower);cards();$('schedulerAccount').hidden=false;
   message(`전투력 1,000만 초과 ${characters.length}명 · 여러 캐릭터를 선택해 주세요.`+(failed?` 전투력 확인 실패 ${failed}명은 표시하지 않았어요. 내 캐릭터 조회를 눌러 재시도할 수 있어요.`:''));
  }catch(err){if(token===epoch)message(err.message)}finally{busy=false;controls()}
 };
 $('loadScheduler').onclick=async()=>{
  if(busy||!selected.size)return;invalidate();const token=epoch,key=$('nexonKey').value.trim(),chosen=characters.filter(c=>selected.has(c.ocid));busy=true;controls();const failed=[],loaded=[];
  try{
   for(let i=0;i<chosen.length;i+=8){
    if(token!==epoch)return;message(`주간 보스 가져오는 중 · ${i} / ${chosen.length}명`);
    const group=chosen.slice(i,i+8);
    try{
     const response=await api('nexon-schedulers',{apiKey:key,ocids:group.map(c=>c.ocid)});if(token!==epoch)return;
     for(const c of group){const result=response.results.find(r=>r.ocid===c.ocid);if(!result||result.error){failed.push(c.name);continue}loaded.push({chosen:c,selection:schedulerSelection(result.bosses,bosses),date:result.date?.slice(0,10)||dateKey()})}
    }catch{if(token!==epoch)return;failed.push(...group.map(c=>c.name))}
   }
   if(token!==epoch)return;drafts=loaded;
   $('schedulerPreview').innerHTML=loaded.map(d=>`<section class="scheduler-batch"><h3>${escape(d.chosen.name)} <small>주간 보스 ${d.selection.selected.length}마리</small></h3><p class="muted">${d.date} 기준 · 1인 결정석 ${money(d.selection.selected.reduce((n,b)=>n+BigInt(b.price),0n))} 메소</p><div>${d.selection.selected.map(b=>`<span>${escape(b.name)} · ${escape(b.difficulty)}</span>`).join('')||'<p class="muted">등록한 주간 보스가 없어요. 캐릭터만 추가됩니다.</p>'}</div>${d.selection.unknown.length?`<p class="pending">가격표에 없어 제외: ${escape(d.selection.unknown.join(', '))}</p>`:''}</section>`).join('');
   $('applyScheduler').hidden=!loaded.length;$('applyScheduler').textContent=`${loaded.length}명 정산표에 한 번에 추가`;
   message(`${loaded.length}명 조회 완료`+(failed.length?` · 실패 ${failed.length}명: ${failed.join(', ')}. 성공한 캐릭터만 추가되며 기존 기록은 유지됩니다.`:' · 목록을 확인하고 아래 추가 버튼을 눌러 주세요.'));
  }finally{busy=false;controls()}
 };
 $('applyScheduler').onclick=()=>{if(busy||!drafts.length)return;try{apply(drafts);$('schedulerDialog').close()}catch(err){message(err.message)}};
}
