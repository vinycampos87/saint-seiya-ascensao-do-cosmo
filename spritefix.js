'use strict';
/**
 * SAINT SEIYA — ASCENSÃO DO COSMO | PATCH VISUAL v0.6.1
 * Carrega sobre game.js, preservando progressão, combate e enfermaria.
 * Correção crucial: atlas são faixas de células de 128px com personagem
 * ocupando apenas uma parte; nunca ancorar a área TRANSPARENTE no solo.
 */
(function () {
  const PATCH='0.6.1';
  const DIRS={
    idle:{down:0,left:1,up:2,right:3},
    walk:{down:5,left:6,up:8,right:7},
    attack:{down:13,left:14,up:17,right:15},
    meteor:{down:30,left:31,up:32,right:33}
  };
  const meta=new Map(), frameErrors=[];
  let imageLoads=0;
  function assetKey(id){return 'atlas_'+String(id).padStart(2,'0');}
  function alphaBox(bytes, imgW, x0, y0, cw, ch){
    let l=cw,t=ch,r=-1,b=-1,total=0;
    // Pixels de alpha > 60: ignora halos transparentes e anti-alias residual.
    for(let yy=0;yy<ch;yy++){
      let at=((y0+yy)*imgW+x0)*4;
      for(let xx=0;xx<cw;xx++,at+=4){
        if(bytes[at+3]<60)continue;
        ++total;if(xx<l)l=xx;if(xx>r)r=xx;
        if(yy<t)t=yy;if(yy>b)b=yy;
      }
    }
    if(total<25||r<l||b<t)return null;
    return {l,t,r,b,width:r-l+1,height:b-t+1};
  }
  function analyze(key){
    if(meta.has(key))return meta.get(key);
    const img=IMAGES[key];
    if(!img||!img.complete||!img.naturalWidth)return null;
    try {
      const cell=img.naturalHeight; // TODAS as folhas de movimento = 128x128.
      const n=Math.max(1,Math.floor(img.naturalWidth/cell));
      const surface=document.createElement('canvas');
      surface.width=img.naturalWidth;surface.height=img.naturalHeight;
      const painter=surface.getContext('2d',{willReadFrequently:true});
      painter.drawImage(img,0,0);
      const rgba=painter.getImageData(0,0,surface.width,surface.height).data;
      let minX=cell,maxX=-1,maxH=1;
      const frames=[];
      for(let i=0;i<n;i++){
        const box=alphaBox(rgba,img.naturalWidth,i*cell,0,cell,cell);
        frames.push(box);
        if(box){
          minX=Math.min(minX,box.l);maxX=Math.max(maxX,box.r);
          maxH=Math.max(maxH,box.height);
        }
      }
      const result={img,cell,n,frames,pivotX:(minX+maxX)/2,maxH};
      meta.set(key,result);
      return result;
    } catch (err) {
      // Falha de leitura alfa não derruba o jogo; contabiliza o asset.
      frameErrors.push({key,error:String(err)});
      meta.set(key,false);
      return false;
    }
  }
  function drawAtlas(key,x,groundY,wantedH,frameIndex,opts={}){
    const m=analyze(key);
    if(!m||!m.n)return false;
    let idx=((Math.floor(frameIndex)%m.n)+m.n)%m.n;
    let box=m.frames[idx];
    if(!box)box=m.frames.find(Boolean);
    if(!box)return false;
    // Mesma escala durante TODO o ciclo. A queda de altura da ação é real.
    const sc=wantedH/Math.max(m.maxH,1);
    let posX=Math.round(x+(box.l-m.pivotX)*sc);
    let posY=Math.round(groundY-box.height*sc);
    const drawW=Math.max(1,Math.round(box.width*sc));
    const drawH=Math.max(1,Math.round(box.height*sc));
    ctx.save();
    ctx.imageSmoothingEnabled=false;
    if(opts.hurt){
      ctx.shadowColor='#ff9a63';ctx.shadowBlur=12;
      // Sem modificar opacidade: evita piscar/sumir ao sofrer dano.
    }
    if(opts.mirror){
      ctx.translate(Math.round(x)*2,0);
      posX=-posX-drawW;
    }
    ctx.drawImage(m.img,idx*m.cell+box.l,box.t,box.width,box.height,
       posX,posY,drawW,drawH);
    ctx.restore();
    return true;
  }
  // No desenho dos sprites, y é SEMPRE o centro entre os pés no chão.
  sprite=function(name,x,y,scale=1.55,t=0,flash=false){
    const isEnemy=name==='enemy';
    const bodyHeight=isEnemy?142:169;
    return drawAtlas(name,x,y,bodyHeight,Math.floor(t),{hurt:flash});
  };
  // Nunca escalar o retrato estático atlas_04 como animação.
  const shadow=function(x,y,width=53){
    ctx.save();ctx.globalAlpha=.34;ctx.fillStyle='#24170c';
    ctx.shadowColor='#1b110b';ctx.shadowBlur=8;
    ctx.beginPath();ctx.ellipse(x,y+5,width,12,0,0,Math.PI*2);
    ctx.fill();ctx.restore();
  };
  // Substitui índices errados de anterior: 08 é costas, não perfil direita.
  for(const state of Object.keys(DIRS))Object.assign(FRAME[state],DIRS[state]);
  renderPlayer=function(){
    const p=S.player;
    shadow(p.x,p.y,47);
    let state=p.walking?'walk':'idle';
    if(S.now<p.attackUntil)state=S.now<S.meteorUntil?'meteor':'attack';
    const key=assetKey(DIRS[state][p.dir] ?? DIRS[state].down);
    const clock=state==='walk'?(p.walkCycle||0):
      state==='idle'?Math.floor(S.now/620):
      state==='attack'?Math.floor((p.attackUntil-S.now)*-0.026+9):
      Math.floor((S.meteorUntil-S.now)*-0.018+10);
    if(!drawAtlas(key,p.x,p.y,171,clock,{hurt:p.hurtUntil>S.now})){
      ctx.fillStyle='#ae3f2c';ctx.fillRect(p.x-14,p.y-120,28,120);
    }
    if(S.now<S.meteorUntil){
      const remain=Math.max(0,Math.min(1,(S.meteorUntil-S.now)/630));
      const vx=({right:1,left:-1,up:0,down:0})[p.dir];
      const vy=({right:0,left:0,up:-1,down:1})[p.dir];
      const duration=1-remain;
      ctx.save();ctx.globalCompositeOperation='lighter';
      for(let i=0;i<10;i++){
        const reach=95+260*duration+i*12;
        const side=(i-4.5)*16;
        const bx=p.x+vx*reach-vy*side;
        const by=p.y-87+vy*reach*.47+vx*side*.32;
        ctx.globalAlpha=(.25+remain*.58)*(1-i/18);
        ctx.strokeStyle=i%3===0?'#fff7cf':'#65c8f6';
        ctx.lineWidth=i%3===0?6:3;
        ctx.beginPath();
        ctx.moveTo(p.x+vx*35,p.y-85+vy*23);
        ctx.lineTo(bx,by);ctx.stroke();
        ctx.beginPath();ctx.arc(bx,by,5+i%3,0,Math.PI*2);ctx.fillStyle=ctx.strokeStyle;ctx.fill();
      }
      ctx.restore();
    }
  };
  renderEnemy=function(e){
    shadow(e.x,e.y,37);
    const close=Math.hypot(e.x-S.player.x,e.y-S.player.y)<135;
    const t=Math.floor(S.now/(close?175:115));
    // O inimigo usa atlas próprio com frames 96x96 e mesma ancoragem.
    drawAtlas('enemy',e.x,e.y,142,t,{hurt:e.hurtUntil>S.now,mirror:e.x>S.player.x});
    const width=70,barY=e.y-155;
    ctx.save();
    ctx.fillStyle='#091523db';ctx.fillRect(e.x-width/2-2,barY-2,width+4,11);
    ctx.fillStyle='#ae463a';ctx.fillRect(e.x-width/2,barY,width*Math.max(0,e.hp/e.max),6);
    ctx.strokeStyle='#e0be76';ctx.lineWidth=1;ctx.strokeRect(e.x-width/2-1,barY-1,width+2,8);
    ctx.restore();
  };
  // A animação avança somente quando a posição muda de verdade.
  const originalUpdate=update;
  update=function(dt){
    const oldX=S.player.x,oldY=S.player.y;
    originalUpdate(dt);
    if(S.infirmary||S.paused)return;
    const traveled=Math.hypot(S.player.x-oldX,S.player.y-oldY);
    S.player.walking=traveled>.20;
    if(S.player.walking){
      S.player.walkCycle=(S.player.walkCycle||0)+dt*11.5;
      if(S.player.walkCycle>8000)S.player.walkCycle%=8000;
    } else {
      S.player.walkCycle=0;
    }
  };
  // Golpe manual respeita a direção pedida, não vira para o inimigo sozinho.
  attack=function(){
    if(S.paused||S.infirmary||S.now<S.attackReady)return false;
    S.attackReady=S.now+390;
    S.player.attackUntil=S.now+290;
    const p=S.player,vector={
      down:[0,1],up:[0,-1],left:[-1,0],right:[1,0]
    }[p.dir];
    let target=null,dist=200;
    for(const e of S.enemies){
      const dx=e.x-p.x,dy=e.y-p.y,d=Math.hypot(dx,dy);
      if(d>dist||d<1)continue;
      const dot=(dx*vector[0]+dy*vector[1])/d;
      if(dot<.05)continue;
      dist=d;target=e;
    }
    if(target){
      hitEnemy(target,28+S.level*5);
      S.cosmo=clamp(S.cosmo+8,0,100);
      notify('⚔ GOLPE DE PÉGASO',.7);
    } else {
      notify('GOLPE NO VAZIO · APROXIME-SE DO ALVO',.65);
    }
    return true;
  };
  // A aplicação antiga vinculou botões antes de carregar este patch.
  // Captura os cliques para impedir execução DUPLA do ataque antigo.
  for(const id of ['attackBtn','touchAttack']){
    const control=$(id);
    if(control) control.addEventListener('click',ev=>{
      ev.stopImmediatePropagation();
      attack();
    },true);
  }
  // Controles: não permitir que um botão focado roube as teclas de movimento.
  const stage=$('world');
  stage.setAttribute('tabindex','0');
  stage.setAttribute('aria-label','Campo de Provas: WASD ou setas para caminhar, J soco, K Meteoro');
  stage.addEventListener('pointerdown',()=>stage.focus(),{passive:true});
  window.addEventListener('blur',()=>{S.player.walkCycle=0});
  // Retrato do HUD da demo anterior estava usando uma spritesheet incorreta.
  const portrait=document.querySelector('.avatar img');
  if(portrait) portrait.src='./assets/atlas_04.png';
  document.documentElement.dataset.gamepatch=PATCH;
  window.__saintSeiyaDiagnostics={
    version:PATCH,
    get state(){return {x:S.player.x,y:S.player.y,direction:S.player.dir,
      moving:S.player.walking,level:S.level,xp:S.xp,coins:S.coins,
      inInfirmary:S.infirmary,healed:S.healed};},
    get atlases(){return [...meta.entries()].map(([key,m])=>({
      key,frames:m&&m.n,referenceHeight:m&&m.maxH,found:!!m}));},
    get errors(){return [...frameErrors]},
    // Testes de progresso: executam em cópia de memória, sem apagar salvamento.
    integrity(){
      const walk=Object.values(DIRS.walk).every(id=>id!==4);
      const sheet=Object.keys(DIRS).every(k=>Object.keys(DIRS[k]).length===4);
      const position=inField(S.player.x,S.player.y);
      return {walkDirectionsMapped:walk,fourDirectionsPerAction:sheet,
        characterWithinArena:position,images:ASSETS&&Object.keys(ASSETS).length,
        errors:frameErrors.length};
    }
  };
  console.info('Saint Seiya: correção de sprites, direções e chão ativa · '+PATCH);
})();