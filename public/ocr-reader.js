(function(root){
  let templatePromise, koreanWorker, digitWorker;
  const makeCanvas=(w,h)=>{const c=document.createElement('canvas');c.width=Math.max(1,Math.round(w));c.height=Math.max(1,Math.round(h));return c;};
  function rawCrop(image,box){
    const x=Math.max(0,Math.round(box.x)),y=Math.max(0,Math.round(box.y));
    const w=Math.min(Math.floor(box.w),image.width-x),h=Math.min(Math.round(box.h),image.height-y);
    if(w<1||h<1)throw Error('Invalid image region');
    const c=makeCanvas(w,h);c.getContext('2d').drawImage(image,x,y,w,h,0,0,w,h);return c;
  }
  function enlarged(source,scale,threshold=0,smooth=false){
    const c=makeCanvas(source.width*scale+40,source.height*scale+40),ctx=c.getContext('2d',{willReadFrequently:true});
    ctx.fillStyle='white';ctx.fillRect(0,0,c.width,c.height);ctx.imageSmoothingEnabled=smooth;ctx.imageSmoothingQuality="high";ctx.drawImage(source,20,20,c.width-40,c.height-40);
    if(threshold){const frame=ctx.getImageData(0,0,c.width,c.height);for(let i=0;i<frame.data.length;i+=4){const gray=.299*frame.data[i]+.587*frame.data[i+1]+.114*frame.data[i+2];const v=gray<threshold?0:255;frame.data[i]=frame.data[i+1]=frame.data[i+2]=v}ctx.putImageData(frame,0,0)}
    return c;
  }
  function trimCount(source){
    const normalized=makeCanvas(40,13),ctx=normalized.getContext('2d',{willReadFrequently:true});ctx.drawImage(source,0,0,40,13);
    const pixels=ctx.getImageData(0,0,40,13).data;let end=-1;
    for(let y=9;y<=11;y++)for(let x=0;x<40;x++){const i=(y*40+x)*4;if(pixels[i]+pixels[i+1]+pixels[i+2]<420)end=Math.max(end,x)}
    if(end<2)return null;
    const cropped=makeCanvas(end+1,13);cropped.getContext('2d').drawImage(normalized,0,0,end+1,13,0,0,end+1,13);return cropped;
  }
  function agree(results,parse){
    const groups=new Map();for(const r of results){const value=parse(r.text);if(value===null||r.confidence<35)continue;const group=groups.get(value)||{value,count:0,confidence:0};group.count++;group.confidence+=r.confidence;groups.set(value,group)}
    const ranked=[...groups.values()].sort((a,b)=>b.count-a.count||b.confidence-a.confidence),best=ranked[0];
    if(!best||best.count<2||best.confidence/best.count<55||ranked[1]?.count>=best.count)return null;return best.value;
  }
  function resolveFragment(results,glyph){
    const parse=text=>/^\d{1,4}$/.test(text.trim())?String(Number(text.trim())):null;
    const ocr=agree(results,parse);
    const credible=results.filter(r=>r.confidence>=70).map(r=>parse(r.text)).filter(v=>v!==null);
    // Repeated OCR runs can repeat the same 0/9 error. Always consult the game font.
    if(glyph!==null){
      if((ocr!==null&&ocr!==glyph)||credible.some(v=>v!==glyph))return {value:null,issue:'conflict'};
      return {value:glyph,issue:null,assisted:ocr===null};
    }
    if(ocr!==null&&/[09]/.test(ocr))return {value:null,issue:'unverified'};
    return {value:ocr,issue:null,assisted:false};
  }
  async function detect(image){
    // Bound work for large screenshots, preserving the image aspect ratio.
    const ratio=Math.min(1,1920/image.width),c=makeCanvas(image.width*ratio,image.height*ratio),ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0,c.width,c.height);
    const frame=ctx.getImageData(0,0,c.width,c.height),meso=MapleFields.findMesoField(frame.data,c.width,c.height);
    const template=await(templatePromise ||=fetch('/fragment-template.json').then(r=>{if(!r.ok)throw Error('Template unavailable');return r.json()}));
    const fragment=MapleFields.findFragment(frame.data,c.width,c.height,template,meso);
    const original=b=>b?{...b,x:b.x/ratio,y:b.y/ratio,w:b.w/ratio,h:b.h/ratio}:null;
    // The lower two pixels are the slot border, not part of the item count.
    if(fragment)fragment.h=fragment.h*13/15;
    return {meso:original(meso),fragment:original(fragment)};
  }
  async function read(image,fields,report){
    let meso=null,fragment=null,assisted=false,fragmentIssue=null;
    if(fields.meso){
      report('메소 칸 전체 · 억·만 단위 확인 중…');
      const worker=await(koreanWorker ||=Tesseract.createWorker('kor',1,{langPath:'https://tessdata.projectnaptha.com/4.0.0'}));
      await worker.setParameters({tessedit_char_whitelist:'0123456789억만조, ',tessedit_pageseg_mode:'7'});
      const crop=rawCrop(image,fields.meso),results=[];
      const scale=Math.max(1,Math.min(4,48/crop.height));
      for(const threshold of [0,140,170])results.push((await worker.recognize(enlarged(crop,scale,threshold,true))).data);
      meso=agree(results,MapleFields.parseMeso);
    }
    if(fields.fragment){
      report('솔 에르다 조각 · 수량 확인 중…');
      const worker=await(digitWorker ||=Tesseract.createWorker('eng'));
      await worker.setParameters({tessedit_char_whitelist:'0123456789',tessedit_pageseg_mode:'7'});
      const trimmed=trimCount(rawCrop(image,fields.fragment)),results=[];
      if(trimmed)for(const scale of [4,6,8])results.push((await worker.recognize(enlarged(trimmed,scale))).data);
      const decision=resolveFragment(results,await MapleGlyphs.read(rawCrop(image,fields.fragment)));
      fragment=decision.value;fragmentIssue=decision.issue;assisted=fragment!==null&&decision.assisted;
    }
    return {meso,fragment,assisted,fragmentIssue};
  }
  async function resetWorkers(){for(const p of [koreanWorker,digitWorker])if(p)try{await(await p).terminate()}catch{}koreanWorker=null;digitWorker=null;}
  root.MapleOCR={detect,read,rawCrop,enlarged,agree,resolveFragment,resetWorkers};
})(window);
