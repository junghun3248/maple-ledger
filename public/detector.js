/* Inventory UI template detector. This is template matching, not a trained neural model. */
(function(root){
function detect(data,w,h,t){
 const candidates=[];
 function score(x,y,s,quick){let total=0,n=0;for(let i=0;i<t.length;i+=quick?9:1){const p=t[i],xx=Math.round(x+p[0]*s),yy=Math.round(y+p[1]*s);if(xx<0||xx>=w||yy<0||yy>=h)return 255;const at=(yy*w+xx)*4;total+=Math.abs(data[at]-p[2])+Math.abs(data[at+1]-p[3])+Math.abs(data[at+2]-p[4]);n+=3}return total/n}
 for(let si=14;si<=26;si++){const s=si/20;for(let y=0;y<h-12*s;y+=2)for(let x=0;x<w-55*s;x+=3){const q=score(x,y,s,true);if(q<36){const full=score(x,y,s,false);if(full<42){const old=candidates.find(a=>a.s===s);if(!old)candidates.push({x,y,s,score:full});else if(full<old.score)Object.assign(old,{x,y,score:full})}}}}
 candidates.sort((a,b)=>a.score-b.score);let best={score:255};
 for(const c of candidates)for(let ds=-2;ds<=2;ds++)for(let dy=-2;dy<=2;dy++)for(let dx=-3;dx<=3;dx++){const x=c.x+dx,y=c.y+dy,s=c.s+ds*.01,v=score(x,y,s,false);if(v<best.score)best={x,y,s,score:v}}
 if(best.score>=30)return null;best.s=Math.round(best.s*20)/20;return best;
}
root.InventoryDetector={detect};
})(typeof window==='undefined'?globalThis:window);
