import {weekKey} from './boss-model.js';
const difficulties={easy:'이지',normal:'노멀',hard:'하드',chaos:'카오스',extreme:'익스트림'};
const normalize=s=>String(s).replace(/\s/g,'');
export function schedulerSelection(rows,catalog){
 const selected=[],unknown=[];
 for(const r of rows.filter(r=>r.registered&&r.cycle==='bossWeekly').sort((a,b)=>(a.order||0)-(b.order||0))){
  const difficulty=difficulties[r.difficulty]||r.difficulty;
  const boss=catalog.find(b=>b.period==='week'&&normalize(b.name)===normalize(r.name)&&b.difficulty===difficulty);
  if(boss)selected.push({...boss,complete:r.complete});else unknown.push(r.name+' · '+difficulty);
 }
 return {selected,unknown};
}
export function mergeScheduler(runs,selection,date,newId){
 const next=structuredClone(runs),conflicts=[];let added=0;
 for(const b of selection){
  const old=next.find(r=>r.period==='week'&&r.name===b.name&&weekKey(r.date)===weekKey(date));
  if(old){if(old.difficulty!==b.difficulty)conflicts.push(b.name);continue}
  const prior=[...runs].reverse().find(r=>r.name===b.name&&r.difficulty===b.difficulty);
  next.push({id:newId(),name:b.name,difficulty:b.difficulty,period:'week',date,party:prior?.party||1,crystal:String(b.price??b.crystal),fee:prior?.fee??500,cleared:true,drops:[]});added++;
 }
 return {runs:next,added,conflicts};
}
