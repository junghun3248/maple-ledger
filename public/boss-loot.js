export function dropsFor(run,items,rules){
 const ids=rules[run.name+'|'+run.difficulty]||[],saved=new Map(run.drops.map(d=>[d.id,d]));
 return [...ids.map(id=>saved.get(id)||({...items.find(i=>i.id===id),selected:false,qty:1,price:''})).filter(d=>d.id),...run.drops.filter(d=>!ids.includes(d.id))];
}
export function toggleDrop(run,id,items,rules){
 if(id===BOX_ID)return false;
 let d=run.drops.find(d=>d.id===id);
 if(!d){const item=dropsFor(run,items,rules).find(d=>d.id===id);if(!item||run.drops.length>=50)return false;d={...item};run.drops.push(d)}
 d.selected=!d.selected;return true;
}
export const BOX_ID='item-38';
export const BOX_REWARDS=['item-0','item-1','item-2','item-3','item-4','item-6','item-5'];
export const isBoxReward=d=>/^box-item-[0-6]$/.test(d.id);
export function toggleBoxReward(run,id,items){
 if(!BOX_REWARDS.includes(id))return false;
 const resultId='box-'+id;
 let drop=run.drops.find(d=>d.id===resultId);
 if(!drop){const item=items.find(i=>i.id===id);if(!item||run.drops.length>=50)return false;drop={...item,id:resultId,name:item.name+' · 칠흑 상자',selected:false,qty:1,price:''};run.drops.push(drop)}
 drop.selected=!drop.selected;return true;
}
