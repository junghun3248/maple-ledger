const origin='https://open.api.nexon.com/maplestory/v1/';
export async function nexonAction(body:any){
 const json=(v:unknown,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'no-store'}});
 const key=typeof body.apiKey==='string'?body.apiKey.trim():'';
 if(!/^[A-Za-z0-9_-]{32,256}$/.test(key))return json({error:'넥슨 Open API 키를 확인해 주세요.'},400);
 let path='character/list';
 if(body.action==='nexon-scheduler'){
  if(typeof body.ocid!=='string'||!/^\w{16,128}$/.test(body.ocid))return json({error:'캐릭터를 다시 선택해 주세요.'},400);
  path='scheduler/character-state?ocid='+encodeURIComponent(body.ocid);
 }
 try{
  const response=await fetch(origin+path,{headers:{'x-nxopen-api-key':key},signal:AbortSignal.timeout(15000),redirect:'manual'});
  if(!response.ok)return json({error:response.status===429?'넥슨 조회가 많아요. 잠시 후 다시 시도해 주세요.':response.status===403?'API 키의 권한과 본인 계정 캐릭터인지 확인해 주세요.':'넥슨에서 조회하지 못했어요. 키와 캐릭터 접속 여부를 확인해 주세요.'},response.status===429?429:400);
  const data:any=await response.json();
  if(body.action==='nexon-characters'){
   if(!Array.isArray(data.account_list))throw Error();
   const characters=data.account_list.flatMap((a:any)=>Array.isArray(a.character_list)?a.character_list:[]).map((c:any)=>({ocid:c.ocid,name:c.character_name,world:c.world_name,job:c.character_class,level:c.character_level}));
   return json({characters});
  }
  if(!Array.isArray(data.boss_contents))return json({error:'스케줄러 데이터가 없어요. 게임 접속 후 다시 시도해 주세요.'},404);
  return json({name:data.character_name,world:data.world_name,date:data.date,bosses:data.boss_contents.map((b:any)=>({name:b.content_name,difficulty:b.difficulty,cycle:b.cycle,registered:b.registration_flag===true||b.registration_flag==='true',complete:b.complete_flag===true||b.complete_flag==='true'||b.clear_flag===true||b.clear_flag==='true',order:b.list_order_no}))});
 }catch{return json({error:'넥슨 API 응답이 지연되거나 형식이 달라요. 잠시 후 다시 시도해 주세요.'},502)}
}
