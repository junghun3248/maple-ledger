const origin='https://open.api.nexon.com/maplestory/v1/';
const validOcid=(id:unknown)=>typeof id==='string'&&/^\w{16,128}$/.test(id);
const json=(v:unknown,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'no-store'}});
function scheduler(data:any){
 if(!Array.isArray(data.boss_contents))throw Error('스케줄러 데이터가 없어요. 게임 접속 후 다시 시도해 주세요.');
 return {name:data.character_name,world:data.world_name,date:data.date,bosses:data.boss_contents.map((b:any)=>({name:b.content_name,difficulty:b.difficulty,cycle:b.cycle,registered:b.registration_flag===true||b.registration_flag==='true',complete:b.complete_flag===true||b.complete_flag==='true'||b.clear_flag===true||b.clear_flag==='true',order:b.list_order_no}))};
}
export function combatPower(data:any):number|null{
 const value=data?.final_stat?.find((s:any)=>s.stat_name==='전투력')?.stat_value;
 if(typeof value!=='string'||!/^\d+$/.test(value))return null;
 const number=Number(value);return Number.isSafeInteger(number)&&number>=0?number:null;
}
export async function nexonAction(body:any){
 const key=typeof body.apiKey==='string'?body.apiKey.trim():'';
 if(!/^[A-Za-z0-9_-]{32,256}$/.test(key))return json({error:'넥슨 Open API 키를 확인해 주세요.'},400);
 async function read(path:string){
  const response=await fetch(origin+path,{headers:{'x-nxopen-api-key':key},signal:AbortSignal.timeout(15000),redirect:'manual'});
  if(!response.ok){const error:any=Error(response.status===429?'넥슨 조회가 많아요. 잠시 후 다시 시도해 주세요.':response.status===403?'API 키의 권한과 본인 계정 캐릭터인지 확인해 주세요.':'넥슨에서 조회하지 못했어요. 키와 캐릭터 접속 여부를 확인해 주세요.');error.status=response.status===429?429:400;throw error}
  return response.json();
 }
 try{
  if(body.action==='nexon-powers'||body.action==='nexon-schedulers'){
   if(!Array.isArray(body.ocids)||body.ocids.length<1||body.ocids.length>8||!body.ocids.every(validOcid)||new Set(body.ocids).size!==body.ocids.length)return json({error:'캐릭터는 한 요청에 1~8명까지 조회할 수 있어요.'},400);
   const results=await Promise.all(body.ocids.map(async(ocid:string)=>{
    try{
     if(body.action==='nexon-powers'){
      const power=combatPower(await read('character/stat?ocid='+encodeURIComponent(ocid)));
      return power===null?{ocid,error:'전투력 정보가 없어요.'}:{ocid,combatPower:power};
     }
     return {ocid,...scheduler(await read('scheduler/character-state?ocid='+encodeURIComponent(ocid)))};
    }catch(e:any){return {ocid,error:e?.status?e.message:'캐릭터 조회가 지연되었거나 정보가 없어요.',status:e?.status||502}}
   }));
   return json({results});
  }
  if(body.action==='nexon-characters'){
   const data:any=await read('character/list');if(!Array.isArray(data.account_list))throw Error();
   const characters=data.account_list.flatMap((a:any)=>Array.isArray(a.character_list)?a.character_list:[]).map((c:any)=>({ocid:c.ocid,name:c.character_name,world:c.world_name,job:c.character_class,level:c.character_level}));
   return json({characters});
  }
  if(body.action!=='nexon-scheduler'||!validOcid(body.ocid))return json({error:'캐릭터를 다시 선택해 주세요.'},400);
  return json(scheduler(await read('scheduler/character-state?ocid='+encodeURIComponent(body.ocid))));
 }catch(e:any){return json({error:e?.status?e.message:'넥슨 API 응답이 지연되거나 형식이 달라요. 잠시 후 다시 시도해 주세요.'},e?.status||502)}
}
