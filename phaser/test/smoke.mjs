import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:1600,height:960},deviceScaleFactor:1});
const errors=[],missing=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('response',r=>{if(r.status()>=400)missing.push(r.status()+' '+r.url())});
try{
 await page.goto('http://127.0.0.1:4175/',{waitUntil:'networkidle',timeout:75000});
 await page.waitForFunction(()=>!!window.__ascensaoScene,{timeout:30000});
 await page.waitForTimeout(1300);
 // A janela do jogo precisa ocupar o viewport inteiro. Não há quadros inferiores.
 const layout=await page.evaluate(()=>{
   const r=document.querySelector('.full-game').getBoundingClientRect();
   const scene=document.querySelector('.battle-viewport').getBoundingClientRect();
   const cn=document.querySelector('.phaser-host canvas').getBoundingClientRect();
   return {viewport:[innerWidth,innerHeight],root:[r.width,r.height],scene:[scene.width,scene.height],
     canvas:[cn.width,cn.height],oldPanels:document.querySelectorAll('.arena-lowerbar,.action-bar,.side,.instructions').length};
 });
 assert.deepEqual(layout.root,layout.viewport,'Jogo não ocupa a janela inteira');
 assert.deepEqual(layout.scene,layout.viewport,'Arena não ocupa a janela inteira');
 assert(layout.canvas[0]>=layout.viewport[0]-2 && layout.canvas[1]>=layout.viewport[1]-2,
  'Canvas não cobre a janela: '+JSON.stringify(layout));
 assert.equal(layout.oldPanels,0,'Existem painéis antigos ocupando espaço');
 const toggle=page.locator('#menuToggle');
 await toggle.click();
 await page.locator('#gameMenu').waitFor({state:'visible'});
 assert.equal(await toggle.getAttribute('aria-expanded'),'true');
 await toggle.click();
 await page.locator('#gameMenu').waitFor({state:'detached'});
 assert.equal(await toggle.getAttribute('aria-expanded'),'false');
 const boot=await page.evaluate(()=>{
  const sc=window.__ascensaoScene,p=sc.player;
  return {active:sc.scene.isActive(),x:p.x,y:p.y,origin:[p.originX,p.originY],
   dir:sc.facing,keys:['seiya_down_idle','seiya_left_run','seiya_right_run','seiya_up_run','seiya_down_4b','seiya_right_vfx'].map(k=>({k,exists:sc.textures.exists(k)})),
   hasBackground:sc.textures.exists('sanctuaryArena4k'),
   enemy:['captainEnemyIdle','captainEnemyRun','captainEnemyAttack','captainEnemyShieldAttack','captainShield'].every(k=>sc.textures.exists(k)),
   cleanIdles:['down','up','left','right'].every(d=>sc.textures.exists('seiya_'+d+'_idle_clean'))};
 });
 assert(boot.active,'Phaser não iniciou');
 assert(await page.evaluate(()=>window.__ascensaoScene.enemyList.every(e=>e.shield.visible)),
   'Capitao em descanso sem escudo no braco');
 assert.deepEqual(boot.origin,[.5,.875],'Pivô do sprite não é 64/112');
 assert(boot.keys.every(x=>x.exists),'Sprite faltando: '+JSON.stringify(boot.keys));
 assert(boot.hasBackground&&boot.enemy&&boot.cleanIdles,'Cenário ou sprites do Capitão/Seiya ausentes');
 // QA de pixels: os dois pés dos idles são preservados por espelhamento,
 // e a altura visivel do Capitao deve ser apenas levemente maior.
 const visual=await page.evaluate(()=>{
   const sc=window.__ascensaoScene;
   const pixels=(key)=>{
     const im=sc.textures.get(key).getSourceImage();
     const canvas=document.createElement('canvas');canvas.width=im.width;canvas.height=im.height;
     const ctx=canvas.getContext('2d',{willReadFrequently:true});
     ctx.drawImage(im,0,0);return {width:im.width,height:im.height,rgba:ctx.getImageData(0,0,im.width,im.height).data};
   };
   const bbox=(im)=>{
     let l=im.width,r=-1,t=im.height,b=-1;
     for(let y=0;y<im.height;y++)for(let x=0;x<im.width;x++){
       if(im.rgba[(y*im.width+x)*4+3]<35)continue;
       l=Math.min(l,x);r=Math.max(r,x);t=Math.min(t,y);b=Math.max(b,y);
     }
     return {width:r-l+1,height:b-t+1};
   };
   const seiya=pixels('seiya_down_idle_clean'),cap=pixels('captainEnemyIdle');
   const left=pixels('seiya_left_idle_clean'),right=pixels('seiya_right_idle_clean');
   let mirrorDiff=0;
   for(let y=0;y<128;y++)for(let x=0;x<128;x++)
     if(left.rgba[(y*128+x)*4+3]!==right.rgba[(y*128+(127-x))*4+3])mirrorDiff++;
   return {seiya:bbox(seiya),cap:bbox(cap),mirrorDiff};
 });
 assert(visual.cap.height>=visual.seiya.height*1.02&&visual.cap.height<=visual.seiya.height*1.20,
    'Capitao desproporcional: '+JSON.stringify(visual));
 assert.equal(visual.mirrorDiff,0,'Idle lateral com pe cortado: '+JSON.stringify(visual));
 // Phaser converte as imagens em URLs blob:; confira os IDs nos fontes TS.
 const manifest=fs.readFileSync('src/shared/assetManifest.ts','utf8');
 assert(manifest.includes('attack3: {down:6,left:22,right:19,up:30}') &&
        manifest.includes("'4b': {down:24,left:31,right:25,up:32}") &&
        manifest.includes("'4c': {down:13,left:22,right:15,up:16}"),
    'Um ataque lateral voltou a usar atlas invertido ou com membros fantasma');

 // Regressao do moonwalk: a direcao do Capitao segue a distancia PERCORRIDA
 // e o escudo acompanha o flip, tanto na persecucao como no descanso.
 const captainDirection=await page.evaluate(()=>{
   const sc=window.__ascensaoScene, e=sc.enemyList.find(enemy=>enemy.alive);
   const prev={x:e.x,y:e.y,lastAttack:e.lastAttack,attackKind:e.attackKind,
     attackUntil:e.attackUntil,faceLeft:e.faceLeft};
   e.lastAttack=sc.simMs+100000;
   e.attackKind=null;e.attackUntil=0;
   const test=(x,y)=>{
     e.x=x;e.y=y;
     const before=e.x;
     sc.update(0,40);
     return {dx:e.x-before,flip:e.sprite.flipX,faceLeft:e.faceLeft,
       shieldFlip:e.shield.flipX,visible:e.shield.visible,key:e.sprite.texture.key};
   };
   const toLeft=test(sc.player.x+230,sc.player.y);
   const toRight=test(sc.player.x-230,sc.player.y);
   const idleLeft=test(sc.player.x+55,sc.player.y);
   const idleRight=test(sc.player.x-55,sc.player.y);
   e.x=prev.x;e.y=prev.y;e.lastAttack=prev.lastAttack;
   e.attackKind=prev.attackKind;e.attackUntil=prev.attackUntil;
   e.faceLeft=prev.faceLeft;
   e.sprite.setFlipX(e.faceLeft);
   return {toLeft,toRight,idleLeft,idleRight};
 });
 assert(captainDirection.toLeft.dx<-.1&&captainDirection.toLeft.flip&&
        captainDirection.toLeft.faceLeft&&captainDirection.toLeft.shieldFlip&&
        captainDirection.toLeft.visible&&captainDirection.toLeft.key==='captainEnemyRun',
    'Capitao caminhou para esquerda de costas: '+JSON.stringify(captainDirection));
 assert(captainDirection.toRight.dx>.1&&!captainDirection.toRight.flip&&
        !captainDirection.toRight.faceLeft&&!captainDirection.toRight.shieldFlip&&
        captainDirection.toRight.visible&&captainDirection.toRight.key==='captainEnemyRun',
    'Capitao caminhou para direita de costas: '+JSON.stringify(captainDirection));
 assert(captainDirection.idleLeft.flip&&captainDirection.idleLeft.shieldFlip&&
        captainDirection.idleLeft.key==='captainEnemyIdle'&&
        !captainDirection.idleRight.flip&&!captainDirection.idleRight.shieldFlip&&
        captainDirection.idleRight.key==='captainEnemyIdle',
    'Capitao virou para lado errado ao parar: '+JSON.stringify(captainDirection));

 // Todos os 8 quadros de corrida precisam manter perfil CONSISTENTE.
 // A folha antiga alternava perfis/frente/costas no meio do ciclo.
 const runSheetQA=await page.evaluate(()=>{
   const sc=window.__ascensaoScene;
   const im=sc.textures.get('captainEnemyRun').getSourceImage();
   const cv=document.createElement('canvas');
   cv.width=im.width;cv.height=im.height;
   const c=cv.getContext('2d',{willReadFrequently:true});c.drawImage(im,0,0);
   const rgba=c.getImageData(0,0,cv.width,cv.height).data;
   const width=128,height=128, mismatches=[];
   for(let f=2;f<8;f++){
     const source=f%2;
     let different=0;
     for(let y=0;y<height;y++)for(let x=0;x<width;x++){
       const a=(y*cv.width+f*width+x)*4;
       const b=(y*cv.width+source*width+x)*4;
       for(let channel=0;channel<4;channel++)if(rgba[a+channel]!==rgba[b+channel])different++;
     }
     mismatches.push(different);
   }
   return {frames:cv.width/128,mismatches};
 });
 assert(runSheetQA.frames===8&&runSheetQA.mismatches.every(n=>n===0),
   'Corrida mistura poses com orientacoes inconsistentes: '+JSON.stringify(runSheetQA));

 await page.keyboard.down('d'); await page.waitForTimeout(150);
 await page.evaluate(()=>{for(let i=0;i<12;i++)window.__ascensaoScene.update(0,50);});
 let v=await page.evaluate(()=>({x:window.__ascensaoScene.player.x,dir:window.__ascensaoScene.facing,key:window.__ascensaoScene.player.texture.key}));
 assert(v.x>boot.x+35&&v.dir==='right'&&v.key==='seiya_right_run','Direita não animou com sprite correto: '+JSON.stringify(v));
 await page.keyboard.up('d');
 await page.evaluate(()=>window.__ascensaoScene.update(0,35));
 let idle=await page.evaluate(()=>({
   facing:window.__ascensaoScene.facing,
   key:window.__ascensaoScene.player.texture.key,
   frame:window.__ascensaoScene.player.frame.name
 }));
 assert.equal(idle.facing,'right','Direção da última tecla não persistiu');
 assert.equal(idle.key,'seiya_right_idle_clean','Idle à direita usa textura errada: '+JSON.stringify(idle));
 assert.equal(String(idle.frame),'__BASE','Idle tem mais de um frame');
 await page.keyboard.down('a');await page.waitForTimeout(150);
 await page.evaluate(()=>{for(let i=0;i<12;i++)window.__ascensaoScene.update(0,50);});
 v=await page.evaluate(()=>({x:window.__ascensaoScene.player.x,dir:window.__ascensaoScene.facing,key:window.__ascensaoScene.player.texture.key}));
 assert(v.dir==='left'&&v.key==='seiya_left_run'&&v.x<boot.x+35,'Esquerda incorreta: '+JSON.stringify(v));
 await page.keyboard.up('a');
 await page.evaluate(()=>{for(let i=0;i<9;i++)window.__ascensaoScene.update(0,55);});
 idle=await page.evaluate(()=>({dir:window.__ascensaoScene.facing,key:window.__ascensaoScene.player.texture.key,frame:window.__ascensaoScene.frameCounter}));
 assert.equal(idle.key,'seiya_left_idle_clean','Idle deve manter esquerda: '+JSON.stringify(idle));
 assert.equal(idle.frame,0,'Idle está rodando frames e pode criar pé extra');
 await page.keyboard.down('w');await page.waitForTimeout(150);
 await page.evaluate(()=>{for(let i=0;i<12;i++)window.__ascensaoScene.update(0,50);});
 v=await page.evaluate(()=>({y:window.__ascensaoScene.player.y,dir:window.__ascensaoScene.facing,key:window.__ascensaoScene.player.texture.key}));
 assert(v.dir==='up'&&v.key==='seiya_up_run'&&v.y<boot.y-20,'Cima incorreto: '+JSON.stringify(v));
 await page.keyboard.up('w');
 await page.evaluate(()=>window.__ascensaoScene.update(0,35));
 assert.equal(await page.evaluate(()=>window.__ascensaoScene.player.texture.key),'seiya_up_idle_clean','Parado não mantém cima');
 await page.keyboard.down('s');await page.waitForTimeout(150);
 await page.evaluate(()=>{for(let i=0;i<12;i++)window.__ascensaoScene.update(0,50);});
 v=await page.evaluate(()=>({dir:window.__ascensaoScene.facing,key:window.__ascensaoScene.player.texture.key}));
 assert(v.dir==='down'&&v.key==='seiya_down_run','Baixo incorreto: '+JSON.stringify(v));
 await page.keyboard.up('s');
 await page.evaluate(()=>window.__ascensaoScene.update(0,35));
 assert.equal(await page.evaluate(()=>window.__ascensaoScene.player.texture.key),'seiya_down_idle_clean','Parado não mantém baixo');
 // Regressao visual: ataque e golpe com escudo NAO podem reutilizar
 // quadros frontais / de costas. O primeiro quadro dos dois ataques
 // deve ser o MESMO perfil da corrida; no terceiro ha um golpe lateral.
 const capSheet=await page.evaluate(()=>{
   const sc=window.__ascensaoScene;
   const read=(key)=>{
     const image=sc.textures.get(key).getSourceImage();
     const canvas=document.createElement('canvas');
     canvas.width=image.width;canvas.height=image.height;
     const ctx=canvas.getContext('2d',{willReadFrequently:true});
     ctx.drawImage(image,0,0);
     return {width:canvas.width,bytes:ctx.getImageData(0,0,canvas.width,canvas.height).data};
   };
   const run=read('captainEnemyRun');
   const basic=read('captainEnemyAttack');
   const shield=read('captainEnemyShieldAttack');
   const sameFrame=(a,ia,b,ib)=>{
     if(a.width<128*(ia+1)||b.width<128*(ib+1))return false;
     for(let y=0;y<128;y++)for(let x=0;x<128;x++)for(let c=0;c<4;c++){
       if(a.bytes[(y*a.width+ia*128+x)*4+c]!==b.bytes[(y*b.width+ib*128+x)*4+c])return false;
     }
     return true;
   };
   return {
     attackStartsSideways:sameFrame(run,0,basic,0),
     shieldStartsSideways:sameFrame(run,0,shield,0),
     strikeHasMovement:!sameFrame(run,0,basic,3),
     shieldHasMovement:!sameFrame(run,0,shield,3),
     eightFrames:basic.width===1024&&shield.width===1024,
   };
 });
 assert(Object.values(capSheet).every(Boolean),
   'Atlas de ataque ainda contem vistas frontais ou poses estaticas: '+JSON.stringify(capSheet));

 // Regression do print: se o Capitao estiver a esquerda do Seiya, o
 // ataque deve apontar para a DIREITA; invertendo os lados, para a ESQUERDA.
 const attackFacing=await page.evaluate(()=>{
   const sc=window.__ascensaoScene, e=sc.enemyList.find(enemy=>enemy.alive);
   const backup={x:e.x,y:e.y,lastAttack:e.lastAttack,attackKind:e.attackKind,
     attackUntil:e.attackUntil,faceLeft:e.faceLeft,attackCount:e.attackCount};
   const cases=[];
   for(const kind of ['punch','shield']){
     for(const side of ['enemyLeft','enemyRight']){
       e.x=sc.player.x+(side==='enemyLeft'?-65:65);e.y=sc.player.y;
       // Comeca com a direcao propositalmente errada para confirmar correcao.
       e.faceLeft=(side==='enemyLeft');
       e.attackKind=kind;e.lastAttack=sc.simMs-90;e.attackUntil=sc.simMs+280;
       sc.update(0,25);
       cases.push({kind,side,flip:e.sprite.flipX,shieldFlip:e.shield.flipX,
         faceLeft:e.faceLeft,visible:e.shield.visible,texture:e.sprite.texture.key});
     }
   }
   Object.assign(e,backup);
   e.sprite.setFlipX(e.faceLeft);
   return cases;
 });
 for(const value of attackFacing){
   const expectedLeft=value.side==='enemyRight';
   assert.equal(value.flip,expectedLeft,
     'Capitao atacando de costas: '+JSON.stringify(attackFacing));
   assert.equal(value.faceLeft,expectedLeft,
     'Face do Capitao nao acompanha Seiya durante ataque: '+JSON.stringify(attackFacing));
   assert.equal(value.shieldFlip,expectedLeft,
     'Escudo em direcao contraria ao alvo: '+JSON.stringify(attackFacing));
   assert(value.visible&&value.texture===(value.kind==='shield'?'captainEnemyShieldAttack':'captainEnemyAttack'),
     'Ataque ou escudo incorreto: '+JSON.stringify(attackFacing));
 }

 // Confirmar ataque de Capitão América, com e sem escudo, sem alterar HP do jogador.
 await page.evaluate(()=>{
   const sc=window.__ascensaoScene;
   const e=sc.enemyList.find(a=>a.alive);
   e.x=sc.player.x+125;e.y=sc.player.y;
   e.attackKind='punch';e.lastAttack=sc.simMs-90;e.attackUntil=sc.simMs+300;
   sc.update(0,25);
 });
 let cap=await page.evaluate(()=>{
   const e=window.__ascensaoScene.enemyList.find(a=>a.alive);
   return {key:e.sprite.texture.key,visible:e.shield.visible}
 });
 assert.equal(cap.key,'captainEnemyAttack','Soco do Capitão sem animação');
 assert.equal(cap.visible,true,'Escudo desapareceu no soco comum');
 await page.evaluate(()=>{
   const sc=window.__ascensaoScene,e=sc.enemyList.find(a=>a.alive);
   e.attackKind='shield';e.lastAttack=sc.simMs-100;e.attackUntil=sc.simMs+300;
   sc.update(0,25);
 });
 cap=await page.evaluate(()=>{
   const e=window.__ascensaoScene.enemyList.find(a=>a.alive);
   return {key:e.sprite.texture.key,visible:e.shield.visible}
 });
 assert.equal(cap.key,'captainEnemyShieldAttack','Ataque com escudo não usou spritesheet correto');
 assert.equal(cap.visible,true,'Escudo desapareceu no ataque especial');
 await page.evaluate(()=>{
   const sc=window.__ascensaoScene,e=sc.enemyList.find(a=>a.alive);
   e.attackKind=null;
 });
 await page.evaluate(()=>{const sc=window.__ascensaoScene;sc.cosmo=100;sc.tryMeteor();});
 await page.waitForTimeout(120);
 await page.evaluate(()=>{for(let i=0;i<15;i++)window.__ascensaoScene.update(0,55);});
 const meteor=await page.evaluate(()=>({phase:window.__ascensaoScene.phase,key:window.__ascensaoScene.player.texture.key,vfx:window.__ascensaoScene.vfxSprite.visible}));
 assert(meteor.phase==='4b'&&meteor.key==='seiya_down_4b'&&meteor.vfx,'Meteoro de Pégaso não disparou: '+JSON.stringify(meteor));
 // Derrota REAL: inimigo encosta, HP vai a zero e overlay React recebe o estado.
 await page.evaluate(()=>{
   const sc=window.__ascensaoScene;
   sc.level=3;sc.xp=55;sc.drachmas=88;sc.hp=6;
   sc.attack=null;sc.meteor=null;sc.autoEnabled=false;
   sc.lastHitMs=-999999;sc.simMs=15000;
   const e=sc.enemyList.find(enemy=>enemy.alive);
   e.x=sc.player.x+35;e.y=sc.player.y;
   e.lastAttack=-999999;
   sc.update(0,55);
 });
 await page.locator('#healBtn').waitFor({state:'visible',timeout:7000});
 let st=await page.evaluate(()=>({infirmary:window.__ascensaoScene.infirmary,level:window.__ascensaoScene.level,xp:window.__ascensaoScene.xp,drachmas:window.__ascensaoScene.drachmas}));
 assert(st.infirmary&&st.level===3&&st.xp===55&&st.drachmas===88,'Perda de progresso na derrota');
 const dialog=page.locator('[aria-label="Enfermaria do Santuário"]');
 assert(await page.locator('.infirmary-modal').isVisible(),'Enfermaria não apareceu');
 await page.locator('#healBtn').click();
 await page.locator('#returnBtn').waitFor({state:'visible'});
 await page.locator('#returnBtn').click();
 await page.locator('.infirmary-modal').waitFor({state:'detached'});
 st=await page.evaluate(()=>({infirmary:window.__ascensaoScene.infirmary,level:window.__ascensaoScene.level,xp:window.__ascensaoScene.xp,drachmas:window.__ascensaoScene.drachmas,active:window.__ascensaoScene.scene.isActive()}));
 assert(!st.infirmary&&st.level===3&&st.xp===55&&st.drachmas===88&&st.active,'Retorno da enfermaria travou');
 // Recarregar NA enfermaria não pode prender o usuário.
 await page.evaluate(()=>window.__ascensaoScene.enterInfirmary());
 await page.locator('#healBtn').waitFor({state:'visible'});
 await page.reload({waitUntil:'networkidle'});
 await page.waitForFunction(()=>!!window.__ascensaoScene);
 await page.locator('#healBtn').waitFor({state:'visible'});
 await page.locator('#healBtn').click();
 await page.locator('#returnBtn').click();
 await page.locator('.infirmary-modal').waitFor({state:'detached'});
 await page.reload({waitUntil:'networkidle'}); await page.waitForFunction(()=>!!window.__ascensaoScene);
 st=await page.evaluate(()=>({level:window.__ascensaoScene.level,xp:window.__ascensaoScene.xp,drachmas:window.__ascensaoScene.drachmas}));
 assert(st.level===3&&st.xp===55&&st.drachmas===88,'Salvamento não persistiu');
 fs.mkdirSync('test/output',{recursive:true});
 await page.screenshot({path:'test/output/phaser-v07.png',fullPage:true});
 assert.deepEqual(errors,[],'Erros JS: '+JSON.stringify(errors));
 assert.deepEqual(missing,[],'Requisições HTTP inválidas: '+JSON.stringify(missing));
 console.log('PASSOU: Seiya idle com pes completos em 4 direcoes, ataques laterais corretos, Capitao maior e escudo permanente, Meteoro, enfermaria e save.');
}finally{await browser.close();}
