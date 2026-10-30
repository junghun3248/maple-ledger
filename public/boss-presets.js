const lower=[['스우','하드'],['데미안','하드'],['루시드','하드'],['윌','하드'],['더스크','카오스'],['가디언 엔젤 슬라임','카오스'],['듄켈','하드'],['진 힐라','하드']];
export const presets=[
 {name:'하세이카 · 이지 대적자 포함',bosses:[...lower,['선택받은 세렌','하드'],['감시자 칼로스','이지'],['카링','이지'],['최초의 대적자','이지']]},
 {name:'노적자돌이',bosses:[...lower,['선택받은 세렌','하드'],['감시자 칼로스','노멀'],['카링','이지'],['최초의 대적자','노멀']]},
 {name:'하드 보스 8마리',bosses:lower}
];
export function selectionsFor(preset,catalog,party=1){
 return preset.bosses.map(([name,difficulty])=>{const b=catalog.find(b=>b.name===name&&b.difficulty===difficulty);if(!b)throw Error('프리셋에 필요한 보스가 목록에 없어요: '+name);return {name:b.name,bossId:b.id,party}});
}
export function checkRoster(selection,existing=[]){
 if(selection.length+existing.length>12)return '주간 보스는 다른 날짜 기록을 포함해 최대 12마리까지 선택해 주세요.';
 const names=[...existing.map(r=>r.name),...selection.map(r=>r.name)];
 if(new Set(names).size!==names.length)return '같은 주에는 한 보스를 한 번만 선택해 주세요. 난이도를 바꾸려면 기존 기록을 수정하세요.';
 return null;
}
