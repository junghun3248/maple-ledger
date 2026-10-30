import test from 'node:test';
import assert from 'node:assert/strict';
import {eligibleCharacter,mergeCharacterBatch} from '../public/boss-import.js';
import {nexonAction,combatPower} from '../app/api/ledger/nexon.ts';
const key='test_key_'.repeat(8),id=n=>String(n).repeat(32);
const chosen={ocid:id(1),name:'본캐',world:'루나',job:'라라',level:280};
const boss={name:'스우',difficulty:'하드',period:'week',price:100000000};
const draft=(c=chosen)=>({chosen:c,selection:{selected:[boss],unknown:[]},date:'2026-10-30'});
test('combat power excludes exactly ten million, missing and invalid values',()=>{
 assert.equal(eligibleCharacter({combatPower:10000000}),false);assert.equal(eligibleCharacter({combatPower:10000001}),true);
 assert.equal(eligibleCharacter({combatPower:null}),false);
 assert.equal(combatPower({final_stat:[{stat_name:'전투력',stat_value:'10000001'}]}),10000001);
 assert.equal(combatPower({final_stat:[]}),null);assert.equal(combatPower({final_stat:[{stat_name:'전투력',stat_value:'NaN'}]}),null);
});
test('multiple characters import atomically and reimport preserves party and drops',()=>{
 let next=0;const makeId=()=>String(++next),original={characters:[]};
 const first=mergeCharacterBatch(original,[draft(),draft({...chosen,ocid:id(2),name:'부캐'})],makeId);
 assert.equal(original.characters.length,0);assert.equal(first.state.characters.length,2);
 first.state.characters[0].runs[0].party=3;first.state.characters[0].runs[0].drops=[{id:'x',name:'아이템',icon:'',selected:true,qty:1,price:'1000000000'}];
 const again=mergeCharacterBatch(first.state,[draft()],makeId);assert.deepEqual(again.state.characters[0].runs,first.state.characters[0].runs);
 assert.equal(again.state.characters.length,2);assert.equal(again.added,0);
 const tooMany=Array.from({length:37},(_,i)=>draft({...chosen,name:'캐릭터'+i,ocid:String(i).padStart(32,'0')}));
 assert.throws(()=>mergeCharacterBatch(original,tooMany,makeId));assert.equal(original.characters.length,0);
});
test('power batches retain individual failures and never return keys',async()=>{
 const old=globalThis.fetch;let calls=0;
 globalThis.fetch=async(url,options)=>{calls++;assert.ok(url.startsWith('https://open.api.nexon.com/maplestory/v1/character/stat?ocid='));assert.equal(options.headers['x-nxopen-api-key'],key);return url.endsWith(id(2))?new Response('',{status:429}):Response.json({final_stat:[{stat_name:'전투력',stat_value:'20000000'}]})};
 try{
  const response=await nexonAction({action:'nexon-powers',apiKey:key,ocids:[id(1),id(2)]});const data=await response.json();
  assert.equal(data.results[0].combatPower,20000000);assert.equal(data.results[1].status,429);assert.ok(!JSON.stringify(data).includes(key));
  assert.equal((await nexonAction({action:'nexon-powers',apiKey:key,ocids:Array(9).fill(id(1))})).status,400);assert.equal(calls,2);
 }finally{globalThis.fetch=old}
});
test('scheduler batches return successes alongside missing scheduler data',async()=>{
 const old=globalThis.fetch;globalThis.fetch=async url=>Response.json(url.endsWith(id(1))?{date:'2026-10-30',boss_contents:[{content_name:'스우',difficulty:'hard',cycle:'bossWeekly',registration_flag:true}]}:{});
 try{const data=await(await nexonAction({action:'nexon-schedulers',apiKey:key,ocids:[id(1),id(2)]})).json();assert.equal(data.results[0].bosses[0].registered,true);assert.ok(data.results[1].error)}finally{globalThis.fetch=old}
});
