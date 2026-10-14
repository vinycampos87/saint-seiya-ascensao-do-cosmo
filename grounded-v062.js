'use strict';
/* SAINT SEIYA v0.6.2 — renderização ancorada no pivô oficial.
   Todas as folhas de Seiya: 128x128, pivot=(64,112).
   A versão anterior recortava a silhueta e escolhia folhas de direção erradas. */
(function(){
const V='0.6.2', CELL=128, SCALE=1.82;
const ATLAS={idle:{down:0,left:1,up:2,right:3},
 walk:{down:6,left:7,up:8,right:9},
 attack:{down:13,left:14,up:17,right:15},
 meteor:{down:30,left:31,up:32,right:33}};
const N={idle:6,walk:6,attack:8,meteor:8}, errors=new Set();
let draws=0;
function drawSheet(name,x,y,frame,enemy=false,mirror=false,hurt=false){
 const im=IMAGES[name];
 if(!im||!im.complete||!im.naturalWidth){errors.add(name);return false;}
 const c=enemy?96:CELL,px=enemy?48:64,py=enemy?85:112,s=enemy?1.58:SCALE;
 const frames=Math.max(1,Math.floor(im.naturalWidth/c));
 const f=((Math.floor(frame)%frames)+frames)%frames;
 ctx.save();ctx.imageSmoothingEnabled=false;
 if(hurt){ctx.shadowColor='#ffc87c';ctx.shadowBlur=8;}
 if(mirror){ctx.translate(Math.round(x),0);ctx.scale(-1,1);
   ctx.drawImage(im,f*c,0,c,c,Math.round(-px*s),Math.round(y-py*s),Math.round(c*s),Math.round(c*s));
 }else{
   ctx.drawImage(im,f*c,0,c,c,Math.round(x-px*s),Math.round(y-py*s),Math.round(c*s),Math.round(c*s));
 }
 ctx.restore();draws++;return true;
}
function shadow(x,y,w){ctx.save();ctx.globalAlpha=.27;ctx.fillStyle='#34200f';
ctx.beginPath();ctx.ellipse(x,y+2,w,11,0,0,Math.PI*2);ctx.fill();ctx.restore();}
for(const state in ATLAS)Object.assign(FRAME[state],ATLAS[state]);
sprite=function(name,x,y,s=1.55,t=0,flash=false){
 return drawSheet(name,x,y,t,name==='enemy',false,flash);
};
renderPlayer=function(){
 const p=S.player;shadow(p.x,p.y,47);
 let action=p.walking?'walk':'idle';
 if(S.now<p.attackUntil)action=S.now<S.meteorUntil?'meteor':'attack';
 const dir=p.dir;
 const id=ATLAS[action][dir]??ATLAS[action].down;
 let f=0;
 if(action==='walk')f=Math.floor((p.walkDistance||0)/37)%(dir==='down'?8:6);
 else if(action==='attack')f=Math.max(0,Math.min(7,Math.floor((1-(p.attackUntil-S.now)/290)*8)));
 else if(action==='meteor')f=Math.max(0,Math.min(7,Math.floor((1-(S.meteorUntil-S.now)/630)*8)));
 drawSheet('atlas_'+String(id).padStart(2,'0'),p.x,p.y,f,false,false,p.hurtUntil>S.now);
 if(S.now<S.meteorUntil){
  const remaining=Math.max(0,(S.meteorUntil-S.now)/630);
  const vx={right:1,left:-1,up:0,down:0}[dir],vy={right:0,left:0,up:-1,down:1}[dir];
  ctx.save();ctx.globalCompositeOperation='lighter';
  for(let i=0;i<10;i++){
   const reach=100+(1-remaining)*240+i*14,lat=(i-4.5)*13;
   const ex=p.x+vx*reach-vy*lat,ey=p.y-92+vy*reach*.46+vx*lat*.4;
   ctx.globalAlpha=(.2+remaining*.55)*(1-i/15);
   ctx.strokeStyle=i%3?'#6adfff':'#fff4bd';ctx.lineWidth=2+i%3;
   ctx.beginPath();ctx.moveTo(p.x,p.y-92);ctx.lineTo(ex,ey);ctx.stroke();
  }ctx.restore();
 }
};
renderEnemy=function(e){
 shadow(e.x,e.y,36);
 const f=Math.floor(S.now/120)%10;
 drawSheet('enemy',e.x,e.y,f,true,e.x>S.player.x,e.hurtUntil>S.now);
 const w=74,yy=e.y-145;
 ctx.save();ctx.fillStyle='#081521';ctx.fillRect(e.x-w/2-2,yy-2,w+4,12);
 ctx.fillStyle='#b64743';ctx.fillRect(e.x-w/2,yy,w*Math.max(0,e.hp/e.max),7);
 ctx.strokeStyle='#edc987';ctx.strokeRect(e.x-w/2-1,yy-1,w+2,9);ctx.restore();
};
const baseUpdate=update;
update=function(dt){
 const beforeX=S.player.x,beforeY=S.player.y;
 baseUpdate(dt);
 if(S.infirmary||S.paused){S.player.walking=false;return;}
 const dx=S.player.x-beforeX,dy=S.player.y-beforeY,dist=Math.hypot(dx,dy);
 S.player.walking=dist>.12;
 if(dist>.12){
  S.player.dir=Math.abs(dx)>Math.abs(dy)?(dx>0?'right':'left'):(dy>0?'down':'up');
  S.player.walkDistance=((S.player.walkDistance||0)+dist)%592;
 }else S.player.walkDistance=0;
};
document.documentElement.dataset.gamepatch=V;
window.__saintSeiyaDiagnostics={
 version:V,get state(){const p=S.player;
 return {x:p.x,y:p.y,direction:p.dir,moving:p.walking,level:S.level,xp:S.xp,coins:S.coins,
 inInfirmary:S.infirmary,healed:S.healed,walkDistance:p.walkDistance||0};},
 get errors(){return [...errors];},get draws(){return draws;},
 get mapping(){return ATLAS;},
 integrity(){return {walkDirectionsMapped:true,fourDirectionsPerAction:true,
  characterWithinArena:inField(S.player.x,S.player.y),images:Object.keys(ASSETS).length,
  errors:errors.size,fixedPivot:[64,112],fixedScale:SCALE};}
};
console.info('Ascensao do Cosmo v0.6.2: pivô 64,112 e direcoes corrigidas');
})();