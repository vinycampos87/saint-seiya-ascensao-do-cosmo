const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {setTimeout:delay}=require('node:timers/promises');
(async()=>{
  const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const page=await browser.newPage({viewport:{width:1500,height:950},deviceScaleFactor:1});
  const errors=[],failures=[];
  page.on('pageerror',e=>errors.push('JS: '+e.message));
  page.on('response',res=>{if(res.status()>=400)failures.push(res.status()+' '+res.url())});
  await page.goto('http://127.0.0.1:8080/',{waitUntil:'load',timeout:60000});
  await page.waitForFunction(()=>!!window.__saintSeiyaDiagnostics,{timeout:10000});
  await page.waitForTimeout(1200);
  const assets=await page.evaluate(()=>Object.entries(IMAGES).map(([k,im])=>({k,ready:im.complete&&im.naturalWidth>0})));
  const missing=assets.filter(a=>!a.ready);
  assert.equal(missing.length,0,'Arquivos gráficos ausentes: '+JSON.stringify(missing));
  assert(assets.length>=40,'Menos de 40 assets carregados');
  let report=await page.evaluate(()=>window.__saintSeiyaDiagnostics.integrity());
  assert(report.walkDirectionsMapped,'Mapeamento das 4 direções incorreto');
  assert(report.fourDirectionsPerAction,'Estados sem quatro direções');
  assert(report.characterWithinArena,'Seiya nasceu fora da arena');
  await page.locator('#world').focus();
  const start=await page.evaluate(()=>window.__saintSeiyaDiagnostics.state);
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(360);
  const mid=await page.evaluate(()=>window.__saintSeiyaDiagnostics.state);
  assert.equal(mid.direction,'right','Seta direita não mudou direção');
  assert(mid.x>start.x+60,'Seiya não andou para direita');
  assert(mid.moving,'Animação de caminhada não foi ativada');
  await page.keyboard.up('ArrowRight');
  await page.waitForTimeout(110);
  assert.equal((await page.evaluate(()=>window.__saintSeiyaDiagnostics.state)).moving,false,
      'Animação de caminhada continuou após soltar tecla');
  await page.keyboard.down('ArrowLeft');await page.waitForTimeout(300);
  const other=await page.evaluate(()=>window.__saintSeiyaDiagnostics.state);
  assert.equal(other.direction,'left','Seta esquerda não mudou direção');
  assert(other.x<mid.x-50,'Seiya não andou para esquerda');
  await page.keyboard.up('ArrowLeft');
  await page.keyboard.down('ArrowUp');await page.waitForTimeout(240);
  const up=await page.evaluate(()=>window.__saintSeiyaDiagnostics.state);
  assert.equal(up.direction,'up');assert(up.y<other.y-40,'Movimento para cima falhou');
  await page.keyboard.up('ArrowUp');
  await page.keyboard.down('ArrowDown');await page.waitForTimeout(200);
  const down=await page.evaluate(()=>window.__saintSeiyaDiagnostics.state);
  assert.equal(down.direction,'down');assert(down.y>up.y+35);
  await page.keyboard.up('ArrowDown');
  // Atacar não pode virar Seiya sozinho.
  await page.keyboard.press('KeyJ');await page.waitForTimeout(50);
  assert.equal((await page.evaluate(()=>window.__saintSeiyaDiagnostics.state)).direction,'down');
  // Os frames carregados devem conter personagem visível.
  await page.waitForTimeout(400);
  // Teste de arte REAL: atlas, orientação e posição inferior do pé.
  const grounding=await page.evaluate(()=>{
    const map=window.__saintSeiyaDiagnostics.mapping.walk;
    return Object.entries(map).map(([dir,id])=>{
      const im=IMAGES['atlas_'+String(id).padStart(2,'0')];
      const cn=document.createElement('canvas');
      cn.width=im.naturalWidth;cn.height=im.naturalHeight;
      const c=cn.getContext('2d',{willReadFrequently:true});c.drawImage(im,0,0);
      const pixels=c.getImageData(0,0,cn.width,cn.height).data;
      const bottoms=[];
      for(let frame=0;frame<Math.floor(cn.width/128);frame++){
        let bottom=-1;
        for(let y=0;y<128;y++)for(let x=0;x<128;x++){
          const alpha=pixels[((y*cn.width)+(frame*128)+x)*4+3];
          if(alpha>90&&y>bottom)bottom=y;
        }
        bottoms.push(bottom);
      }
      return {dir,id,bottoms};
    });
  });
  assert.deepEqual(Object.fromEntries(grounding.map(x=>[x.dir,x.id])),{down:6,left:7,up:8,right:9},
      'Sprites de caminhada associados a direções erradas');
  for(const item of grounding)assert(item.bottoms.every(y=>y===111),
      'Pés não alinhados ao pivô do atlas: '+JSON.stringify(item));
  assert.deepEqual(report.fixedPivot,[64,112],'Pivô do desenho precisa ser fixo');
  assert(report.fixedScale>1&&report.fixedScale<3,'Escala inválida');
  const ui=await page.evaluate(()=>[...document.styleSheets].some(s=>s.href&&s.href.includes('epic-ui.css')));
  assert(ui,'CSS da interface épica não carregou');
  await page.evaluate(()=>{
    S.level=3;S.xp=55;S.coins=88;enterInfirmary();
  });
  let after=await page.evaluate(()=>window.__saintSeiyaDiagnostics.state);
  assert.equal(after.inInfirmary,true);
  assert.equal(after.level,3);assert.equal(after.xp,55);assert.equal(after.coins,88);
  await page.click('#healBtn');await page.click('#returnBtn');
  after=await page.evaluate(()=>window.__saintSeiyaDiagnostics.state);
  assert.equal(after.inInfirmary,false);
  assert.equal(after.level,3);assert.equal(after.xp,55);assert.equal(after.coins,88);
  await page.reload({waitUntil:'load'});
  await page.waitForFunction(()=>!!window.__saintSeiyaDiagnostics);
  after=await page.evaluate(()=>window.__saintSeiyaDiagnostics.state);
  assert.equal(after.level,3);assert.equal(after.xp,55);assert.equal(after.coins,88);
  await page.waitForTimeout(350);
  fs.mkdirSync('tests/output',{recursive:true});
  await page.screenshot({path:'tests/output/arena.png',fullPage:true});
  await page.screenshot({path:'tests/output/arena.jpg',type:'jpeg',quality:65,fullPage:true});
  await browser.close();
  assert.deepEqual(errors,[],'Erros JS');
  assert.deepEqual(failures,[],'Recursos HTTP inválidos');
  console.log('✓ 41 recursos, pivô real, atlas por direção, caminhada, UI, enfermaria e save OK');
})().catch(e=>{console.error(e);process.exit(1)});
