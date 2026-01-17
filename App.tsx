
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { GameState, PlayerState, Upgrade } from './types';
import { JOBS } from './constants';

const ROULETTE_COOLDOWN = 10 * 60 * 1000; // 10 minutes

const App: React.FC = () => {
  const [gameState, setGameState] = useState<GameState>(GameState.START);
  const [isMuted, setIsMuted] = useState(() => {
    const saved = localStorage.getItem('work_clicker_muted');
    return saved === 'true';
  });

  const [player, setPlayer] = useState<PlayerState>(() => {
    const saved = localStorage.getItem('work_clicker_save');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return {
          ...parsed,
          lastSpinTime: parsed.lastSpinTime || 0
        };
      } catch (e) {
        console.error("Failed to parse save", e);
      }
    }
    return {
      money: 0,
      totalMoneyEarned: 0,
      currentJobIndex: 0,
      purchasedUpgrades: [],
      unlockedJobs: [0],
      lastSpinTime: 0
    };
  });

  const [clickParticles, setClickParticles] = useState<{ id: number; x: number; y: number; val: string }[]>([]);
  const [isRouletteOpen, setIsRouletteOpen] = useState(false);
  const [isSpinning, setIsSpinning] = useState(false);
  const [rouletteRotation, setRouletteRotation] = useState(0);
  const [timeToNextSpin, setTimeToNextSpin] = useState(0);
  
  const particleIdRef = useRef(0);
  const audioContextRef = useRef<AudioContext | null>(null);

  // Initialize Audio Context on first interaction
  const getAudioContext = () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume();
    }
    return audioContextRef.current;
  };

  // Sound Synthesis Helpers
  const playSound = (freqs: number[], type: OscillatorType = 'sine', duration: number = 0.1, volume: number = 0.1) => {
    if (isMuted) return;
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    
    freqs.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = type;
      osc.frequency.setValueAtTime(freq, now + i * duration);
      
      gain.gain.setValueAtTime(volume, now + i * duration);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + (i + 1) * duration);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.start(now + i * duration);
      osc.stop(now + (i + 1) * duration);
    });
  };

  const playClickSound = () => playSound([440, 880], 'sine', 0.05, 0.05);
  const playPurchaseSound = () => playSound([523.25, 659.25, 783.99, 1046.50], 'triangle', 0.08, 0.08);
  const playPromotionSound = () => playSound([261.63, 329.63, 392.00, 523.25, 659.25], 'square', 0.15, 0.05);
  const playErrorSound = () => playSound([150, 100], 'sawtooth', 0.1, 0.05);
  const playEndSound = () => playSound([523.25, 523.25, 523.25, 659.25, 783.99, 1046.50], 'sine', 0.2, 0.1);
  const playRouletteTick = () => playSound([880], 'sine', 0.02, 0.02);
  const playRouletteWin = () => playSound([659.25, 830.61, 987.77, 1318.51], 'triangle', 0.1, 0.1);

  // Save game
  useEffect(() => {
    localStorage.setItem('work_clicker_save', JSON.stringify(player));
  }, [player]);

  useEffect(() => {
    localStorage.setItem('work_clicker_muted', String(isMuted));
  }, [isMuted]);

  // Cooldown timer logic
  useEffect(() => {
    const updateTimer = () => {
      const now = Date.now();
      const elapsed = now - player.lastSpinTime;
      const remaining = Math.max(0, ROULETTE_COOLDOWN - elapsed);
      setTimeToNextSpin(remaining);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [player.lastSpinTime]);

  const currentJob = JOBS[player.currentJobIndex];

  const calculateClickEarnings = useCallback(() => {
    let earnings = currentJob.baseClick;
    player.purchasedUpgrades.forEach(id => {
      const upgrade = currentJob.upgrades.find(u => u.id === id);
      if (upgrade?.bonusClick) earnings += upgrade.bonusClick;
    });
    return earnings;
  }, [currentJob, player.purchasedUpgrades]);

  const calculateSecEarnings = useCallback(() => {
    let earnings = currentJob.baseSec;
    player.purchasedUpgrades.forEach(id => {
      const upgrade = currentJob.upgrades.find(u => u.id === id);
      if (upgrade?.bonusSec) earnings += upgrade.bonusSec;
    });
    return earnings;
  }, [currentJob, player.purchasedUpgrades]);

  useEffect(() => {
    if (gameState !== GameState.WORKING) return;

    const interval = setInterval(() => {
      const earnings = calculateSecEarnings();
      if (earnings > 0) {
        setPlayer(prev => ({
          ...prev,
          money: prev.money + earnings,
          totalMoneyEarned: prev.totalMoneyEarned + earnings
        }));
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [gameState, calculateSecEarnings]);

  const formatMoney = (val: number) => {
    if (val >= 1e30) return (val / 1e30).toFixed(2) + "N";
    if (val >= 1e27) return (val / 1e27).toFixed(2) + "O";
    if (val >= 1e24) return (val / 1e24).toFixed(2) + "Sp";
    if (val >= 1e21) return (val / 1e21).toFixed(2) + "Sx";
    if (val >= 1e18) return (val / 1e18).toFixed(2) + "Qi";
    if (val >= 1e15) return (val / 1e15).toFixed(2) + "Q";
    if (val >= 1e12) return (val / 1e12).toFixed(2) + "T";
    if (val >= 1e9) return (val / 1e9).toFixed(2) + "B";
    if (val >= 1e6) return (val / 1e6).toFixed(2) + "M";
    if (val >= 1e3) return (val / 1e3).toFixed(1) + "K";
    return val.toFixed(0);
  };

  const handleWorkClick = (e: React.MouseEvent) => {
    playClickSound();
    const earnings = calculateClickEarnings();
    setPlayer(prev => ({
      ...prev,
      money: prev.money + earnings,
      totalMoneyEarned: prev.totalMoneyEarned + earnings
    }));

    const id = particleIdRef.current++;
    setClickParticles(prev => [...prev, { id, x: e.clientX, y: e.clientY, val: formatMoney(earnings) }]);
    setTimeout(() => {
      setClickParticles(prev => prev.filter(p => p.id !== id));
    }, 800);
  };

  const handleSpinRoulette = () => {
    if (timeToNextSpin > 0 || isSpinning) return;
    
    setIsSpinning(true);
    const spins = 5 + Math.random() * 5;
    const finalRotation = rouletteRotation + (spins * 360);
    setRouletteRotation(finalRotation);

    // Audio ticking effect
    let tickCount = 0;
    const totalTicks = 40;
    const tickInterval = setInterval(() => {
      if (tickCount >= totalTicks) {
        clearInterval(tickInterval);
        return;
      }
      playRouletteTick();
      tickCount++;
    }, 100);

    setTimeout(() => {
      setIsSpinning(false);
      playRouletteWin();
      
      // Calculate reward based on progress
      const potential = calculateClickEarnings() * 20 + calculateSecEarnings() * 100;
      const rewards = [0.1, 0.2, 0.5, 1, 2, 5, 10]; // Multipliers
      const randomReward = rewards[Math.floor(Math.random() * rewards.length)];
      const wonAmount = potential * randomReward;

      setPlayer(prev => ({
        ...prev,
        money: prev.money + wonAmount,
        totalMoneyEarned: prev.totalMoneyEarned + wonAmount,
        lastSpinTime: Date.now()
      }));

      // Feedback with particle
      const id = particleIdRef.current++;
      setClickParticles(prev => [...prev, { id, x: window.innerWidth / 2, y: window.innerHeight / 2, val: formatMoney(wonAmount) }]);
      setTimeout(() => {
        setClickParticles(prev => prev.filter(p => p.id !== id));
      }, 2000);
    }, 4000);
  };

  const buyUpgrade = (upgrade: Upgrade) => {
    if (player.money >= upgrade.cost && !player.purchasedUpgrades.includes(upgrade.id)) {
      playPurchaseSound();
      setPlayer(prev => ({
        ...prev,
        money: prev.money - upgrade.cost,
        purchasedUpgrades: [...prev.purchasedUpgrades, upgrade.id]
      }));
    } else {
      playErrorSound();
    }
  };

  const resign = () => {
    playPromotionSound();
    setGameState(GameState.CHOOSE_JOB);
    setPlayer(prev => ({
      ...prev,
      purchasedUpgrades: [],
      unlockedJobs: Array.from(new Set([...prev.unlockedJobs, prev.currentJobIndex + 1]))
    }));
  };

  const startJob = (index: number) => {
    playPromotionSound();
    setPlayer(prev => ({ ...prev, currentJobIndex: index }));
    setGameState(GameState.WORKING);
  };

  const restartGame = () => {
    localStorage.removeItem('work_clicker_save');
    setPlayer({
      money: 0,
      totalMoneyEarned: 0,
      currentJobIndex: 0,
      purchasedUpgrades: [],
      unlockedJobs: [0],
      lastSpinTime: 0
    });
    setGameState(GameState.START);
  };

  const toggleMute = () => {
    setIsMuted(!isMuted);
    if (isMuted) {
      setTimeout(() => playClickSound(), 10);
    }
  };

  const renderStart = () => (
    <div className="flex flex-col items-center justify-center min-h-screen p-6 text-center animate-fadeIn">
      <div className="mb-8 text-8xl animate-bounce">💼</div>
      <h1 className="text-7xl font-black mb-4 bg-gradient-to-r from-green-400 via-emerald-400 to-blue-500 bg-clip-text text-transparent drop-shadow-sm">
        Work Master
      </h1>
      <p className="text-xl text-gray-400 mb-12 max-w-md">
        Comece como estagiário e termine como a lenda absoluta da economia universal.
      </p>
      <button 
        onClick={() => { getAudioContext(); setGameState(GameState.WORKING); playPromotionSound(); }}
        className="px-12 py-6 bg-green-600 hover:bg-green-500 rounded-2xl text-3xl font-black shadow-xl shadow-green-900/40 transition-all hover:scale-105 active:scale-95 border-b-8 border-green-800"
      >
        INICIAR CARREIRA
      </button>
    </div>
  );

  const renderWorking = () => {
    const clickEarning = calculateClickEarnings();
    const secEarning = calculateSecEarnings();
    const isLastJob = player.currentJobIndex === JOBS.length - 1;

    return (
      <div className="flex flex-col lg:flex-row h-screen bg-gray-900">
        <div className="flex-1 flex flex-col items-center justify-center p-8 border-r border-gray-800 relative">
          
          {/* Top Bar Left */}
          <div className="absolute top-8 left-8 flex items-center gap-4">
            <div className="flex flex-col">
              <span className="text-xs text-gray-500 uppercase font-black tracking-widest">Ganhos Totais</span>
              <span className="text-sm font-bold text-gray-400">R$ {formatMoney(player.totalMoneyEarned)}</span>
            </div>
            <button 
              onClick={toggleMute}
              className="p-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-gray-400 transition-colors"
              title={isMuted ? "Unmute" : "Mute"}
            >
              {isMuted ? (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" clipRule="evenodd" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                </svg>
              )}
            </button>
          </div>

          {/* Luck Roulette Trigger */}
          <div className="absolute top-8 right-8">
            <button
              onClick={() => setIsRouletteOpen(true)}
              className="relative p-4 bg-gradient-to-tr from-yellow-600 to-yellow-400 rounded-full shadow-lg shadow-yellow-900/30 hover:scale-110 transition-transform group"
            >
              <span className="text-3xl">🎰</span>
              {timeToNextSpin === 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full animate-ping"></span>
              )}
            </button>
          </div>

          <div className="mb-12 text-center">
            <h2 className="text-3xl font-black text-gray-500 mb-2 uppercase tracking-tighter">{currentJob.name}</h2>
            <div className="text-7xl font-black text-green-400 money-text mb-4 tabular-nums">
              R$ {formatMoney(player.money)}
            </div>
            <div className="flex gap-4 justify-center">
              <div className="flex flex-col items-center px-6 py-2 bg-gray-800/80 rounded-2xl border border-gray-700">
                <span className="text-[10px] text-blue-400 font-black uppercase">Por Clique</span>
                <span className="text-xl font-bold">+R$ {formatMoney(clickEarning)}</span>
              </div>
              <div className="flex flex-col items-center px-6 py-2 bg-gray-800/80 rounded-2xl border border-gray-700">
                <span className="text-[10px] text-purple-400 font-black uppercase">Por Segundo</span>
                <span className="text-xl font-bold">+R$ {formatMoney(secEarning)}</span>
              </div>
            </div>
          </div>

          <button
            onClick={handleWorkClick}
            className="group relative w-72 h-72 rounded-3xl bg-gradient-to-br from-green-500 to-green-700 shadow-2xl shadow-green-900/50 flex items-center justify-center transition-all hover:scale-105 active:scale-90 border-t-8 border-green-400/30 overflow-hidden"
          >
            <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-20 transition-opacity"></div>
            <span className="text-4xl font-black text-white group-hover:scale-110 transition-transform tracking-widest">
              TRABALHAR
            </span>
          </button>

          {!isLastJob && (
            <button
              onClick={resign}
              disabled={player.money < currentJob.minMoneyToResign}
              className={`mt-12 px-10 py-4 rounded-2xl font-black text-xl transition-all border-b-4 ${
                player.money >= currentJob.minMoneyToResign 
                ? 'bg-orange-600 border-orange-800 hover:bg-orange-500 text-white cursor-pointer shadow-xl shadow-orange-900/30' 
                : 'bg-gray-800 border-gray-900 text-gray-600 cursor-not-allowed opacity-50'
              }`}
            >
              PEDIR AUMENTO
              {player.money < currentJob.minMoneyToResign && (
                <div className="text-[10px] font-bold mt-1 text-gray-500 uppercase">
                  Faltam R$ {formatMoney(currentJob.minMoneyToResign - player.money)}
                </div>
              )}
            </button>
          )}

          {isLastJob && (
             <button
             onClick={() => { playEndSound(); setGameState(GameState.END); }}
             className="mt-12 px-12 py-5 bg-yellow-500 hover:bg-yellow-400 text-black font-black rounded-2xl animate-bounce shadow-2xl shadow-yellow-900/40 border-b-4 border-yellow-700"
           >
             CONCLUIR LEGADO
           </button>
          )}
        </div>

        <div className="w-full lg:w-[450px] flex flex-col bg-gray-800/40 backdrop-blur-xl border-l border-gray-800">
          <div className="p-8 border-b border-gray-800 flex justify-between items-center">
            <h3 className="text-xl font-black uppercase tracking-widest text-gray-300">Inventário de Upgrades</h3>
            <span className="text-xs bg-gray-700 px-3 py-1 rounded-full text-gray-400 font-bold">
              {player.purchasedUpgrades.length} / {currentJob.upgrades.length}
            </span>
          </div>
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {currentJob.upgrades.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-gray-500 space-y-4">
                <span className="text-6xl">✨</span>
                <p className="font-bold uppercase tracking-widest text-center">Você atingiu o ápice!</p>
              </div>
            )}
            {currentJob.upgrades.map(upgrade => {
              const isBought = player.purchasedUpgrades.includes(upgrade.id);
              const canAfford = player.money >= upgrade.cost;
              return (
                <button
                  key={upgrade.id}
                  disabled={isBought || !canAfford}
                  onClick={() => buyUpgrade(upgrade)}
                  className={`w-full p-5 rounded-2xl border-2 text-left transition-all group ${
                    isBought 
                      ? 'bg-green-900/20 border-green-600/40 opacity-70' 
                      : canAfford 
                        ? 'bg-gray-800 border-gray-700 hover:border-green-500 hover:bg-gray-700/80 affordable-upgrade scale-100 hover:scale-[1.02]' 
                        : 'bg-gray-900 border-gray-800 opacity-40 cursor-not-allowed'
                  }`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <span className={`font-black text-lg ${isBought ? 'text-green-400' : 'text-white'}`}>
                      {upgrade.name}
                    </span>
                    <span className={`text-xs font-black px-3 py-1 rounded-lg ${isBought ? 'bg-green-500/20 text-green-400' : 'bg-black/40 text-yellow-500'}`}>
                      R$ {formatMoney(upgrade.cost)}
                    </span>
                  </div>
                  <div className="flex gap-3">
                    {upgrade.bonusClick && (
                      <span className="text-xs font-bold text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded">
                        +{formatMoney(upgrade.bonusClick)}/clique
                      </span>
                    )}
                    {upgrade.bonusSec && (
                      <span className="text-xs font-bold text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded">
                        +{formatMoney(upgrade.bonusSec)}/s
                      </span>
                    )}
                  </div>
                  {isBought && <div className="text-[10px] font-black text-green-500 mt-3 flex items-center gap-1">✓ ADQUIRIDO</div>}
                </button>
              );
            })}
          </div>
        </div>

        {/* Luck Roulette Modal */}
        {isRouletteOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fadeIn">
            <div className="relative bg-gray-900 border-2 border-yellow-500/50 rounded-[40px] p-10 max-w-md w-full shadow-[0_0_100px_rgba(234,179,8,0.2)]">
              <button 
                onClick={() => !isSpinning && setIsRouletteOpen(false)}
                className="absolute top-6 right-6 text-gray-500 hover:text-white"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              
              <div className="text-center mb-8">
                <h3 className="text-3xl font-black text-yellow-500 uppercase tracking-tighter">Roleta da Sorte</h3>
                <p className="text-gray-400 font-bold uppercase text-[10px] tracking-widest mt-2">Prêmio garantido a cada 10 minutos</p>
              </div>

              <div className="relative flex justify-center mb-10 h-64">
                {/* Pointer */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 -mt-4 z-10">
                   <div className="w-0 h-0 border-l-[15px] border-l-transparent border-r-[15px] border-r-transparent border-t-[30px] border-t-yellow-500 drop-shadow-xl"></div>
                </div>
                
                {/* The Wheel */}
                <div 
                  className="w-64 h-64 rounded-full border-8 border-gray-800 shadow-2xl flex items-center justify-center overflow-hidden transition-transform duration-[4000ms] cubic-bezier(0.15, 0, 0.15, 1)"
                  style={{ transform: `rotate(${rouletteRotation}deg)`, backgroundImage: 'conic-gradient(#1e293b 0deg 45deg, #0f172a 45deg 90deg, #1e293b 90deg 135deg, #0f172a 135deg 180deg, #1e293b 180deg 225deg, #0f172a 225deg 270deg, #1e293b 270deg 315deg, #0f172a 315deg 360deg)' }}
                >
                  <div className="absolute inset-0 flex items-center justify-center text-4xl">
                     <span className="rotate-[22deg] translate-x-20">💎</span>
                     <span className="rotate-[67deg] translate-x-20">💰</span>
                     <span className="rotate-[112deg] translate-x-20">💸</span>
                     <span className="rotate-[157deg] translate-x-20">🎰</span>
                     <span className="rotate-[202deg] translate-x-20">💎</span>
                     <span className="rotate-[247deg] translate-x-20">💰</span>
                     <span className="rotate-[292deg] translate-x-20">💸</span>
                     <span className="rotate-[337deg] translate-x-20">🎰</span>
                  </div>
                  <div className="w-16 h-16 bg-gray-900 border-4 border-yellow-500 rounded-full flex items-center justify-center z-10 shadow-inner">
                     <span className="text-xl">🌟</span>
                  </div>
                </div>
              </div>

              <button
                disabled={timeToNextSpin > 0 || isSpinning}
                onClick={handleSpinRoulette}
                className={`w-full py-5 rounded-2xl font-black text-2xl transition-all border-b-8 ${
                  timeToNextSpin === 0 && !isSpinning
                  ? 'bg-yellow-500 border-yellow-700 text-black hover:bg-yellow-400 active:translate-y-1 active:border-b-4'
                  : 'bg-gray-800 border-gray-900 text-gray-500 cursor-not-allowed'
                }`}
              >
                {isSpinning ? 'GIRANDO...' : timeToNextSpin > 0 ? (
                  <div className="flex flex-col">
                    <span>AGUARDE</span>
                    <span className="text-sm font-bold opacity-60">
                      {Math.floor(timeToNextSpin / 60000)}m {Math.floor((timeToNextSpin % 60000) / 1000)}s
                    </span>
                  </div>
                ) : 'GIRAR AGORA'}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderChooseJob = () => (
    <div className="flex flex-col items-center min-h-screen p-8 bg-gray-950 overflow-y-auto">
      <div className="max-w-6xl w-full">
        <header className="mb-12 text-center">
            <h2 className="text-5xl font-black mb-4 text-white uppercase tracking-tighter">Novo Contrato Disponível</h2>
            <p className="text-gray-500 font-bold">Escolha seu próximo passo estratégico na carreira multiversal.</p>
        </header>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {JOBS.map((job, idx) => {
            const isUnlocked = player.unlockedJobs.includes(idx);
            const isCurrent = player.currentJobIndex === idx;

            return (
                <div 
                key={job.id}
                className={`p-8 rounded-3xl border-4 flex flex-col transition-all relative overflow-hidden group ${
                    isCurrent 
                    ? 'bg-green-900/10 border-green-600 shadow-2xl shadow-green-900/20' 
                    : isUnlocked 
                        ? 'bg-gray-800/40 border-gray-700 hover:border-blue-500 hover:bg-gray-800' 
                        : 'bg-black border-gray-900 opacity-30 cursor-not-allowed'
                }`}
                >
                <div className="flex items-center gap-4 mb-3">
                  <span className="text-4xl drop-shadow-lg">{job.icon}</span>
                  <div className="text-3xl font-black text-white uppercase tracking-tighter leading-none">{job.name}</div>
                </div>
                <div className="flex flex-col gap-1 mb-8">
                    <div className="text-xs font-bold text-gray-500 uppercase">Salário Inicial</div>
                    <div className="text-sm font-bold text-blue-400">R$ {formatMoney(job.baseClick)}/clique • R$ {formatMoney(job.baseSec)}/s</div>
                </div>
                
                <button
                    disabled={!isUnlocked || isCurrent}
                    onClick={() => startJob(idx)}
                    className={`mt-auto w-full py-4 rounded-2xl font-black uppercase text-lg transition-all border-b-4 ${
                    isCurrent 
                        ? 'bg-green-600/50 border-green-800 text-white/50 cursor-default' 
                        : isUnlocked 
                        ? 'bg-blue-600 hover:bg-blue-500 border-blue-800 text-white shadow-lg' 
                        : 'bg-gray-800 border-gray-900 text-gray-600 cursor-not-allowed'
                    }`}
                >
                    {isCurrent ? 'CARGO ATUAL' : isUnlocked ? 'ASSINAR CONTRATO' : 'BLOQUEADO'}
                </button>

                {!isUnlocked && (
                    <div className="absolute top-4 right-4 text-2xl grayscale">🔒</div>
                )}
                </div>
            );
            })}
        </div>
      </div>
    </div>
  );

  const renderEnd = () => (
    <div className="flex flex-col items-center justify-center min-h-screen p-8 text-center bg-black relative">
      <div className="absolute inset-0 bg-gradient-to-t from-yellow-900/20 to-transparent"></div>
      <div className="relative z-10">
        <div className="mb-8 text-[120px] animate-pulse drop-shadow-2xl">🌌</div>
        <h1 className="text-8xl font-black mb-6 bg-gradient-to-r from-yellow-300 via-yellow-500 to-yellow-200 bg-clip-text text-transparent animate-pulse">
            MAGNATA UNIVERSAL
        </h1>
        <p className="text-3xl text-white mb-2 font-black uppercase tracking-widest">A Realidade é sua propriedade!</p>
        <p className="text-xl text-gray-400 mb-12 max-w-2xl mx-auto font-medium">
            Você transcendeu todas as formas de riqueza conhecidas. De um simples estagiário a Soberano de tudo o que existe e existirá.
        </p>
        <div className="p-8 bg-gray-900/50 rounded-3xl border border-yellow-500/30 mb-12">
            <span className="block text-xs font-bold text-gray-500 uppercase mb-1">Patrimônio Multiversal</span>
            <span className="text-5xl font-black text-yellow-500">R$ {formatMoney(player.totalMoneyEarned)}</span>
        </div>
        <button 
            onClick={() => { playPromotionSound(); restartGame(); }}
            className="px-16 py-6 bg-white text-black text-2xl font-black rounded-3xl hover:bg-yellow-400 hover:scale-110 transition-all shadow-[0_0_50px_rgba(255,255,255,0.2)]"
        >
            REINICIAR A LINHA DO TEMPO
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen select-none font-sans bg-gray-950 text-white overflow-hidden">
      {gameState === GameState.START && renderStart()}
      {gameState === GameState.WORKING && renderWorking()}
      {gameState === GameState.CHOOSE_JOB && renderChooseJob()}
      {gameState === GameState.END && renderEnd()}

      <div className="fixed inset-0 pointer-events-none z-[9999]">
        {clickParticles.map(p => (
          <div 
            key={p.id} 
            className="click-particle text-green-400 font-black text-3xl drop-shadow-lg text-center whitespace-nowrap"
            style={{ left: p.x - 40, top: p.y - 40 }}
          >
            +R${p.val}
          </div>
        ))}
      </div>
    </div>
  );
};

export default App;
