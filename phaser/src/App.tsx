import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { createGame } from './game/createGame';
import type { GameSnapshot, TrainingScene } from './game/TrainingScene';
import './styles.css';

const START: GameSnapshot = {
  hp: 150,
  maxHp: 150,
  cosmo: 55,
  maxCosmo: 100,
  enemyHp: 90,
  enemyMaxHp: 90,
  enemies: 3,
  level: 1,
  xp: 0,
  xpNext: 125,
  drachmas: 0,
  kills: 0,
  facing: 'down',
  phase: 'idle',
  auto: false,
  vfx: true,
  debug: false,
  paused: false,
  dead: false,
  infirmary: false,
  healed: false,
  defeats: 0,
  lastAction: 'Carregando treinamento...'
};

type Movement = 'up' | 'down' | 'left' | 'right';
const MOVE: Record<Movement, { x: number; y: number }> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 }
};

function Meter({ value, max, kind }: { value: number; max: number; kind: 'life' | 'cosmo' | 'xp' }) {
  const pct = Math.max(0, Math.min(100, (100 * value) / (max || 1)));
  return (
    <div className={`meter ${kind}`} role="progressbar" aria-valuemin={0} aria-valuemax={max} aria-valuenow={value}>
      <span style={{ width: `${pct}%` }} />
    </div>
  );
}

function Action({
  title,
  detail,
  onClick,
  disabled = false,
  hotkey,
  theme = 'normal'
}: {
  title: string;
  detail: string;
  onClick: () => void;
  disabled?: boolean;
  hotkey: string;
  theme?: string;
}) {
  return (
    <button className={`action action-${theme}`} onClick={onClick} disabled={disabled} aria-label={`${title}, tecla ${hotkey}`}>
      <span className="action-hotkey">{hotkey}</span>
      <strong>{title}</strong>
      <small>{detail}</small>
    </button>
  );
}

function statusLabel(snapshot: GameSnapshot) {
  if (snapshot.infirmary) return snapshot.healed ? 'Pronto para retornar' : 'Em recuperação';
  if (snapshot.cosmo >= 45) return 'Meteoro disponível';
  if (snapshot.hp <= snapshot.maxHp * 0.3) return 'Em condição crítica';
  if (snapshot.auto) return 'Treino automático ativo';
  return 'Treinamento em andamento';
}

function titleByLevel(level: number) {
  if (level >= 10) return 'Lenda em ascensão';
  if (level >= 5) return 'Cavaleiro promissor';
  if (level >= 3) return 'Discípulo resiliente';
  return 'Aprendiz do Santuário';
}

export default function App() {
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<TrainingScene | null>(null);
  const pointer = useRef<number | null>(null);
  const [snapshot, setSnapshot] = useState<GameSnapshot>(START);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [help, setHelp] = useState(false);
  const [hidePanel, setHidePanel] = useState(false);

  useEffect(() => {
    if (!host.current) return;
    let mounted = true;
    let game: ReturnType<typeof createGame> | undefined;
    try {
      game = createGame(
        host.current,
        sc => {
          if (!mounted) return;
          scene.current = sc;
          sc.report = next => {
            if (mounted) setSnapshot(next);
          };
          sc.publishState();
          setReady(true);
        },
        message => {
          if (mounted) setError(message);
        }
      );
      game.events.on('destroy', () => {
        if (mounted) setReady(false);
      });
    } catch (err) {
      setError(String(err));
    }
    return () => {
      mounted = false;
      scene.current = null;
      game?.destroy(true);
    };
  }, []);

  const act = (fn: (sc: TrainingScene) => void) => {
    const sc = scene.current;
    if (sc) fn(sc);
  };

  const moveStart = (e: PointerEvent<HTMLButtonElement>, dir: Movement) => {
    e.preventDefault();
    pointer.current = e.pointerId;
    e.currentTarget.setPointerCapture(e.pointerId);
    act(sc => sc.setVirtualMovement(MOVE[dir].x, MOVE[dir].y));
  };

  const moveEnd = (e: PointerEvent<HTMLButtonElement>) => {
    if (pointer.current === e.pointerId) {
      pointer.current = null;
      act(sc => sc.setVirtualMovement(0, 0));
    }
  };

  const canAct = ready && !snapshot.infirmary && !snapshot.paused;
  const enemyPct = Math.max(0, Math.min(100, (100 * snapshot.enemyHp) / (snapshot.enemyMaxHp || 1)));

  return (
    <div className="app-root">
      <div className="sky-glow sky-glow-left" />
      <div className="sky-glow sky-glow-right" />

      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">✦</div>
          <div>
            <b>SAINT SEIYA</b>
            <span>
              ASCENSÃO DO COSMO <i>· ARENA DO SANTUÁRIO · V0.6</i>
            </span>
          </div>
        </div>

        <div className="session">
          <span className="dot" />
          SANTUÁRIO DE ATHENA
          <span className="session-tag">CAPÍTULO ZERO</span>
        </div>

        <button className="top-button" onClick={() => setHelp(true)}>
          <span>?</span> Controles
        </button>
      </header>

      <div className="content">
        <aside className={`side player-panel ${hidePanel ? 'mobile-hidden' : ''}`}>
          <div className="panel-title">
            <span>01</span> CAVALEIRO ATIVO
          </div>

          <div className="portrait">
            <div className="portrait-halo" />
            <div className="portrait-sigil">PEGASUS</div>
            <img
              src="./assets/seiya/portrait.png"
              alt="Seiya Base"
              onError={e => {
                e.currentTarget.style.display = 'none';
              }}
            />
            <div className="portrait-symbol">♞</div>
          </div>

          <h2>
            SEIYA <span>BASE</span>
          </h2>
          <p className="sub">{titleByLevel(snapshot.level)}</p>

          <div className="hero-badges">
            <span className="hero-badge">Constelação de Pégaso</span>
            <span className="hero-badge muted">Sem Armadura</span>
          </div>

          <div className="level-row">
            <strong>NV. {snapshot.level}</strong>
            <span>{statusLabel(snapshot)}</span>
          </div>

          <label className="stat-label">
            <span>VIDA</span>
            <b>
              {snapshot.hp} / {snapshot.maxHp}
            </b>
          </label>
          <Meter kind="life" value={snapshot.hp} max={snapshot.maxHp} />

          <label className="stat-label">
            <span>ENERGIA CÓSMICA</span>
            <b>
              {snapshot.cosmo} / {snapshot.maxCosmo}
            </b>
          </label>
          <Meter kind="cosmo" value={snapshot.cosmo} max={snapshot.maxCosmo} />

          <label className="stat-label">
            <span>EXPERIÊNCIA</span>
            <b>
              {snapshot.xp} / {snapshot.xpNext}
            </b>
          </label>
          <Meter kind="xp" value={snapshot.xp} max={snapshot.xpNext} />

          <div className="persist-note">✦ PROGRESSO SALVO NO NAVEGADOR · {snapshot.defeats} {snapshot.defeats === 1 ? 'DERROTA' : 'DERROTAS'}</div>

          <div className="panel-callout">
            <small>Estado atual</small>
            <strong>{snapshot.lastAction}</strong>
          </div>

          <div className="divider" />
          <div className="section-cap">FORMAÇÃO • 1 ATIVO / 2 RESERVAS</div>

          <div className="reserve active">
            <span>1</span>
            <strong>Seiya Base</strong>
            <small>EM COMBATE</small>
          </div>
          <div className="reserve locked">
            <span>2</span>
            <strong>Reserva</strong>
            <small>NÃO DISPONÍVEL</small>
          </div>
          <div className="reserve locked">
            <span>3</span>
            <strong>Reserva</strong>
            <small>NÃO DISPONÍVEL</small>
          </div>

          <p className="side-foot">Um cavaleiro luta por vez. Os outros dois são reservas. Na derrota, Seiya vai para a enfermaria sem perder progresso.</p>
        </aside>

        <main className="main-column">
          <div className="arena-heading">
            <div>
              <small>CAPÍTULO ZERO · TREINAMENTO DO SANTUÁRIO</small>
              <h1>Campo de Provas</h1>
            </div>
            <div className="arena-meta">
              <span>⚔ {snapshot.enemies} inimigos</span>
              <span>✦ {snapshot.kills} derrotados</span>
            </div>
          </div>

          <div className="status-ribbon">
            <div className="status-chip gold">✦ Missão: O despertar do Cosmo</div>
            <div className="status-chip blue">{snapshot.infirmary ? '✦ Recuperação no Santuário' : `Direção: ${snapshot.facing.toUpperCase()}`}</div>
            <div className={`status-chip ${snapshot.cosmo >= 45 ? 'cyan' : 'stone'}`}>{snapshot.infirmary ? 'Cavaleiro em tratamento' : snapshot.cosmo >= 45 ? 'Meteoro pronto' : 'Cosmo insuficiente para o Meteoro'}</div>
            <div className={`status-chip ${snapshot.auto ? 'green' : 'stone'}`}>{snapshot.auto ? 'Combate automático ativo' : 'Combate manual'}</div>
          </div>

          <div className="zodiac-frieze" aria-label="As doze casas">
            <span className="zodiac-caption">ZODÍACO</span>
            {['♈', '♉', '♊', '♋', '♌', '♍', '♎', '♏', '♐', '♑', '♒', '♓'].map((sign, i) => (
              <span className={`zodiac-symbol ${i === 8 ? 'zodiac-active' : ''}`} key={i}>
                {sign}
              </span>
            ))}
            <span className="zodiac-trail">✦</span>
          </div>

          <div className="game-shell">
            <div className="game-frame">
              <div className="frame-corner corner-tl" />
              <div className="frame-corner corner-tr" />
              <div className="frame-corner corner-bl" />
              <div className="frame-corner corner-br" />
              <div className="game-mount" ref={host} />

              {(!ready || !!error) && (
                <div className="loading">
                  <div className="loading-ring" />
                  <b>{error || 'Preparando arena...'}</b>
                  <small>Phaser · TypeScript · React</small>
                </div>
              )}

              <div className="game-toptag">
                <span>◈</span> PROVA DOS CAVALEIROS <span className="direction-chip">{snapshot.facing.toUpperCase()}</span>
              </div>
              <div className="game-bottomtag">{snapshot.lastAction}</div>
              <div className="battle-hud" aria-label="Estado do cavaleiro">
                <div className="battle-hud-heading"><strong>SEIYA</strong><span>NV. {snapshot.level}</span></div>
                <div className="battle-hud-meter"><label>VIDA</label><Meter kind="life" value={snapshot.hp} max={snapshot.maxHp}/><b>{snapshot.hp}/{snapshot.maxHp}</b></div>
                <div className="battle-hud-meter"><label>COSMO</label><Meter kind="cosmo" value={snapshot.cosmo} max={snapshot.maxCosmo}/><b>{snapshot.cosmo}/{snapshot.maxCosmo}</b></div>
              </div>

              {snapshot.infirmary && (
                <div className="infirmary-overlay" role="region" aria-label="Enfermaria do Santuário">
                  <div className="infirmary-night-sky" aria-hidden="true" />
                  <div className="infirmary-columns" aria-hidden="true"><span /><span /><span /><span /></div>
                  <div className="infirmary-card">
                    <div className="infirmary-emblem" aria-hidden="true">✦</div>
                    <div className="infirmary-eyebrow">SANTUÁRIO DE ATHENA · REFÚGIO DOS CAVALEIROS</div>
                    <h2>Enfermaria do Santuário</h2>
                    <p className="infirmary-lead">{snapshot.healed
                      ? 'Seu Cosmo voltou a pulsar. Você está pronto para retomar o treinamento.'
                      : 'O corpo caiu, mas a vontade de lutar permanece. Os curandeiros aguardam para restaurar suas forças.'}</p>
                    <div className="infirmary-stats" aria-label="Progresso preservado">
                      <div><small>NÍVEL PRESERVADO</small><strong>{snapshot.level}</strong></div>
                      <div><small>XP PRESERVADA</small><strong>{snapshot.xp}<span> / {snapshot.xpNext}</span></strong></div>
                      <div><small>DRACMAS</small><strong>{snapshot.drachmas}</strong></div>
                    </div>
                    <div className="infirmary-pledge">✧ Sua evolução e suas conquistas não são perdidas com a derrota.</div>
                    {snapshot.healed ? (
                      <button className="infirmary-cta" onClick={() => act(sc => sc.returnToTraining())}>
                        ⚔ VOLTAR AO CAMPO DE PROVAS
                      </button>
                    ) : (
                      <button className="infirmary-cta" onClick={() => act(sc => sc.healAtSanctuary())}>
                        ✦ RECEBER TRATAMENTO
                      </button>
                    )}
                    <small className="infirmary-footer">{snapshot.healed ? 'Vida restaurada · Cosmo recuperado · próximo combate liberado' : 'Sem penalidade de nível, experiência ou moeda'}</small>
                  </div>
                </div>
              )}

              {snapshot.paused && !snapshot.infirmary && (
                <div className="game-overlay">
                  <span>Ⅱ</span>
                  <h2>JOGO PAUSADO</h2>
                  <p>O cosmo está em suspensão temporária.</p>
                  <button onClick={() => act(sc => sc.togglePause())}>Continuar [ESC]</button>
                </div>
              )}
            </div>
          </div>

          <div className="arena-lowerbar">
            <div className="arena-card">
              <small>ALVO ATUAL</small>
              <strong>Sentinela de Treinamento</strong>
              <div className="mini-meter enemy-health-bar">
                <span style={{ width: `${enemyPct}%` }} />
              </div>
              <em>
                HP {snapshot.enemyHp}/{snapshot.enemyMaxHp}
              </em>
            </div>
            <div className="arena-card">
              <small>TÉCNICA SUPREMA</small>
              <strong>Meteoro de Pégaso</strong>
              <em>{snapshot.infirmary ? 'Técnica indisponível durante a recuperação' : snapshot.cosmo >= 45 ? 'Pronto para disparo' : 'Acumule 45 de Cosmo'}</em>
            </div>
            <div className="arena-card">
              <small>RECUPERAÇÃO</small>
              <strong>{Math.max(0, 45 - snapshot.cosmo)}</strong>
              <em>Cosmo restante para o Meteoro</em>
            </div>
          </div>

          <div className="action-bar">
            <div className="action-group action-group-main">
              <Action title="Ataque" detail="Combo de 3 golpes" hotkey="J" onClick={() => act(sc => sc.tryAttack())} disabled={!canAct} />
              <Action
                title="Meteoro de Pégaso"
                detail="45 Cosmo · rajada principal"
                hotkey="K"
                theme="cosmic"
                onClick={() => act(sc => sc.tryMeteor())}
                disabled={!canAct || snapshot.cosmo < 45}
              />
            </div>
            <div className="action-group compact">
              <Action title={snapshot.auto ? 'Automático: ON' : 'Automático: OFF'} detail="IA opcional" hotkey="F" theme={snapshot.auto ? 'selected' : 'normal'} onClick={() => act(sc => sc.toggleAuto())} disabled={!ready} />
              <Action title={snapshot.vfx ? 'VFX: ON' : 'VFX: OFF'} detail="Efeitos cósmicos" hotkey="G" onClick={() => act(sc => sc.toggleVfx())} disabled={!ready} />
              <Action title={snapshot.debug ? 'Debug: ON' : 'Debug: OFF'} detail="Colisões e alcance" hotkey="H" onClick={() => act(sc => sc.toggleDebug())} disabled={!ready} />
            </div>
          </div>

          <div className="mobile-controls">
            <div className="dpad">
              <span />
              <button className="up" aria-label="Mover para cima" onPointerDown={e => moveStart(e, 'up')} onPointerUp={moveEnd} onPointerCancel={moveEnd}>
                ▲
              </button>
              <span />
              <button className="left" aria-label="Mover para esquerda" onPointerDown={e => moveStart(e, 'left')} onPointerUp={moveEnd} onPointerCancel={moveEnd}>
                ◀
              </button>
              <span className="pad-center">✦</span>
              <button className="right" aria-label="Mover para direita" onPointerDown={e => moveStart(e, 'right')} onPointerUp={moveEnd} onPointerCancel={moveEnd}>
                ▶
              </button>
              <span />
              <button className="down" aria-label="Mover para baixo" onPointerDown={e => moveStart(e, 'down')} onPointerUp={moveEnd} onPointerCancel={moveEnd}>
                ▼
              </button>
              <span />
            </div>
            <div className="mobile-action">
              <button onPointerDown={e => { e.preventDefault(); act(sc => sc.tryAttack()); }} disabled={!canAct}>SOCAR</button>
              <button className="meteor-button" onPointerDown={e => { e.preventDefault(); act(sc => sc.tryMeteor()); }} disabled={!canAct || snapshot.cosmo < 45}>METEORO</button>
            </div>
          </div>

          <div className="instructions">
            <span>W A S D / SETAS <strong>Mover</strong></span>
            <span>J / ESPAÇO <strong>Combo</strong></span>
            <span>K / Q <strong>Meteoro</strong></span>
            <span>ESC <strong>Pausa</strong></span>
            <span>R <strong>Reorganizar arena</strong></span>
          </div>
        </main>

        <aside className={`side objective-panel ${hidePanel ? 'mobile-hidden' : ''}`}>
          <div className="panel-title">
            <span>02</span> CRÔNICA DO SANTUÁRIO
          </div>

          <div className="mission-icon">✧</div>
          <small className="mission-type">MISSÃO DE TREINAMENTO</small>
          <h2>O despertar do Cosmo</h2>
          <p>Enfrente os guardas de treinamento, refine seus movimentos básicos e concentre seu Cosmo até tornar o Meteoro de Pégaso uma assinatura confiável em combate.</p>

          <div className="objective objective-highlight">
            <span>01</span>
            <div>
              <strong>Derrote os guardas</strong>
              <small>
                {snapshot.kills}/5 derrotados {snapshot.kills >= 5 ? '✓' : ''}
              </small>
              <Meter kind="xp" value={Math.min(5, snapshot.kills)} max={5} />
            </div>
          </div>

          <div className="objective">
            <span>02</span>
            <div>
              <strong>Domine o Meteoro</strong>
              <small>Use K quando tiver 45 de Cosmo.</small>
            </div>
          </div>

          <div className="objective">
            <span>03</span>
            <div>
              <strong>Mantenha o ritmo</strong>
              <small>Sobreviva, ataque e continue acumulando XP.</small>
            </div>
          </div>

          <div className="divider" />
          <div className="section-cap">INIMIGO MAIS PRÓXIMO</div>

          <div className="enemy-info">
            <div className="enemy-avatar">♟</div>
            <div>
              <b>Sentinela de Treinamento</b>
              <small>Autômato provisório · PvE</small>
            </div>
          </div>

          <Meter kind="life" value={snapshot.enemyHp} max={snapshot.enemyMaxHp} />
          <div className="target-detail">PV do alvo: {snapshot.enemyHp}/{snapshot.enemyMaxHp}</div>

          <div className="divider" />
          <div className="section-cap">SESSÃO</div>

          <div className="resource">
            <span>Dracmas</span>
            <b>{snapshot.drachmas} ◈</b>
          </div>
          <div className="resource">
            <span>Inimigos derrotados</span>
            <b>{snapshot.kills}</b>
          </div>
          <div className="resource">
            <span>Derrotas / retornos</span>
            <b>{snapshot.defeats}</b>
          </div>
          <div className="resource">
            <span>Modo de combate</span>
            <b>{snapshot.auto ? 'Automático' : 'Manual'}</b>
          </div>

          <button className="minor" disabled={!ready || snapshot.infirmary} onClick={() => act(sc => sc.togglePause())}>{snapshot.paused ? '▶ Continuar' : 'Ⅱ Pausar'} [ESC]</button>
          <button className="minor" disabled={!ready || snapshot.infirmary} onClick={() => act(sc => sc.restartBattle())}>↻ Reorganizar arena [R]</button>

          <div className="alpha-note">Versão 0.5 · A derrota leva à enfermaria. Nível, experiência e Dracmas ficam salvos localmente no navegador. A progressão online será integrada mais tarde.</div>
        </aside>
      </div>

      <footer>
        <span>✧ SAINT SEIYA — ASCENSÃO DO COSMO</span>
        <span>BUILD LOCAL · V0.5 · PROGRESSO LOCAL · PHASER + TYPESCRIPT + REACT</span>
        <button onClick={() => setHidePanel(v => !v)}>{hidePanel ? 'Mostrar painéis' : 'Ocultar painéis'}</button>
      </footer>

      {help && (
        <div className="help-backdrop" role="dialog" aria-modal="true" aria-label="Controles do jogo">
          <div className="help-dialog">
            <button className="help-close" onClick={() => setHelp(false)}>✕</button>
            <h2>Manual de combate</h2>
            <p>Movimente Seiya com <b>W A S D</b> ou <b>setas</b>. Pressione <b>J / Espaço</b> para executar o combo básico. Golpes consecutivos alternam os três ataques da sequência.</p>
            <p>Use <b>K / Q</b> para disparar o <b>Meteoro de Pégaso</b>. Ele exige 45 pontos de Cosmo. O Cosmo é recuperado ao acertar inimigos em combate.</p>
            <p>Pressione <b>F</b> para alternar combate automático, <b>G</b> para ligar ou desligar VFX, <b>H</b> para visualizar hitboxes, <b>ESC</b> para pausar e <b>R</b> para reiniciar a arena.</p>
            <p className="help-caveat">Um único cavaleiro luta por vez. Ao ficar sem vida, Seiya é levado à enfermaria. Receba tratamento e volte ao combate sem perder nível, XP ou Dracmas. O progresso atual é salvo apenas no navegador.</p>
            <button className="help-confirm" onClick={() => setHelp(false)}>Entrar na arena</button>
          </div>
        </div>
      )}
    </div>
  );
}