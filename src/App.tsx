/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  Volume2,
  VolumeX,
  Pause,
  Play,
  RotateCcw,
  Zap,
  Shield,
  Trophy,
  ArrowUp,
  ArrowDown,
  Sparkles,
  Star,
} from 'lucide-react';
import { GameEngine, SKINS, type GameState, type RunStats, type SkinId } from './game/engine.ts';
import { sound } from './game/audio.ts';

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<GameEngine | null>(null);

  const [gameState, setGameState] = useState<GameState>('title');
  const [hud, setHud] = useState({
    score: 0,
    distance: 0,
    stars: 0,
    combo: 1,
    screamMeter: 0,
    isTurbo: false,
    hasShield: false,
  });
  const [runStats, setRunStats] = useState<RunStats | null>(null);
  const [isMuted, setIsMuted] = useState<boolean>(sound.getMuted());
  const [selectedSkin, setSelectedSkin] = useState<SkinId>('classic');
  const [bestScore, setBestScore] = useState<number>(0);

  // Initialize Canvas & Engine
  useEffect(() => {
    if (!canvasRef.current) return;

    const engine = new GameEngine(canvasRef.current);
    engineRef.current = engine;

    setBestScore(engine.bestScore);
    setSelectedSkin(engine.skin.id);

    engine.onStateChange = (state: GameState, stats?: RunStats) => {
      setGameState(state);
      if (stats) {
        setRunStats(stats);
        setBestScore(stats.bestScore);
      }
    };

    engine.onHudUpdate = (nextHud) => {
      setHud({ ...nextHud });
    };

    engine.start();

    // Check for autostart=1 in URL query
    const params = new URLSearchParams(window.location.search);
    if (params.get('autostart') === '1') {
      engine.startGame();
    }

    return () => {
      engine.stop();
    };
  }, []);

  const handleStartGame = useCallback(() => {
    if (engineRef.current) {
      engineRef.current.startGame();
    }
  }, []);

  const handleTogglePause = useCallback(() => {
    if (engineRef.current) {
      engineRef.current.togglePause();
    }
  }, []);

  const handleReturnToTitle = useCallback(() => {
    if (engineRef.current) {
      engineRef.current.returnToTitle();
    }
  }, []);

  const handleToggleMute = useCallback((e?: React.MouseEvent) => {
    (e?.currentTarget as HTMLElement | null)?.blur();
    const muted = sound.toggleMute();
    setIsMuted(muted);
    if (engineRef.current) {
      // Sync engine
    }
  }, []);

  const handleSelectSkin = (skinId: SkinId) => {
    setSelectedSkin(skinId);
    if (engineRef.current) {
      engineRef.current.setSkin(skinId);
    }
  };

  const handleTriggerTurbo = () => {
    if (engineRef.current) {
      engineRef.current.triggerTurbo();
    }
  };

  return (
    <div
      className="relative w-screen h-screen overflow-hidden select-none bg-[#faf8f5] font-sans text-zinc-900"
      data-testid="game-container"
    >
      {/* Isolated Canvas Container */}
      <div className="absolute inset-0 w-full h-full">
        <canvas
          ref={canvasRef}
          data-testid="game-canvas"
          className="w-full h-full block cursor-pointer"
          onClick={() => {
            if (gameState === 'title' || gameState === 'gameover') {
              handleStartGame();
            } else if (gameState === 'playing') {
              engineRef.current?.triggerJump();
            }
          }}
        />
      </div>

      {/* TOP-RIGHT PERSISTENT UTILITY CONTROLS */}
      <div className="absolute top-4 right-4 z-40 flex items-center gap-2 pointer-events-auto">
        <button
          onClick={handleToggleMute}
          tabIndex={-1}
          aria-label={isMuted ? 'Unmute sound' : 'Mute sound'}
          className="w-10 h-10 rounded-xl bg-zinc-900 border-2 border-zinc-900 text-white flex items-center justify-center hover:bg-zinc-800 active:scale-95 transition-all shadow-md focus:outline-none"
        >
          {isMuted ? <VolumeX className="w-5 h-5 text-zinc-400" /> : <Volume2 className="w-5 h-5 text-white" />}
        </button>

        {gameState === 'playing' && (
          <button
            onClick={handleTogglePause}
            tabIndex={-1}
            aria-label="Pause game"
            className="w-10 h-10 rounded-xl bg-zinc-900 border-2 border-zinc-900 text-white flex items-center justify-center hover:bg-zinc-800 active:scale-95 transition-all shadow-md focus:outline-none"
          >
            <Pause className="w-5 h-5 text-white" />
          </button>
        )}
      </div>

      {/* --- PLAYING HUD (LOW-OCCLUSION, PERIMETER ONLY, >85% FREE VIEWPORT) --- */}
      {gameState === 'playing' && (
        <div className="absolute inset-0 pointer-events-none p-4 flex flex-col justify-between z-30">
          {/* Top Bar: Corner Clusters */}
          <div className="flex items-start justify-between w-full max-w-5xl mx-auto">
            {/* Top-Left Cluster: Score, Distance, Combo */}
            <div className="flex flex-col gap-1.5">
              <div className="bg-white/95 border-2 border-zinc-900 rounded-2xl px-4 py-2 shadow-[4px_4px_0px_#18181b] flex items-center gap-4">
                <div>
                  <span className="block text-[10px] font-black tracking-widest text-zinc-500 uppercase">SCORE</span>
                  <span className="text-2xl font-black tabular-nums tracking-tight text-zinc-900">
                    {hud.score.toLocaleString()}
                  </span>
                </div>

                <div className="h-7 w-[2px] bg-zinc-200" />

                <div>
                  <span className="block text-[10px] font-black tracking-widest text-zinc-500 uppercase">DISTANCE</span>
                  <span className="text-xl font-bold tabular-nums text-zinc-700">
                    {hud.distance}m
                  </span>
                </div>

                <div className="h-7 w-[2px] bg-zinc-200" />

                <div className="flex items-center gap-1.5">
                  <div className="w-5 h-5 rounded-full bg-amber-400 border border-zinc-900 flex items-center justify-center">
                    <Star className="w-3 h-3 fill-zinc-900 text-zinc-900" />
                  </div>
                  <span className="text-lg font-bold tabular-nums text-amber-600">
                    {hud.stars}
                  </span>
                </div>
              </div>

              {/* Active Combo Badge */}
              {hud.combo > 1 && (
                <div className="inline-flex items-center gap-1.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-black text-xs px-3 py-1 rounded-xl border-2 border-zinc-900 shadow-[3px_3px_0px_#18181b] animate-bounce w-max">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>COMBO x{hud.combo}!</span>
                </div>
              )}
            </div>

            {/* Top-Center Cluster: Turbo Scream Meter */}
            <div className="flex flex-col items-center">
              <div className="bg-white/95 border-2 border-zinc-900 rounded-2xl p-2.5 shadow-[4px_4px_0px_#18181b] flex items-center gap-3">
                <div className="flex flex-col">
                  <div className="flex items-center justify-between gap-3 mb-1">
                    <span className="text-[10px] font-black tracking-wider uppercase text-zinc-600 flex items-center gap-1">
                      <Zap className="w-3 h-3 text-amber-500 fill-amber-500" />
                      SCREAM METER
                    </span>
                    <span className="text-[10px] font-black tabular-nums text-zinc-700">
                      {hud.screamMeter}%
                    </span>
                  </div>

                  {/* Meter Bar */}
                  <div className="w-36 sm:w-48 h-3.5 bg-zinc-100 rounded-full border border-zinc-900 overflow-hidden relative">
                    <div
                      className={`h-full transition-all duration-150 ${
                        hud.isTurbo
                          ? 'bg-amber-400 animate-pulse'
                          : hud.screamMeter >= 100
                          ? 'bg-gradient-to-r from-amber-400 to-orange-500 animate-pulse'
                          : 'bg-amber-400'
                      }`}
                      style={{ width: `${hud.screamMeter}%` }}
                    />
                  </div>
                </div>

                {/* Turbo Trigger Button */}
                <button
                  onClick={handleTriggerTurbo}
                  disabled={hud.screamMeter < 99 && !hud.isTurbo}
                  tabIndex={-1}
                  className={`pointer-events-auto px-3 py-1.5 rounded-xl border-2 border-zinc-900 font-black text-xs uppercase tracking-wider flex items-center gap-1 transition-all ${
                    hud.isTurbo
                      ? 'bg-amber-400 text-zinc-900 shadow-[2px_2px_0px_#18181b] animate-pulse'
                      : hud.screamMeter >= 99
                      ? 'bg-amber-400 text-zinc-900 hover:bg-amber-300 shadow-[3px_3px_0px_#18181b] active:translate-x-0.5 active:translate-y-0.5 cursor-pointer animate-bounce'
                      : 'bg-zinc-200 text-zinc-400 border-zinc-400 opacity-60 cursor-not-allowed'
                  }`}
                >
                  <Zap className="w-3.5 h-3.5" />
                  {hud.isTurbo ? 'TURBO ON!' : 'SCREAM!'}
                </button>
              </div>

              {/* Shield Status indicator */}
              {hud.hasShield && (
                <div className="mt-1.5 bg-sky-100 border-2 border-zinc-900 text-sky-800 text-[10px] font-black uppercase px-2.5 py-0.5 rounded-lg shadow-[2px_2px_0px_#18181b] flex items-center gap-1">
                  <Shield className="w-3 h-3 text-sky-600 fill-sky-500" />
                  SHIELD ACTIVE
                </div>
              )}
            </div>

            {/* Spacer for top right utility icons */}
            <div className="w-24" />
          </div>

          {/* Bottom Mobile / Touch Controls Strip */}
          <div className="w-full flex items-center justify-between pb-2 pointer-events-auto sm:hidden">
            {/* Slide Button */}
            <button
              onTouchStart={() => engineRef.current?.triggerSlide()}
              onTouchEnd={() => engineRef.current?.releaseSlide()}
              onMouseDown={() => engineRef.current?.triggerSlide()}
              onMouseUp={() => engineRef.current?.releaseSlide()}
              tabIndex={-1}
              className="w-16 h-16 rounded-2xl bg-white/90 border-3 border-zinc-900 shadow-[4px_4px_0px_#18181b] flex flex-col items-center justify-center font-black text-xs active:bg-zinc-200 active:translate-x-0.5 active:translate-y-0.5"
            >
              <ArrowDown className="w-6 h-6" />
              SLIDE
            </button>

            {/* Jump Button */}
            <button
              onClick={() => engineRef.current?.triggerJump()}
              tabIndex={-1}
              className="w-20 h-20 rounded-2xl bg-amber-400 border-3 border-zinc-900 shadow-[4px_4px_0px_#18181b] flex flex-col items-center justify-center font-black text-sm active:bg-amber-300 active:translate-x-0.5 active:translate-y-0.5"
            >
              <ArrowUp className="w-7 h-7" />
              JUMP
            </button>
          </div>
        </div>
      )}

      {/* --- TITLE SCREEN OVERLAY --- */}
      {gameState === 'title' && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-between p-4 sm:p-10 pointer-events-none">
          {/* Top High Score Badge */}
          <div className="w-full flex items-center justify-between max-w-4xl pr-14">
            <div className="bg-white/90 border-2 border-zinc-900 rounded-2xl px-3 sm:px-4 py-2 shadow-[3px_3px_0px_#18181b] flex items-center gap-2 pointer-events-auto">
              <Trophy className="w-4 h-4 sm:w-5 sm:h-5 text-amber-500 shrink-0" />
              <span className="text-[10px] sm:text-xs font-black tracking-wider text-zinc-500 uppercase">BEST:</span>
              <span className="text-sm sm:text-lg font-black tabular-nums text-zinc-900">
                {bestScore.toLocaleString()} PTS
              </span>
            </div>

            <div className="hidden sm:flex bg-amber-100 border-2 border-zinc-900 text-amber-900 font-black text-xs px-3 py-1.5 rounded-xl shadow-[3px_3px_0px_#18181b] items-center gap-1.5 pointer-events-auto">
              <Sparkles className="w-4 h-4 text-amber-600" />
              <span>HAND-DRAWN DOODLE SPRINT</span>
            </div>
          </div>

          {/* Center Title Lockup & Start CTA */}
          <div className="flex flex-col items-center text-center max-w-xl pointer-events-auto">
            {/* Bespoke inline SVG Title Lockup */}
            <div className="relative mb-5 sm:mb-6">
              <svg
                viewBox="0 0 540 140"
                className="w-full max-w-xs sm:max-w-lg filter drop-shadow-[5px_5px_0px_#18181b]"
              >
                {/* Comic speech bubble tail */}
                <path
                  d="M 60 100 L 20 125 L 90 105 Z"
                  fill="#ffffff"
                  stroke="#18181b"
                  strokeWidth="5"
                  strokeLinejoin="round"
                />

                {/* Main Bubble */}
                <rect
                  x="10"
                  y="10"
                  width="520"
                  height="100"
                  rx="30"
                  fill="#ffffff"
                  stroke="#18181b"
                  strokeWidth="6"
                />

                {/* FlipaTulga Go! Title */}
                <text
                  x="270"
                  y="66"
                  textAnchor="middle"
                  fontFamily='"Impact", "Arial Black", sans-serif'
                  fontSize="48"
                  fontWeight="900"
                  fill="#18181b"
                  letterSpacing="1"
                >
                  FlipaTulga
                </text>

                <text
                  x="270"
                  y="96"
                  textAnchor="middle"
                  fontFamily='"Impact", "Arial Black", sans-serif'
                  fontSize="26"
                  fontWeight="900"
                  fill="#f59e0b"
                  letterSpacing="6"
                >
                  GO!
                </text>
              </svg>

              {/* Decorative star badge */}
              <div className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-amber-400 border-2 border-zinc-900 shadow-[2px_2px_0px_#18181b] flex items-center justify-center">
                <Star className="w-4 h-4 fill-zinc-900 text-zinc-900" />
              </div>
            </div>

            {/* Primary Start CTA Button */}
            <button
              onClick={handleStartGame}
              data-start="true"
              tabIndex={0}
              className="group relative inline-flex items-center justify-center gap-3 px-8 sm:px-12 py-4 bg-amber-400 hover:bg-amber-300 text-zinc-900 border-4 border-zinc-900 rounded-3xl font-black text-2xl tracking-wider shadow-[6px_6px_0px_#18181b] active:translate-x-1 active:translate-y-1 active:shadow-[2px_2px_0px_#18181b] transition-all cursor-pointer mb-5"
            >
              <Play className="w-7 h-7 fill-zinc-900" />
              <span>Start Escape!!!</span>
            </button>

            {/* Skin Selector */}
            <div className="bg-white/95 border-2 border-zinc-900 rounded-2xl p-3 shadow-[4px_4px_0px_#18181b] mb-4 w-full">
              <span className="block text-[11px] font-black uppercase tracking-wider text-zinc-500 mb-2">
                CHOOSE RUNNER STYLE
              </span>
              <div className="grid grid-cols-4 gap-2">
                {(Object.keys(SKINS) as SkinId[]).map((skinId) => {
                  const skin = SKINS[skinId];
                  const isSelected = selectedSkin === skinId;
                  return (
                    <button
                      key={skinId}
                      onClick={() => handleSelectSkin(skinId)}
                      tabIndex={-1}
                      className={`px-2 py-2 rounded-xl border-2 text-xs font-black transition-all flex flex-col items-center gap-1 ${
                        isSelected
                          ? 'border-zinc-900 bg-amber-200 shadow-[2px_2px_0px_#18181b] scale-105'
                          : 'border-zinc-300 bg-zinc-50 hover:bg-zinc-100 text-zinc-600'
                      }`}
                    >
                      <div
                        className="w-5 h-5 rounded-full border border-zinc-900"
                        style={{ backgroundColor: skin.fillColor }}
                      />
                      <span className="truncate w-full text-center text-[10px]">
                        {skin.name}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Bottom Flat Borderless Control Hint */}
          <div className="text-center font-bold text-xs sm:text-sm text-zinc-600 tracking-wide">
            Space/W Jump (x2 Double) · Down/S Slide · Shift/Right Turbo · P Pause · M Mute
          </div>
        </div>
      )}

      {/* --- PAUSE MODAL CARD --- */}
      {gameState === 'paused' && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-zinc-900/40">
          <div className="bg-white border-[10px] sm:border-[12px] border-zinc-900 rounded-[32px] p-6 sm:p-8 max-w-sm w-full text-center">
            <h2 className="text-3xl font-black tracking-tight text-zinc-900 mb-2 font-display">
              GAME PAUSED
            </h2>
            <p className="text-sm font-semibold text-zinc-500 mb-6">
              Catch your breath! The screaming will resume shortly.
            </p>

            <div className="flex flex-col gap-3">
              <button
                onClick={handleTogglePause}
                tabIndex={0}
                className="w-full py-3.5 bg-[#ffbe1a] hover:bg-amber-300 border-[5px] border-zinc-900 rounded-2xl font-black text-lg text-zinc-900 transition-all flex items-center justify-center gap-2 cursor-pointer active:translate-y-0.5"
              >
                <Play className="w-5 h-5 fill-zinc-900" />
                RESUME RUN
              </button>

              <button
                onClick={handleStartGame}
                data-start="true"
                tabIndex={-1}
                className="w-full py-3 bg-zinc-100 hover:bg-zinc-200 border-[5px] border-zinc-900 rounded-2xl font-bold text-sm text-zinc-800 transition-all flex items-center justify-center gap-2 cursor-pointer active:translate-y-0.5"
              >
                <RotateCcw className="w-4 h-4 stroke-[2.5]" />
                RESTART FROM BEGINNING
              </button>

              <button
                onClick={handleReturnToTitle}
                tabIndex={-1}
                className="w-full py-2.5 text-zinc-500 hover:text-zinc-900 font-bold text-xs uppercase tracking-wider transition-colors cursor-pointer"
              >
                RETURN TO THE MENU
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- GAME OVER MODAL CARD (EXACT MATCH TO SCREENSHOT_1) --- */}
      {gameState === 'gameover' && runStats && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-zinc-900/40">
          <div className="bg-white border-[10px] sm:border-[12px] border-zinc-900 rounded-[32px] p-6 sm:p-8 max-w-sm sm:max-w-md w-full text-center">
            {/* Rank Crest */}
            <div className="inline-flex flex-col items-center mb-4">
              <div
                className="w-16 h-16 rounded-2xl border-[6px] border-zinc-900 flex items-center justify-center text-4xl font-black mb-2"
                style={{ backgroundColor: runStats.rank.color, color: '#ffffff' }}
              >
                {runStats.rank.rank}
              </div>
              <span className="text-xs font-black tracking-widest uppercase text-zinc-500">
                {runStats.rank.title}
              </span>
            </div>

            <h2 className="text-3xl font-black text-zinc-900 tracking-tight mb-5">
              OUCH! CRASHED!
            </h2>

            {/* Run Mastery Stats Grid */}
            <div className="grid grid-cols-2 gap-3 mb-5 text-left">
              <div className="bg-white border-[5px] border-zinc-900 rounded-2xl p-3 sm:p-3.5">
                <span className="block text-[10px] font-black uppercase tracking-wider text-zinc-500">
                  FINAL SCORE
                </span>
                <span className="text-2xl font-black tabular-nums text-zinc-900">
                  {runStats.score.toLocaleString()}
                </span>
              </div>

              <div className="bg-white border-[5px] border-zinc-900 rounded-2xl p-3 sm:p-3.5">
                <span className="block text-[10px] font-black uppercase tracking-wider text-zinc-500">
                  DISTANCE
                </span>
                <span className="text-2xl font-black tabular-nums text-zinc-900">
                  {runStats.distance}m
                </span>
              </div>

              <div className="bg-white border-[5px] border-zinc-900 rounded-2xl p-3 sm:p-3.5">
                <span className="block text-[10px] font-black uppercase tracking-wider text-zinc-500">
                  INK STARS
                </span>
                <span className="text-xl font-black tabular-nums text-amber-500 flex items-center gap-1.5">
                  <Star className="w-4 h-4 fill-amber-500 text-amber-500" />
                  {runStats.stars}
                </span>
              </div>

              <div className="bg-white border-[5px] border-zinc-900 rounded-2xl p-3 sm:p-3.5">
                <span className="block text-[10px] font-black uppercase tracking-wider text-zinc-500">
                  MAX COMBO
                </span>
                <span className="text-xl font-black tabular-nums text-orange-600">
                  x{runStats.maxCombo}
                </span>
              </div>
            </div>

            {/* CTAs */}
            <div className="flex flex-col gap-3">
              <button
                onClick={handleStartGame}
                data-start="true"
                tabIndex={0}
                className="w-full py-3.5 sm:py-4 bg-[#ffbe1a] hover:bg-amber-300 border-[5px] border-zinc-900 rounded-2xl font-black text-lg sm:text-xl text-zinc-900 transition-all flex items-center justify-center gap-2 cursor-pointer active:translate-y-0.5"
              >
                <RotateCcw className="w-5 h-5 stroke-[2.5]" />
                RUN AGAIN (SPACE / ENTER)
              </button>

              <button
                onClick={handleReturnToTitle}
                tabIndex={-1}
                className="w-full py-2 text-zinc-500 hover:text-zinc-900 font-bold text-xs uppercase tracking-wider transition-colors cursor-pointer"
              >
                RETURN TO THE MENU
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
