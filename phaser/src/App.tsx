import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { createGame } from './game/createGame';
import type { GameSnapshot, TrainingScene } from './game/TrainingScene';
import './styles.css';

const START: GameSnapshot = {
  hp: 150, maxHp: 150, cosmo: 55, maxCosmo: 100,
  enemyHp: 90, enemyMaxHp: 90, enemies: 3,
  level: 1, xp: 0, xpNext: 125, drachmas: 0, kills: 0,
  facing: 'down', phase: 'idle', auto: false, vfx: true, debug: false,
  paused: false, dead: false, infirmary: false, healed: false, defeats: 0,
  lastAction: 'Preparando o Campo de Provas...'
};
type Movement = 'up' | 'down' | 'left' | 'right';
const MOVE: Record<Movement, {x: number; y: number}> = {
  up: {x: 0, y: -1}, down: {x: 0, y: 1},
  left: {x: -1, y: 0}, right: {x: 1, y: 0}
};

function Bar({value,max,kind}: {value:number;max:number;kind:'hp'|'cosmo'|'xp'}) {
  const pct = Math.max(0, Math.min(100, 100 * value / (max || 1)));
  return <div className={'game-bar game-bar-' + kind} role="progressbar" aria-valuemin={0} aria-valuemax={max} aria-valuenow={value}>
    <span style={{width: String(pct) + '%'}} />
  </div>;
}
export default function App() {
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<TrainingScene | null>(null);
  const pointer = useRef<number | null>(null);
  const [snapshot,setSnapshot] = useState<GameSnapshot>(START);
  const [ready,setReady] = useState(false);
  const [error,setError] = useState('');
  const [menuOpen,setMenuOpen] = useState(false);
  const [helpOpen,setHelpOpen] = useState(false);

  useEffect(()=>{
    if(!host.current) return;
    let mounted=true;
    let game: ReturnType<typeof createGame> | undefined;
    try{
      game=createGame(host.current, sc=>{
        if(!mounted)return;
        scene.current=sc;
        Object.assign(window,{__ascensaoScene:sc});
        sc.report=next=>{if(mounted)setSnapshot(next);};
        sc.publishState();
        setReady(true);
      },message=>{if(mounted)setError(message);});
      game.events.on('destroy',()=>{if(mounted)setReady(false);});
    }catch(e){setError(String(e));}
    return ()=>{mounted=false;scene.current=null;game?.destroy(true);};
  },[]);
  const act=(fn:(sc:TrainingScene)=>void)=>{if(scene.current)fn(scene.current);};
  const moveStart=(e:PointerEvent<HTMLButtonElement>,dir:Movement)=>{
    e.preventDefault();pointer.current=e.pointerId;
    e.currentTarget.setPointerCapture(e.pointerId);
    act(sc=>sc.setVirtualMovement(MOVE[dir].x,MOVE[dir].y));
  };
  const moveEnd=(e:PointerEvent<HTMLButtonElement>)=>{
    if(pointer.current===e.pointerId){
      pointer.current=null;act(sc=>sc.setVirtualMovement(0,0));
    }
  };
  const canFight=ready&&!snapshot.infirmary&&!snapshot.paused;
  const needsHealing=snapshot.infirmary&&!snapshot.healed;

  return <div className="full-game">
    <main className="battle-viewport" aria-label="Campo de Provas do Santuário">
      <div className="phaser-host" ref={host} />
      {!ready && <div className="boot-overlay" role="status">
        <span className="sun-mark">✦</span>
        <strong>{error || 'Preparando o Santuário de Athena...'}</strong>
        <small>Saint Seiya · Phaser 3 + React</small>
      </div>}
      <div className="arena-vignette" aria-hidden="true" />
    </main>

    <header className="floating-topbar">
      <div className="game-identity"><span className="identity-symbol">✦</span><div>
        <b>SAINT SEIYA</b><small>ASCENSÃO DO COSMO <em>· SANTUÁRIO</em></small>
      </div></div>
      <div className="compact-location"><span>✧</span> Campo de Provas</div>
      <button id="menuToggle" className={'top-menu-toggle' + (menuOpen?' is-open':'')}
        aria-expanded={menuOpen} aria-controls="gameMenu"
        onClick={()=>setMenuOpen(!menuOpen)}>
        <span>{menuOpen?'✕':'☰'}</span> {menuOpen?'FECHAR':'MENU'}
      </button>
    </header>

    <section className="player-hud" aria-label="Informações de Seiya">
      <div className="hud-heading"><span className="tiny-sigil">♞</span><strong>SEIYA <small>DE PÉGASO</small></strong><b>NV. {snapshot.level}</b></div>
      <div className="hud-stat"><div><span>VIDA</span><b>{snapshot.hp}/{snapshot.maxHp}</b></div><Bar value={snapshot.hp} max={snapshot.maxHp} kind="hp"/></div>
      <div className="hud-stat"><div><span>COSMO</span><b>{snapshot.cosmo}/{snapshot.maxCosmo}</b></div><Bar value={snapshot.cosmo} max={snapshot.maxCosmo} kind="cosmo"/></div>
      <div className="hud-xp"><Bar value={snapshot.xp} max={snapshot.xpNext} kind="xp"/><small>EXP {snapshot.xp}/{snapshot.xpNext}</small></div>
    </section>

    <div className="floating-resources">
      <span>⚔ {snapshot.enemies} inimigos</span><span>◈ {snapshot.drachmas} Dracmas</span>
    </div>

    <div className="battle-shortcuts" aria-label="Golpes">
      <button id="attackBtn" onClick={()=>act(sc=>sc.tryAttack())} disabled={!canFight} aria-label="Ataque básico, tecla J">
        <span>⚔</span><b>ATAQUE</b><small>J</small>
      </button>
      <button id="meteorBtn" className="meteor-shortcut" onClick={()=>act(sc=>sc.tryMeteor())}
        disabled={!canFight||snapshot.cosmo<45} aria-label="Meteoro de Pégaso, tecla K">
        <span>✦</span><b>METEORO</b><small>K · 45 Cosmo</small>
      </button>
    </div>

    <div className="action-status" role="status">{snapshot.lastAction}</div>

    <nav className="touch-dpad" aria-label="Movimentação por toque">
      <button className="dir-up" aria-label="Mover para cima" onPointerDown={e=>moveStart(e,'up')} onPointerUp={moveEnd} onPointerCancel={moveEnd}>▲</button>
      <button className="dir-left" aria-label="Mover para esquerda" onPointerDown={e=>moveStart(e,'left')} onPointerUp={moveEnd} onPointerCancel={moveEnd}>◀</button>
      <button className="dir-down" aria-label="Mover para baixo" onPointerDown={e=>moveStart(e,'down')} onPointerUp={moveEnd} onPointerCancel={moveEnd}>▼</button>
      <button className="dir-right" aria-label="Mover para direita" onPointerDown={e=>moveStart(e,'right')} onPointerUp={moveEnd} onPointerCancel={moveEnd}>▶</button>
    </nav>

    {menuOpen && <aside className="dropdown-menu" id="gameMenu" aria-label="Menu do jogo">
      <div className="dropdown-header"><strong>COMANDOS DO SANTUÁRIO</strong><button onClick={()=>setMenuOpen(false)} aria-label="Fechar menu">✕</button></div>
      <div className="menu-data"><span>Nível <b>{snapshot.level}</b></span><span>XP <b>{snapshot.xp}/{snapshot.xpNext}</b></span><span>Derrotados <b>{snapshot.kills}</b></span><span>Dracmas <b>{snapshot.drachmas}</b></span></div>
      <div className="menu-actions">
        <button onClick={()=>act(sc=>sc.toggleAuto())} disabled={!ready||snapshot.infirmary}>Auto <b>{snapshot.auto?'LIGADO':'DESLIGADO'}</b> <small>F</small></button>
        <button onClick={()=>act(sc=>sc.toggleVfx())} disabled={!ready}>Efeitos <b>{snapshot.vfx?'LIGADOS':'DESLIGADOS'}</b> <small>G</small></button>
        <button onClick={()=>act(sc=>sc.togglePause())} disabled={!ready||snapshot.infirmary}>Jogo <b>{snapshot.paused?'CONTINUAR':'PAUSAR'}</b><small>ESC</small></button>
        <button onClick={()=>act(sc=>sc.restartBattle())} disabled={!ready||snapshot.infirmary}>Campo de Provas <b>REINICIAR</b><small>R</small></button>
        <button onClick={()=>act(sc=>sc.toggleDebug())} disabled={!ready}>Colisões <b>{snapshot.debug?'EXIBIR':'OCULTAS'}</b><small>H</small></button>
      </div>
      <button className="help-toggle" onClick={()=>setHelpOpen(!helpOpen)} aria-expanded={helpOpen}>
        {helpOpen?'▴ Ocultar controles':'▾ Como jogar / controles'}
      </button>
      {helpOpen && <div className="menu-help"><p><kbd>WASD</kbd> / <kbd>SETAS</kbd> caminhar</p>
        <p><kbd>J</kbd> / <kbd>ESPAÇO</kbd> combo</p><p><kbd>K</kbd> / <kbd>Q</kbd> Meteoro</p>
        <p><kbd>ENTER</kbd> tratar/retornar da enfermaria</p></div>}
      <div className="menu-footer">O progresso é salvo automaticamente neste navegador.</div>
    </aside>}

    {snapshot.infirmary && <div className="infirmary-modal" role="dialog" aria-modal="true" aria-labelledby="infirmaryTitle">
      <div className="infirmary-backdrop" aria-hidden="true" />
      <div className="infirmary-dialog">
        <div className="athena-crest">✦</div>
        <div className="sanctuary-caption">SANTUÁRIO DE ATHENA · REFÚGIO DOS CAVALEIROS</div>
        <h1 id="infirmaryTitle">Enfermaria Sagrada</h1>
        <p>{needsHealing?'Seiya caiu em combate. Os curandeiros estão prontos para restaurar suas forças.':
          'A força de Athena restaurou suas energias. Você pode voltar à arena.'}</p>
        <div className="recovery-data">
          <span>NÍVEL <b>{snapshot.level}</b></span>
          <span>EXP <b>{snapshot.xp}</b></span>
          <span>DRACMAS <b>{snapshot.drachmas}</b></span>
        </div>
        <div className="preservation-note">✧ Sua evolução permanece intacta após a derrota.</div>
        {needsHealing ? <button id="healBtn" className="recovery-button" onClick={()=>act(sc=>sc.healAtSanctuary())}>
          ✦ RECEBER TRATAMENTO
        </button> : <button id="returnBtn" className="recovery-button" onClick={()=>act(sc=>sc.returnToTraining())}>
          ⚔ VOLTAR AO CAMPO DE PROVAS
        </button>}
        <small className="recovery-footnote">Também é possível continuar pressionando ENTER.</small>
      </div>
    </div>}

    {snapshot.paused && !snapshot.infirmary && <div className="pause-modal" role="dialog" aria-modal="true">
      <h2>JOGO PAUSADO</h2>
      <button onClick={()=>act(sc=>sc.togglePause())}>CONTINUAR [ESC]</button>
    </div>}
  </div>;
}
