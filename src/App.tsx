import React, { useEffect, useRef, useState } from 'react';
import { GameEngine, GameStats } from './engine/GameEngine';
import { PersistenceService, UserData, Upgrades } from './engine/PersistenceService';

const SKIN_OPTIONS = [
  { name: 'Classic Grey', color: '#888888' },
  { name: 'Neon Blue', color: '#00ffff' },
  { name: 'Crimson Fury', color: '#ff0000' },
  { name: 'Emerald Wind', color: '#00ff88' },
  { name: 'Gold Leaf', color: '#ffcc00' }
];

const UPGRADE_COSTS = [0, 5000, 15000, 30000, 60000, 100000];

const App: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<GameEngine | null>(null);
  
  const [user, setUser] = useState<UserData | null>(PersistenceService.getCurrentUser());
  const [usernameInput, setUsernameInput] = useState('');
  const [gameState, setGameState] = useState<'menu' | 'shop' | 'playing' | 'gameOver'>('menu');
  
  const [stats, setStats] = useState<GameStats>({
    health: 100,
    fuel: 100,
    points: 0,
    speed: 0,
    alt: 0,
    dist: 0,
    warning: '',
    isCrashing: false,
    isPaused: false
  });
  const [discovery, setDiscovery] = useState<{ name: string; visible: boolean }>({ name: '', visible: false });
  const [gameOverReason, setGameOverReason] = useState('');

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!usernameInput.trim()) return;
    const loggedInUser = PersistenceService.login(usernameInput.trim());
    setUser(loggedInUser);
    setGameState('menu');
  };

  const handleLogout = () => {
    PersistenceService.logout();
    setUser(null);
    setGameState('menu');
  };

  const startGame = () => {
    if (!user) return;
    setGameState('playing');
  };

  const buyUpgrade = (type: keyof Upgrades) => {
    if (!user) return;
    const currentLevel = user.upgrades[type] as number;
    if (currentLevel >= 5) return;
    
    const cost = UPGRADE_COSTS[currentLevel + 1];
    if (user.totalPoints >= cost) {
      const updatedUser = {
        ...user,
        totalPoints: user.totalPoints - cost,
        upgrades: {
          ...user.upgrades,
          [type]: currentLevel + 1
        }
      };
      setUser(updatedUser);
      PersistenceService.saveUser(updatedUser);
    }
  };

  const changeSkin = (color: string) => {
    if (!user) return;
    const updatedUser = {
      ...user,
      upgrades: {
        ...user.upgrades,
        skin: color
      }
    };
    setUser(updatedUser);
    PersistenceService.saveUser(updatedUser);
  };

  useEffect(() => {
    if (gameState !== 'playing' || !containerRef.current || !user) return;

    const engine = new GameEngine(containerRef.current, user.upgrades);
    engineRef.current = engine;

    engine.onBiomeChange = (name) => {
      setDiscovery({ name, visible: true });
      setTimeout(() => setDiscovery(prev => ({ ...prev, visible: false })), 3000);
    };

    engine.onUpdateStats = (newStats) => {
      setStats(newStats);
    };

    engine.requestMotionPermission();

    engine.onGameOver = (reason) => {
      setGameOverReason(reason);
      setGameState('gameOver');
      
      // Save points
      if (user) {
        const finalPoints = engine.points; 
        const updatedUser = {
          ...user,
          totalPoints: user.totalPoints + finalPoints
        };
        setUser(updatedUser);
        PersistenceService.saveUser(updatedUser);
      }
    };

    let animationId: number;
    const animate = () => {
      engine.animate();
      animationId = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      cancelAnimationFrame(animationId);
      if (containerRef.current) {
        containerRef.current.innerHTML = '';
      }
    };
  }, [gameState]);

  if (!user) {
    return (
      <div style={{
        width: '100vw', height: '100vh', backgroundColor: '#050505',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        color: '#0ff', fontFamily: 'monospace'
      }}>
        <h1 style={{ fontSize: '3em', textShadow: '0 0 20px #0ff', marginBottom: '40px' }}>NEO-FLIGHT SIM</h1>
        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '20px', width: '300px' }}>
          <input 
            type="text" 
            placeholder="PILOT USERNAME"
            value={usernameInput}
            onChange={(e) => setUsernameInput(e.target.value)}
            style={{
              padding: '15px', background: '#001111', border: '2px solid #0ff',
              color: '#0ff', fontSize: '1.2em', outline: 'none', textAlign: 'center'
            }}
          />
          <button type="submit" style={{
            padding: '15px', background: '#0ff', color: '#000', border: 'none',
            fontWeight: 'bold', fontSize: '1.2em', cursor: 'pointer', boxShadow: '0 0 15px #0ff'
          }}>
            INITIALIZE SESSION
          </button>
        </form>
      </div>
    );
  }

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative', overflow: 'hidden', backgroundColor: '#000', fontFamily: 'monospace' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      
      {gameState === 'menu' && (
        <div style={{
          position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
          backgroundColor: 'rgba(0, 0, 0, 0.8)', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', color: '#fff', zIndex: 100
        }}>
          <h1 style={{ fontSize: '4em', textShadow: '0 0 20px #0ff' }}>WELCOME, {user.username}</h1>
          <p style={{ fontSize: '1.5em', color: '#0ff' }}>TOTAL CREDITS: {user.totalPoints.toLocaleString()}</p>
          
          <div style={{ display: 'flex', gap: '20px', marginTop: '40px' }}>
            <button onClick={startGame} style={buttonStyle}>START MISSION</button>
            <button onClick={() => setGameState('shop')} style={buttonStyle}>HANGAR (SHOP)</button>
            <button onClick={handleLogout} style={{ ...buttonStyle, borderColor: '#f00', color: '#f00' }}>LOGOUT</button>
          </div>
        </div>
      )}

      {gameState === 'shop' && (
        <div style={{
          position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
          backgroundColor: 'rgba(0, 5, 5, 0.95)', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', color: '#fff', zIndex: 100, overflowY: 'auto', padding: '40px'
        }}>
          <h1 style={{ fontSize: '3em', color: '#0ff', marginBottom: '10px' }}>SHIP HANGAR</h1>
          <p style={{ fontSize: '1.5em', color: '#ffcc00' }}>AVAILABLE CREDITS: {user.totalPoints.toLocaleString()}</p>
          
          <div style={{ display: 'flex', gap: '40px', marginTop: '30px', flexWrap: 'wrap', justifyContent: 'center' }}>
            {/* Upgrades */}
            <div style={shopCardStyle}>
              <h3>FUEL EFFICIENCY</h3>
              <p>Lvl {user.upgrades.fuelEfficiency} / 5</p>
              {user.upgrades.fuelEfficiency < 5 ? (
                <button onClick={() => buyUpgrade('fuelEfficiency')} style={shopButtonStyle}>
                  UPGRADE ({UPGRADE_COSTS[user.upgrades.fuelEfficiency + 1].toLocaleString()})
                </button>
              ) : <p style={{ color: '#0f0' }}>MAXED</p>}
            </div>

            <div style={shopCardStyle}>
              <h3>HULL REINFORCEMENT</h3>
              <p>Lvl {user.upgrades.maxHealth} / 5</p>
              {user.upgrades.maxHealth < 5 ? (
                <button onClick={() => buyUpgrade('maxHealth')} style={shopButtonStyle}>
                  UPGRADE ({UPGRADE_COSTS[user.upgrades.maxHealth + 1].toLocaleString()})
                </button>
              ) : <p style={{ color: '#0f0' }}>MAXED</p>}
            </div>

            {/* Skins */}
            <div style={{ ...shopCardStyle, width: '400px' }}>
              <h3>SHIP PAINT JOB</h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', justifyContent: 'center', marginTop: '10px' }}>
                {SKIN_OPTIONS.map(skin => (
                  <div 
                    key={skin.color}
                    onClick={() => changeSkin(skin.color)}
                    style={{
                      width: '60px', height: '60px', backgroundColor: skin.color,
                      border: user.upgrades.skin === skin.color ? '4px solid #fff' : '2px solid #555',
                      cursor: 'pointer', borderRadius: '5px'
                    }}
                    title={skin.name}
                  />
                ))}
              </div>
            </div>
          </div>

          <button onClick={() => setGameState('menu')} style={{ ...buttonStyle, marginTop: '50px' }}>BACK TO COMMAND</button>
        </div>
      )}

      {gameState === 'playing' && (
        <>
          {/* HUD Layer */}
          <div style={{
            position: 'absolute', top: '20px', left: '20px', right: '20px', 
            display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
            color: '#0ff', textShadow: '0 0 5px #0ff', pointerEvents: 'none', userSelect: 'none', zIndex: 10
          }}>
            {/* Left Stats */}
            <div>
              <div style={{ marginBottom: '15px' }}>
                 <div style={{ fontSize: '0.8em', color: '#888' }}>HULL INTEGRITY</div>
                 <div style={{ width: '200px', height: '10px', background: '#002222', border: '1px solid #0ff', marginTop: '4px' }}>
                    <div style={{ width: `${stats.health}%`, height: '100%', background: stats.health < 30 ? '#f00' : '#0ff', transition: 'width 0.3s' }} />
                 </div>
              </div>
              <div>
                 <div style={{ fontSize: '0.8em', color: '#888' }}>FUEL RESERVE</div>
                 <div style={{ width: '200px', height: '10px', background: '#002222', border: '1px solid #ffcc00', marginTop: '4px' }}>
                    <div style={{ width: `${stats.fuel}%`, height: '100%', background: '#ffcc00', transition: 'width 0.1s' }} />
                 </div>
              </div>
            </div>

            {/* Center Title */}
            <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '1.2em', fontWeight: 'bold' }}>PILOT: {user.username}</div>
                <div style={{ fontSize: '0.7em', color: '#888' }}>STATUS: MISSION ACTIVE</div>
            </div>

            {/* Right Stats */}
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '1.5em' }}>{stats.points.toLocaleString()} PTS</div>
              <div style={{ marginTop: '10px' }}>SPD: {stats.speed} km/h</div>
              <div>ALT: {stats.alt} m</div>
              <div>DST: {stats.dist} m</div>
            </div>
          </div>

          {/* Crosshair */}
          <div style={{
            position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            color: 'rgba(255, 255, 255, 0.6)', fontSize: '2em', fontWeight: 'lighter',
            pointerEvents: 'none', userSelect: 'none', zIndex: 5, fontFamily: 'sans-serif'
          }}>
            +
          </div>

          {/* Discovery Text */}
          <div style={{
            position: 'absolute', top: '40%', left: '50%', transform: `translate(-50%, ${discovery.visible ? '-60%' : '-50%'})`,
            color: '#fff', fontSize: '2.5em', fontWeight: 'bold', textAlign: 'center',
            textShadow: '0 0 20px #0ff', opacity: discovery.visible ? 1 : 0,
            transition: 'opacity 1s, transform 2s', pointerEvents: 'none', letterSpacing: '4px'
          }}>
            APPROACHING ZONE<br />
            <span style={{ fontSize: '1.5em', color: '#0ff' }}>{discovery.name}</span>
          </div>

          {/* Crash Flashing Light */}
          {(stats.isCrashing || (gameState as string) === 'gameOver') && (
            <div style={{
                position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                backgroundColor: 'rgba(255, 0, 0, 0.3)', zIndex: 30,
                animation: 'crashFlash 0.15s infinite alternate',
                pointerEvents: 'none'
            }}>
                <style>{`
                    @keyframes crashFlash {
                        from { opacity: 0; }
                        to { opacity: 1; }
                    }
                `}</style>
            </div>
          )}

          {/* Pause Overlay */}
          {stats.isPaused && (
            <div style={{
              position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
              backgroundColor: 'rgba(0, 0, 0, 0.7)', display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', color: '#fff', zIndex: 50,
              backdropFilter: 'blur(4px)'
            }}>
              <h1 style={{ fontSize: '3em', textShadow: '0 0 20px #0ff', marginBottom: '30px' }}>PAUSED</h1>
              <div style={{
                background: '#001a1a', border: '1px solid #0ff', padding: '25px 40px',
                borderRadius: '10px', fontFamily: 'monospace', lineHeight: '2em', fontSize: '0.9em'
              }}>
                <div style={{ color: '#0ff', fontWeight: 'bold', marginBottom: '10px', fontSize: '1.1em' }}>CONTROLS</div>
                <div><span style={{ color: '#0ff' }}>W / ↑</span> — Pitch Up</div>
                <div><span style={{ color: '#0ff' }}>S / ↓</span> — Pitch Down</div>
                <div><span style={{ color: '#0ff' }}>A / ←</span> — Roll Left</div>
                <div><span style={{ color: '#0ff' }}>D / →</span> — Roll Right</div>
                <div><span style={{ color: '#0ff' }}>Q</span> — Yaw Left</div>
                <div><span style={{ color: '#0ff' }}>E</span> — Yaw Right</div>
                <div><span style={{ color: '#0ff' }}>C</span> — Recalibrate Motion</div>
                <div style={{ marginTop: '10px', borderTop: '1px solid #333', paddingTop: '10px' }}>
                  <span style={{ color: '#ffcc00' }}>ESC</span> — Resume
                </div>
              </div>
            </div>
          )}

          {/* Controls Hint (fades after 5s) */}
          <div style={{
            position: 'absolute', bottom: '20px', left: '50%', transform: 'translateX(-50%)',
            color: '#888', fontSize: '0.8em', textAlign: 'center',
            pointerEvents: 'none', userSelect: 'none', zIndex: 10,
            animation: 'fadeOutHint 5s forwards'
          }}>
            WASD to fly | ESC to pause
            <style>{`
              @keyframes fadeOutHint {
                0% { opacity: 1; }
                70% { opacity: 1; }
                100% { opacity: 0; }
              }
            `}</style>
          </div>

          {/* Altitude Warnings */}
          {stats.warning && (
            <div style={{
                position: 'absolute', top: '20%', left: '50%', transform: 'translate(-50%, -50%)',
                color: '#f00', fontSize: '2em', fontWeight: 'bold', textAlign: 'center',
                textShadow: '0 0 10px #f00', animation: 'blink 0.5s infinite', zIndex: 20
            }}>
                {stats.warning}
                <style>{`
                    @keyframes blink {
                        0% { opacity: 1; }
                        50% { opacity: 0; }
                        100% { opacity: 1; }
                    }
                `}</style>
            </div>
          )}
        </>
      )}

      {/* Game Over Screen */}
      {gameState === 'gameOver' && (
        <div style={{
          position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
          backgroundColor: 'rgba(20, 0, 0, 0.8)', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', color: '#fff', zIndex: 100,
          backdropFilter: 'blur(8px)'
        }}>
          <h1 style={{ fontSize: '4em', textShadow: '0 0 20px #f00', marginBottom: '0' }}>MISSION FAILED</h1>
          <p style={{ color: '#f00', fontSize: '1.2em', letterSpacing: '2px', marginBottom: '40px' }}>{gameOverReason}</p>
          
          <div style={{ textAlign: 'center', marginBottom: '40px' }}>
            <div style={{ fontSize: '2em', color: '#0ff' }}>{stats.points.toLocaleString()}</div>
            <div style={{ fontSize: '0.8em', color: '#888' }}>UNITS RECOVERED</div>
          </div>

          <button 
            onClick={() => setGameState('menu')}
            style={buttonStyle}
          >
            RETURN TO COMMAND
          </button>
        </div>
      )}
    </div>
  );
};

const buttonStyle: React.CSSProperties = {
  padding: '15px 40px', fontSize: '1.2em', cursor: 'pointer',
  backgroundColor: 'transparent', border: '2px solid #0ff',
  color: '#0ff', fontWeight: 'bold', boxShadow: '0 0 10px #0ff',
  transition: 'all 0.2s', outline: 'none'
};

const shopCardStyle: React.CSSProperties = {
  background: '#001a1a', border: '1px solid #0ff', padding: '25px',
  width: '250px', textAlign: 'center', borderRadius: '10px'
};

const shopButtonStyle: React.CSSProperties = {
  marginTop: '15px', padding: '10px 20px', background: '#0ff', color: '#000',
  border: 'none', fontWeight: 'bold', cursor: 'pointer', width: '100%'
};

export default App;
