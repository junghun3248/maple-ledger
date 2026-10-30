export const dateKey=(d=new Date())=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
export function weekKey(date){const d=new Date(date+'T12:00:00');d.setDate(d.getDate()-((d.getDay()+3)%7));return dateKey(d)}
export function settle(run){
  const party=BigInt(run.party),crystal=BigInt(run.crystal||0)/party;let loot=0n,remainder=0n,missing=0;
  for(const item of run.drops.filter(d=>d.selected)){
    if(!item.price){missing++;continue}
    const gross=BigInt(item.price)*BigInt(item.qty),net=gross*(10000n-BigInt(run.fee))/10000n;
    loot+=net/party;remainder+=net%party;
  }
  return {crystal,loot,total:crystal+loot,remainder,missing};
}
export function money(n){n=BigInt(n);if(!n)return '0';return [[1000000000000n,'조'],[100000000n,'억'],[10000n,'만'],[1n,'']].map(([unit,label])=>{const v=n/unit;n%=unit;return v?v.toLocaleString('ko-KR')+label:''}).filter(Boolean).join(' ')}
export function validState(s){
  const str=(v,max)=>typeof v==='string'&&v.length>0&&v.length<=max;
  const amount=v=>typeof v==='string'&&/^\d{1,15}$/.test(v);
  const integer=(v,a,b)=>Number.isInteger(v)&&v>=a&&v<=b;
  if(!s||!Array.isArray(s.characters)||s.characters.length>36)return false;
  if(s.presets!==undefined){
    if(!Array.isArray(s.presets)||s.presets.length>20)return false;
    for(const p of s.presets){if(!p||!str(p.name,40)||!Array.isArray(p.selection)||p.selection.length>12)return false;const names=new Set();for(const r of p.selection){if(!r||!str(r.name,60)||names.has(r.name)||!/^boss-\d+$/.test(r.bossId)||!integer(r.party,1,6))return false;names.add(r.name)}}
  }
  const ids=new Set();let total=0;
  for(const c of s.characters){
    if(c?.nexonId!==undefined&&(typeof c.nexonId!=='string'||!/^\w{16,128}$/.test(c.nexonId)))return false;
    if(!c||typeof c!=='object'||!str(c.id,80)||ids.has(c.id)||!str(c.name,40)||!Array.isArray(c.runs)||c.runs.length>200)return false;ids.add(c.id);
    if(c.profile!==undefined){const p=c.profile;if(!p||!str(p.world,40)||!str(p.job,60)||!integer(p.level,1,300)||typeof p.image!=='string'||p.image.length>5000||!(p.image===''||/^https:\/\/avatar\.maplestory\.nexon\.com\/[A-Za-z0-9/_.?=&%-]+$/.test(p.image))||!str(p.checkedAt,40))return false;}
    for(const r of c.runs){
      if(!r||typeof r!=='object'||++total>1000||!str(r.id,80)||ids.has(r.id)||!str(r.name,60)||!str(r.difficulty,20)||!['week','month'].includes(r.period)||!/^\d{4}-\d{2}-\d{2}$/.test(r.date)||Number.isNaN(Date.parse(r.date))||new Date(r.date).toISOString().slice(0,10)!==r.date||!integer(r.party,1,6)||!integer(r.fee,0,10000)||!amount(r.crystal)||typeof r.cleared!=='boolean'||!Array.isArray(r.drops)||r.drops.length>50)return false;ids.add(r.id);
      const drops=new Set();for(const d of r.drops){if(!d||typeof d!=='object'||!str(d.id,80)||drops.has(d.id)||!str(d.name,80)||typeof d.selected!=='boolean'||!integer(d.qty,1,99)||!(amount(d.price)||d.price==='')||!(d.icon===''||/^\/boss-icons\/item-\d+\.png$/.test(d.icon)))return false;drops.add(d.id)}
    }
  }
  return true;
}
