import Phaser from 'phaser';
import { ARENA_WORLD, PLAYER_START, ENEMY_SPAWNS, isInsideArenaFloor, ARENA_FLOOR } from '../shared/arenaBounds';
import { readProgress, writeProgress, onDefeat, healAtInfirmary, leaveInfirmary, XP_FOR_NEXT_LEVEL, type PlayerProgress } from '../shared/progress';
import { FRAME_COUNTS, FRAME_SIZE, spriteKey, spritePath, type Stage } from '../shared/assetManifest';
import { MAX_HP, MAX_COSMO, METEOR_COST, applyDamage, attackDamage, clamp, directionFromVector, directionVector, distance, gainCosmo, isTargetInCone, nextComboIndex, normalize, spendCosmo, type Direction, type Vector2 } from '../shared/combat';

export type GameSnapshot = {
  hp: number; maxHp: number; cosmo: number; maxCosmo: number;
  enemyHp: number; enemyMaxHp: number; enemies: number;
  level: number; xp: number; xpNext: number; drachmas: number; kills: number;
  facing: Direction; phase: string; auto: boolean; vfx: boolean;
  debug: boolean; paused: boolean; dead: boolean; infirmary: boolean; healed: boolean; defeats: number; lastAction: string;
};

export type SceneSettings = { auto: boolean; vfx: boolean; debug: boolean };
type Enemy = { sprite: Phaser.GameObjects.Sprite; x: number; y: number; hp: number; maxHp: number; lastAttack: number; slowed: number; alive: boolean; radius: number; hitUntil: number; wanderOffset: number };
type Phase = 'idle' | 'run' | 'attack1' | 'attack2' | 'attack3' | '4a' | '4b' | '4c' | 'hurt' | 'dead';
type AttackData = { stage: 'attack1' | 'attack2' | 'attack3'; start: number; applied: boolean; duration: number; hitAt: number; dir: Direction };
type MeteorData = { start: number; dir: Direction; hitUntil: number; lastHit: number; totalTicks: number };
const WORLD_W = ARENA_WORLD.width, WORLD_H = ARENA_WORLD.height;
const PLAYER_SPEED = 245, ENEMY_SPEED = 115;
const PLAYER_RADIUS = 20, ENEMY_RADIUS = 22;
const ATTACK_DELAYS = [480, 510, 570];
const ENEMY_MAX = 4;
const SPOTS: Vector2[] = ENEMY_SPAWNS.map(p => ({x:p.x, y:p.y}));

export class TrainingScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Sprite;
  private vfxSprite!: Phaser.GameObjects.Sprite;
  private shade!: Phaser.GameObjects.Ellipse;
  private enemyList: Enemy[] = [];
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private facing: Direction = 'down';
  private phase: Phase = 'idle';
  private frameCounter = 0;
  private frameAccumulator = 0;
  private hp = MAX_HP;
  private cosmo = 55;
  private kills = 0;
  private drachmas = 0;
  private level = 1;
  private xp = 0;
  private infirmary = false;
  private healed = false;
  private defeats = 0;
  private lastAttackMs = -100000;
  private comboIndex = -1;
  private attack: AttackData | null = null;
  private meteor: MeteorData | null = null;
  private lastMeteorMs = -100000;
  private lastHitMs = -100000;
  private playerFlashUntil = 0;
  private lastHudMs = -100000;
  private lastAction = 'Entre na arena e enfrente os guardas.';
  private autoEnabled = false;
  private vfxEnabled = true;
  private debugEnabled = false;
  private isPaused = false;
  private virtualMovement = { x: 0, y: 0 };
  private hitGfx!: Phaser.GameObjects.Graphics;
  private spawnTimer = 0;
  /** Pause-safe clock for attacks, cooldowns, enemies and the HUD. */
  private simMs = 0;
  public report?: (snapshot: GameSnapshot) => void;
  public onAssetError?: (message: string) => void;
  /** Fired only after Phaser has booted and all scene objects exist. */
  public onSceneReady?: () => void;

  constructor() { super('TrainingScene'); }

  preload(): void {
    this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, (file: Phaser.Loader.File) => {
      const msg = `Não foi possível carregar o recurso: ${file.key}`;
      console.error(msg);
      this.onAssetError?.(msg);
    });
    const dirs: Direction[] = ['down', 'left', 'right', 'up'];
    const stages: Stage[] = ['idle', 'run', 'attack1', 'attack2', 'attack3', '4a', '4b', '4c', 'vfx'];
    for (const dir of dirs) for (const stage of stages) {
      this.load.spritesheet(spriteKey(dir, stage), spritePath(dir, stage), {
        frameWidth: FRAME_SIZE[stage], frameHeight: FRAME_SIZE[stage]
      });
    }
    this.load.image('sanctuaryArena4k', 'assets/scenes/arena_santuario_4k.webp');
    this.load.spritesheet('trainingEnemy', 'assets/enemy/training_enemy.png', { frameWidth: 96, frameHeight: 96 });
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#0a1725');
    this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H);
    this.drawWorld();
    this.shade = this.add.ellipse(0, 0, 64, 21, 0x000000, 0.32).setDepth(400);
    this.player = this.add.sprite(PLAYER_START.x, PLAYER_START.y, spriteKey('down', 'idle'), 0).setOrigin(.5, .875).setDepth(695);
    this.vfxSprite = this.add.sprite(PLAYER_START.x, PLAYER_START.y, spriteKey('down', 'vfx'), 0).setOrigin(.5, .5).setVisible(false).setAlpha(.91).setDepth(735);
    this.hitGfx = this.add.graphics().setDepth(10000);
    this.cameras.main.startFollow(this.player, true, .09, .09);
    this.cameras.main.setZoom(1.16);
    this.restoreProgress();
    const kb = this.input.keyboard!;
    this.keys = kb.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,J,K,Q,F,G,H,R,SPACE,SHIFT,ESC') as Record<string, Phaser.Input.Keyboard.Key>;
    kb.on('keydown-J', () => this.tryAttack());
    kb.on('keydown-K', () => this.tryMeteor());
    kb.on('keydown-Q', () => this.tryMeteor());
    kb.on('keydown-SPACE', (e: KeyboardEvent) => { e.preventDefault(); this.tryAttack(); });
    kb.on('keydown-F', () => this.toggleAuto());
    kb.on('keydown-G', () => this.toggleVfx());
    kb.on('keydown-H', () => this.toggleDebug());
    kb.on('keydown-R', () => this.restartBattle());
    kb.on('keydown-ESC', () => this.togglePause());
    // Recuperação independente do loop de update; ENTER também funciona sem mouse.
    kb.on('keydown-ENTER', (event: KeyboardEvent) => {
      if (!this.infirmary) return;
      event.preventDefault();
      if (this.healed) this.returnToTraining();
      else this.healAtSanctuary();
    });
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.leftButtonDown()) this.tryAttack();
    });
    this.spawnInitialEnemies();
    this.publish(true);
    this.onSceneReady?.();
  }

  private drawWorld(): void {
    // Show the exact 4K Sanctuary asset, scaled to the 1920x1080 world plane.
    // Other pixel-art atlases retain their crisp nearest-neighbor rendering.
    this.textures.get('sanctuaryArena4k').setFilter(Phaser.Textures.FilterMode.LINEAR);
    this.add.image(0, 0, 'sanctuaryArena4k')
      .setOrigin(0, 0).setDisplaySize(WORLD_W, WORLD_H).setDepth(-1000);
  }

  private spawnInitialEnemies(): void {
    for(let i=0;i<3;i++) this.spawnEnemy(i);
  }
  private spawnEnemy(seed: number): void {
    const spot = SPOTS[seed % SPOTS.length];
    const x=spot.x, y=spot.y;
    const sprite = this.add.sprite(x,y,'trainingEnemy',seed%10).setOrigin(.5,.92).setDepth(y);
    sprite.setFlipX(x<this.player.x); // sprite source naturally faces right
    this.enemyList.push({sprite,x,y,hp:90,maxHp:90,lastAttack:-9999,slowed:0,alive:true,radius:ENEMY_RADIUS,hitUntil:0,wanderOffset:seed*123});
  }

  private blocked(x:number,y:number,r:number):boolean {
    return !isInsideArenaFloor(x, y, r);
  }
  private movePlayer(dx:number,dy:number,delta:number):void {
    const step=PLAYER_SPEED*delta/1000;
    const xx=this.player.x+dx*step, yy=this.player.y+dy*step;
    if(!this.blocked(xx,this.player.y,PLAYER_RADIUS)) this.player.x=xx;
    if(!this.blocked(this.player.x,yy,PLAYER_RADIUS)) this.player.y=yy;
  }

  update(time:number, delta:number):void {
    if (this.isPaused || this.infirmary) return;
    delta=Math.min(delta,55);
    this.simMs += delta;
    time = this.simMs;
    if (this.playerFlashUntil && time >= this.playerFlashUntil) {
      this.player.clearTint();
      this.playerFlashUntil = 0;
    }
    if (this.hp<=0) { this.setPhase('dead'); this.publish(time-this.lastHudMs>130); return; }
    const pressing=(this.keys.D.isDown||this.keys.RIGHT.isDown?1:0)-(this.keys.A.isDown||this.keys.LEFT.isDown?1:0);
    const vertical=(this.keys.S.isDown||this.keys.DOWN.isDown?1:0)-(this.keys.W.isDown||this.keys.UP.isDown?1:0);
    const manualX = pressing + this.virtualMovement.x, manualY = vertical + this.virtualMovement.y;
    const overriding = Math.abs(manualX)>0.05||Math.abs(manualY)>0.05;
    const manualMove = normalize(manualX,manualY);
    let motion = {x:0,y:0};
    let desired:Direction|null=null;
    if (this.attack) {
      const elapsed=time-this.attack.start;
      if(!this.attack.applied && elapsed>=this.attack.hitAt){
        this.applyMeleeHit(this.attack.stage);this.attack.applied=true;
      }
      if(elapsed>=this.attack.duration){this.attack=null;this.setPhase('idle')}
    } else if (this.meteor) {
      const t=time-this.meteor.start, a=6*78, b=2*8*53, c=8*69;
      if(t<a){this.setPhase('4a');this.frameCounter=Math.min(5,Math.floor(t/78));}
      else if(t<a+b){
        this.setPhase('4b');this.frameCounter=Math.floor((t-a)/53)%8;
        if(t-this.meteor.lastHit>=108){this.meteor.lastHit=t;this.applyMeteorHit();}
      }
      else if(t<a+b+c){this.setPhase('4c');this.frameCounter=Math.min(7,Math.floor((t-a-b)/69));}
      else {this.meteor=null;this.vfxSprite.setVisible(false);this.setPhase('idle');this.publish(true);}
      if(this.meteor && t>=a && t<a+b && this.vfxEnabled) {
        const vec=directionVector(this.meteor.dir);
        this.vfxSprite.setPosition(this.player.x+vec.x*150,this.player.y+(this.meteor.dir==='down'?64:this.meteor.dir==='up'?-161:-47));
        this.vfxSprite.setTexture(spriteKey(this.meteor.dir,'vfx'),this.frameCounter).setVisible(true);
        this.vfxSprite.setDepth(this.meteor.dir==='up'?this.player.y-90:this.player.y+75);
      } else this.vfxSprite.setVisible(false);
    } else {
      if(overriding){motion=manualMove;desired=directionFromVector(motion.x,motion.y,this.facing)}
      else if(this.autoEnabled){
        const enemy=this.nearestEnemy();
        if(enemy){
          const d=distance({x:this.player.x,y:this.player.y},enemy);
          const v=normalize(enemy.x-this.player.x,enemy.y-this.player.y);
          desired=directionFromVector(v.x,v.y,this.facing);
          this.facing=desired; // Skills activated in this branch need the freshly selected direction.
          if(d>99){motion=v}
          else if(this.cosmo>=METEOR_COST && this.lastMeteorMs+5200<time) this.tryMeteor();
          else if(time>this.lastAttackMs+ATTACK_DELAYS[clamp(this.comboIndex,0,2)]+100) this.tryAttack();
        }
      }
      if(desired) this.facing=desired;
      if(motion.x||motion.y){this.movePlayer(motion.x,motion.y,delta);this.setPhase('run')}
      else if(!this.meteor&&!this.attack)this.setPhase('idle');
    }
    if(this.attack){this.advanceFrames(delta,ATTACK_DELAYS[[ 'attack1','attack2','attack3'].indexOf(this.attack.stage)]/8)}
    else if(!this.meteor)this.advanceFrames(delta,this.phase==='run'?86:165);
    if(!this.meteor&&this.phase!=='dead') this.vfxSprite.setVisible(false);
    this.player.setTexture(spriteKey(this.facing, this.phase==='hurt'||this.phase==='dead'?'idle':this.phase), this.frameCounter%FRAME_COUNTS[this.phase==='hurt'||this.phase==='dead'?'idle':this.phase]);
    this.player.setDepth(this.player.y+7);
    this.shade.setPosition(this.player.x,this.player.y-4).setDepth(this.player.y-11);
    this.updateEnemies(time,delta);
    this.drawDebug();
    this.publish(time-this.lastHudMs>=100);
  }

  private advanceFrames(delta:number,interval:number):void{
    this.frameAccumulator+=delta;
    while(this.frameAccumulator>=interval){this.frameCounter=(this.frameCounter+1)%FRAME_COUNTS[this.phase==='hurt'||this.phase==='dead'?'idle':this.phase];this.frameAccumulator-=interval;}
  }
  private setPhase(phase:Phase):void {
    if(this.phase!==phase){this.phase=phase;this.frameCounter=0;this.frameAccumulator=0;}
  }
  public tryAttack():void {
    if(!this.scene.isActive()||this.isPaused||this.infirmary||this.attack||this.meteor||this.hp<=0)return;
    const now=this.simMs;
    if(now-this.lastAttackMs<255)return;
    this.comboIndex=nextComboIndex(this.comboIndex,this.lastAttackMs,now);
    const index=this.comboIndex;
    this.lastAttackMs=now;
    const stage = `attack${index+1}` as AttackData['stage'];
    this.attack={stage,start:now,hitAt:[210,225,245][index],duration:ATTACK_DELAYS[index],dir:this.facing,applied:false};
    this.setPhase(stage);
    this.lastAction=['Soco rápido','Soco alternado','Chute finalizador'][index];
    this.publish(true);
  }
  private applyMeleeHit(stage:AttackData['stage']):void {
    const i = ['attack1','attack2','attack3'].indexOf(stage);
    let hits=0;
    for(const e of this.enemyList){
      if(e.alive&&isTargetInCone({x:this.player.x,y:this.player.y},this.facing,e,i===2?110:96,i===2?58:50)){
        this.damageEnemy(e,attackDamage(i));hits++;
      }
    }
    if(hits>0){this.cosmo=gainCosmo(this.cosmo,[9,12,15][i]);this.storeProgress();this.lastAction=`${["Soco","Contra-ataque","Chute"][i]} acertou ${hits} alvo(s)!`;}
    this.publish(true);
  }
  public tryMeteor():void {
    if(!this.scene.isActive()||this.isPaused||this.infirmary||this.attack||this.meteor||this.hp<=0)return;
    const now=this.simMs;
    if(now-this.lastMeteorMs<1800)return;
    const remain=spendCosmo(this.cosmo,METEOR_COST);
    if(remain===null){this.lastAction='Cosmo insuficiente para Meteoro (45).';this.publish(true);return;}
    this.cosmo=remain;
    this.storeProgress();
    this.lastMeteorMs=now;
    this.meteor={start:now,dir:this.facing,hitUntil:now+2500,lastHit:-9999,totalTicks:0};
    this.lastAction='METEORO DE PÉGASO!';
    this.setPhase('4a');
    this.publish(true);
  }
  private applyMeteorHit():void {
    if(!this.meteor)return;
    let hits=0;
    for(const e of this.enemyList){
      if(e.alive&&isTargetInCone({x:this.player.x,y:this.player.y},this.meteor.dir,e,340,87)){
        this.damageEnemy(e,9);hits++;
      }
    }
    if(hits>0){this.meteor.totalTicks++;this.lastAction=`Meteoro: ${this.meteor.totalTicks}ª onda de impactos`;}
  }
  private damageEnemy(e:Enemy,points:number):void {
    if(!e.alive)return;
    e.hp=applyDamage(e.hp,points,e.maxHp);
    this.popNumber(e.x,e.y-75,`-${points}`,0xffe0a0);
    e.sprite.setTint(0xfff0bb);
    e.hitUntil=this.simMs+110;
    if(e.hp<=0){
      e.alive=false;this.kills++;this.drachmas+=12;this.xp+=35;this.cosmo=gainCosmo(this.cosmo,10);
      e.sprite.setTint(0xe69a63);
      this.tweens.add({targets:e.sprite,alpha:0,scale:0.65,duration:320,onComplete:()=>e.sprite.destroy()});
      while(this.xp>=XP_FOR_NEXT_LEVEL(this.level)){this.xp-=XP_FOR_NEXT_LEVEL(this.level);this.level++;this.hp=clamp(this.hp+35,0,MAX_HP);this.lastAction=`Nível ${this.level}! +35 HP`;}
      this.spawnTimer=this.simMs+1800;
      this.storeProgress();
    }
  }
  private popNumber(x:number,y:number,label:string,color:number):void {
    const txt=this.add.text(x,y,label,{fontFamily:'Arial,sans-serif',fontSize:'20px',fontStyle:'bold',color:`#${color.toString(16).padStart(6,'0')}`,stroke:'#152235',strokeThickness:4}).setOrigin(.5).setDepth(9000);
    this.tweens.add({targets:txt,y:y-32,alpha:0,duration:620,onComplete:()=>txt.destroy()});
  }
  private updateEnemies(time:number,delta:number):void {
    const living=this.enemyList.filter(e=>e.alive);
    if(living.length<ENEMY_MAX && time>this.spawnTimer){
      this.spawnEnemy((this.kills+this.enemyList.length)%SPOTS.length);
      this.spawnTimer=time+3800;
    }
    for (const e of living){
      if(e.hitUntil&&time>e.hitUntil){e.hitUntil=0;e.sprite.clearTint();}
      const diff={x:this.player.x-e.x,y:this.player.y-e.y};
      const d=Math.hypot(diff.x,diff.y);
      let velocity=0;
      if(d>75 && d<545){
        velocity=ENEMY_SPEED*delta/1000;
        const v=normalize(diff.x,diff.y);
        const xx=e.x+v.x*velocity, yy=e.y+v.y*velocity;
        if(!this.blocked(xx,e.y,e.radius))e.x=xx;
        if(!this.blocked(e.x,yy,e.radius))e.y=yy;
        e.sprite.setFlipX(v.x<0);
        e.sprite.setFrame(Math.floor(time/95+e.wanderOffset)%10);
      } else e.sprite.setFrame(1);
      if(d<=84&&time-e.lastAttack>1650 && !this.meteor){
        e.lastAttack=time;
        if(time-this.lastHitMs>530){
          this.hp=applyDamage(this.hp,8,MAX_HP);this.lastHitMs=time;
          this.lastAction=this.hp===0?'Seiya caiu. A enfermaria do Santuário o receberá.':'Seiya recebeu 8 de dano.';
          this.player.setTint(0xff8080);
          this.playerFlashUntil = time + 115;
          this.popNumber(this.player.x,this.player.y-85,'-8',0xff8585);
          if(this.hp===0) this.enterInfirmary();
          else this.storeProgress();
        }
      }
      e.sprite.setPosition(e.x,e.y).setDepth(e.y+8);
    }
    if(this.enemyList.length>18)this.enemyList=this.enemyList.filter(e=>e.alive);
  }
  private nearestEnemy():Enemy|null {
    let best: Enemy|null=null, bestDist=Infinity;
    for(const e of this.enemyList){
      if(!e.alive)continue;
      const d=distance({x:this.player.x,y:this.player.y},e);
      if(d<bestDist){best=e;bestDist=d;}
    }
    return best;
  }
  private drawDebug():void {
    this.hitGfx.clear();
    for (const e of this.enemyList) {
      if (!e.alive) continue;
      const x = e.x - 28, y = e.y - 104;
      this.hitGfx.fillStyle(0x101929, .85).fillRoundedRect(x - 2, y - 2, 60, 10, 3);
      this.hitGfx.fillStyle(0xd55455, .95).fillRoundedRect(x, y, 56 * (e.hp / e.maxHp), 6, 2);
    }
    if(!this.debugEnabled)return;
    this.hitGfx.lineStyle(2,0x45c5e2,.85).strokeCircle(this.player.x,this.player.y-6,PLAYER_RADIUS);
    this.hitGfx.lineStyle(2,0xffd37c,.7).strokeEllipse(ARENA_FLOOR.cx,ARENA_FLOOR.cy,2*(ARENA_FLOOR.rx-PLAYER_RADIUS),2*(ARENA_FLOOR.ry-PLAYER_RADIUS));
    for(const e of this.enemyList){if(e.alive){this.hitGfx.lineStyle(1,0xf07070,.9).strokeCircle(e.x,e.y-5,e.radius)}}
    const dir=directionVector(this.facing);
    this.hitGfx.lineStyle(3,0xf4d28e,.7).lineBetween(this.player.x,this.player.y,this.player.x+dir.x*(this.meteor?340:105),this.player.y+dir.y*(this.meteor?340:105));
  }
  public setVirtualMovement(x:number,y:number):void{this.virtualMovement={x,y};}
  /** React subscribes when the Phaser CREATE event fires; send initial state afterward. */
  public publishState():void{this.publish(true);}
  public toggleAuto():void{if(this.infirmary)return;this.autoEnabled=!this.autoEnabled;this.lastAction=this.autoEnabled?'Combate automático ativado.':'Controle manual ativado.';this.publish(true);}
  public toggleVfx():void{this.vfxEnabled=!this.vfxEnabled;if(!this.vfxEnabled)this.vfxSprite.setVisible(false);this.publish(true);}
  public toggleDebug():void{this.debugEnabled=!this.debugEnabled;this.publish(true);}
  public togglePause():void{if(this.infirmary)return;this.isPaused=!this.isPaused;this.lastAction=this.isPaused?'Jogo pausado.':'Jogo retomado.';this.publish(true);}
  private currentProgress(): PlayerProgress {
    return { version: 4, level: this.level, xp: this.xp, kills: this.kills,
      drachmas: this.drachmas, hp: this.hp, cosmo: this.cosmo,
      infirmary: this.infirmary, healed: this.healed, defeats: this.defeats };
  }
  private applyProgress(p: PlayerProgress): void {
    this.level=p.level; this.xp=p.xp; this.kills=p.kills; this.drachmas=p.drachmas;
    this.hp=p.hp; this.cosmo=p.cosmo; this.infirmary=p.infirmary;
    this.healed=p.healed; this.defeats=p.defeats;
  }
  private restoreProgress(): void {
    const stored=readProgress();
    this.applyProgress(stored);
    if(this.infirmary){
      this.lastAction=this.healed?'Recuperado. Retorne à arena.':'Enfermaria do Santuário: recupere-se antes de lutar.';
      this.setPhase('dead');
    } else if(this.level>1 || this.kills>0) {
      this.lastAction=`Bem-vindo de volta, Seiya. Nível ${this.level} preservado.`;
    }
  }
  private storeProgress(): void { writeProgress(this.currentProgress()); }
  private enterInfirmary(): void {
    if(this.infirmary) return;
    this.applyProgress(onDefeat(this.currentProgress()));
    this.attack=null; this.meteor=null; this.vfxSprite.setVisible(false);
    this.autoEnabled=false; this.isPaused=false; this.virtualMovement={x:0,y:0}; this.setPhase('dead');
    this.lastAction='Seiya foi levado à enfermaria. Sua evolução está protegida.';
    this.storeProgress(); this.publish(true);
  }
  public healAtSanctuary(): void {
    if(!this.infirmary || this.healed) return;
    this.applyProgress(healAtInfirmary(this.currentProgress()));
    this.lastAction='Os curandeiros do Santuário restauraram suas forças.';
    this.storeProgress(); this.publish(true);
  }
  public returnToTraining(): void {
    if(!this.infirmary || !this.healed) return;
    this.applyProgress(leaveInfirmary(this.currentProgress()));
    this.restartBattle();
    this.lastAction='Seiya retornou ao Campo de Provas. Sua evolução foi preservada.';
    this.storeProgress(); this.publish(true);
  }
  public restartBattle():void {
    // R or the restart button never bypass the infirmary healing step.
    if(this.infirmary) return;
    // Stop tweens/events from the previous encounter and rebuild safely.
    this.tweens.killAll(); this.time.removeAllEvents(); this.enemyList.forEach(e=>e.sprite.destroy());this.enemyList=[];
    this.hitGfx.clear();this.shade.setPosition(PLAYER_START.x,PLAYER_START.y);
    this.player.setPosition(PLAYER_START.x,PLAYER_START.y).clearTint().setAlpha(1);this.vfxSprite.setVisible(false);
    // Reset only temporary encounter state; preserve level, XP, currency and health.
    this.phase='idle';this.frameCounter=0;this.attack=null;this.meteor=null;this.facing='down';
    this.lastAttackMs=-99999;this.lastMeteorMs=-99999;this.lastHitMs=-99999;this.playerFlashUntil=0;this.comboIndex=-1;this.isPaused=false;
    this.simMs=0;this.lastHudMs=-99999;this.virtualMovement={x:0,y:0};
    this.lastAction='Arena reorganizada. Nível e XP preservados.';this.spawnTimer=0;this.spawnInitialEnemies();this.storeProgress();this.publish(true);
  }
  private publish(force:boolean):void {
    if(!force||!this.report)return;
    this.lastHudMs=this.simMs;
    const target=this.nearestEnemy();
    this.report({hp:this.hp,maxHp:MAX_HP,cosmo:this.cosmo,maxCosmo:MAX_COSMO,
      enemyHp:target?.hp??0,enemyMaxHp:target?.maxHp??90,enemies:this.enemyList.filter(e=>e.alive).length,
      level:this.level,xp:this.xp,xpNext:XP_FOR_NEXT_LEVEL(this.level),drachmas:this.drachmas,kills:this.kills,
      facing:this.facing,phase:this.phase,auto:this.autoEnabled,vfx:this.vfxEnabled,debug:this.debugEnabled,
      paused:this.isPaused,dead:this.infirmary,infirmary:this.infirmary,healed:this.healed,defeats:this.defeats,lastAction:this.lastAction});
  }
}