const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const context={window:{}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../public/ocr-reader.js'),'utf8'),context);
const resolve=context.window.MapleOCR.resolveFragment;
const readings=value=>[4,6,8].map(()=>({text:value,confidence:95}));
test('repeated 990 OCR cannot override a 900 game-font result',()=>{
  const result=resolve(readings('990'),'900');
  assert.equal(result.value,null);assert.equal(result.issue,'conflict');
});
test('conflict is rejected in either direction',()=>{
  assert.equal(resolve(readings('900'),'990').value,null);
});
test('0/9 OCR needs game-font verification even with high confidence',()=>{
  for(const value of ['900','990','99','0'])assert.equal(resolve(readings(value),null).value,null);
});
test('agreement accepts genuine 900 and genuine 990 without rewriting digits',()=>{
  for(const value of ['900','990','898','99','122','0'])assert.equal(resolve(readings(value),value).value,value);
});
test('font fallback cannot override a credible dissenting OCR reading',()=>{
  assert.equal(resolve([{text:'990',confidence:90}],'900').value,null);
});
test('font result works when OCR produces no readable digits',()=>{
  assert.equal(resolve([{text:'',confidence:0}],'900').value,'900');
});
test('other numbers retain OCR consensus and blank results stay blank',()=>{
  assert.equal(resolve(readings('21'),null).value,'21');
  assert.equal(resolve([],null).value,null);
});
