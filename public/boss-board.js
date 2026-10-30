import {weekKey,settle,money} from './boss-model.js';
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function boardRuns(character,date,period='week') {
 return character.runs.filter(r=>period==='month'?r.period==='month'&&r.date.slice(0,7)===date.slice(0,7):r.period!=='month'&&weekKey(r.date)===weekKey(date));
}
export function boardMarkup(characters,date,period,visible) {
 return characters.filter(c=>visible===null||visible.has(c.id)).map(c=>{
  const runs=boardRuns(c,date,period),total=runs.reduce((n,r)=>n+settle(r).total,0n),loot=runs.reduce((n,r)=>n+r.drops.filter(d=>d.selected).reduce((s,d)=>s+d.qty,0),0);
  return `<article class="board-row"><div class="board-profile">${c.profile?.image?`<img src="${esc(c.profile.image)}" alt="" class="board-avatar">`:`<span class="board-avatar placeholder">${esc(c.name.slice(0,1))}</span>`}<div><strong>${esc(c.name)}</strong><small>${c.profile?`Lv.${c.profile.level} · ${esc(c.profile.world)}<br>${esc(c.profile.job)}`:'내 캐릭터'}</small><button class="quiet" data-manage="${esc(c.id)}" aria-label="${esc(c.name)} 관리">관리</button></div></div><div class="board-income"><strong>${money(total)}</strong><small>메소 · 내 몫</small><span>보스 ${runs.length} · 물욕템 ${loot}개</span></div><div class="board-bosses">${runs.map(r=>{
   const badge=({'이지':'E','노멀':'N','노말':'N','하드':'H','카오스':'C','익스트림':'EX'})[r.difficulty]||r.difficulty.slice(0,2),count=r.drops.filter(d=>d.selected).length;
   return `<button class="boss-chip" data-open-run="${esc(r.id)}" data-owner="${esc(c.id)}" aria-label="${esc(c.name)} ${esc(r.name)} ${esc(r.difficulty)} 상세"><span class="boss-badge" data-level="${esc(r.difficulty)}" title="${esc(r.difficulty)}">${esc(badge)}</span><span class="boss-chip-name">${esc(r.name)}</span><small>${r.party}인${count?' · ◆'+count:''}</small></button>`;
  }).join('')||'<p class="board-no-boss">등록한 보스가 없어요</p>'}</div></article>`;
 }).join('');
}
export function characterChoices(characters,selected) {
 return characters.map(c=>`<label class="character-choice"><input type="checkbox" value="${esc(c.id)}" ${selected.has(c.id)?'checked':''}><span><strong>${esc(c.name)}</strong><small>${c.profile?`Lv.${c.profile.level} · ${esc(c.profile.world)}`:'내 캐릭터'}</small></span></label>`).join('');
}
