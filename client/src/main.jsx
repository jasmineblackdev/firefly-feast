import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import Firefly from './art/Firefly.jsx';
import GameCanvas from './GameCanvas.jsx';

// VITE_SERVER_URL points the client at a game server on another host (for example a
// Vercel front-end talking to a Render server). It accepts a plain origin
// ("https://firefly-feast.onrender.com") or a full socket URL ("wss://host/ws").
// With nothing set, the client talks to whatever host served the page, which is the
// single-Node-app deploy.
function resolveWsUrl() {
  const configured = String(import.meta.env.VITE_SERVER_URL || import.meta.env.VITE_WS_URL || '').trim().replace(/\/+$/, '');
  const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
  if (!configured) return `${scheme}://${location.host}/ws`;
  let url = configured.replace(/^http:\/\//, 'ws://').replace(/^https:\/\//, 'wss://');
  if (!/^wss?:\/\//.test(url)) url = `${scheme}://${url}`;
  return /\/ws$/.test(url) ? url : `${url}/ws`;
}
const WS_URL = resolveWsUrl();
const CONNECT_TIMEOUT_MS = 6000;
const RETRY_DELAY_MS = 2000;
// The server pushes a snapshot every 50ms, so this much silence means a dead socket.
const STALE_AFTER_MS = 5000;
// Snapshots arrive 20x a second. The arena reads them all straight from a ref, while the
// React interface commits at most this often, and only when something it shows changed.
const UI_COMMIT_MS = 150;
const UNREACHABLE_MESSAGE = 'Can’t reach the game server. Check your internet and try again.';
const LOBBY_SLOTS = 8;

const prefersReducedMotion = () =>
  typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ------------------------------------------------------------------ how to play ----- */

const RULES = [
  { key: 'move', tone: 'move', glyph: '✥', title: 'Fly around', body: <>Drag anywhere to fly. On a keyboard, use <kbd>↑↓←→</kbd> or <kbd>WASD</kbd>.</> },
  { key: 'collect', tone: 'dew', glyph: '✦', title: 'Collect dewdrops', body: <>Every dewdrop is <strong>+1</strong>. Golden stars are <strong>+5</strong>, but they fade fast!</> },
  { key: 'rain', tone: 'rain', glyph: '☂', title: 'Dodge the rain', body: <>Stay away from the falling raindrops. A hit spills <strong>2</strong> of your dewdrops.</> },
  { key: 'dash', tone: 'dash', glyph: '⚡', title: 'Dash and boop', body: <>Tap <strong>DASH</strong> (or <kbd>Space</kbd>) to zoom. Dash into a friend to boop <strong>2</strong> of their drops loose. Rain can’t hit you while you dash.</> }
];

function HowToPlay() {
  return (
    <>
      {RULES.map(rule => (
        <div className="rule" key={rule.key}>
          <span className={`rule-badge tone-${rule.tone}`} aria-hidden="true">{rule.glyph}</span>
          <div className="rule-copy">
            <b>{rule.title}</b>
            <p>{rule.body}</p>
          </div>
        </div>
      ))}
      <div className="rule-match">
        <span aria-hidden="true">🏆</span>
        <p>
          <b>3 rounds · 60 seconds each</b>
          <br />1st, 2nd and 3rd place earn 3, 2 and 1 match points. The most match points wins the
          match — a tie goes to the most dewdrops collected.
        </p>
      </div>
    </>
  );
}

function HowToPlayModal({ onClose }) {
  const closeRef = useRef(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-veil" role="dialog" aria-modal="true" aria-labelledby="howto-heading" onClick={onClose}>
      <div className="panel modal-panel" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <p className="kicker">HOW TO PLAY</p>
            <h2 id="howto-heading" className="display-sm">Ready, set, glow!</h2>
          </div>
          <button ref={closeRef} className="btn-icon" onClick={onClose} aria-label="Close how to play">✕</button>
        </div>
        <HowToPlay />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------- decoration ----- */

const DRIFTERS = [
  { color: '#C5A4FF', top: '18%', left: '8%', size: 26, delay: '0s', dur: '19s' },
  { color: '#65F6D0', top: '62%', left: '14%', size: 20, delay: '-4s', dur: '23s' },
  { color: '#F6E96B', top: '28%', left: '82%', size: 23, delay: '-9s', dur: '21s' },
  { color: '#7ED7FF', top: '74%', left: '76%', size: 18, delay: '-2s', dur: '26s' },
  { color: '#A8F078', top: '45%', left: '90%', size: 16, delay: '-13s', dur: '24s' },
  { color: '#FF7FA8', top: '84%', left: '34%', size: 17, delay: '-7s', dur: '28s' }
];

function NightScene() {
  return (
    <div className="night" aria-hidden="true">
      <div className="night-sky" />
      <div className="night-stars" />
      <div className="night-moon" />
      <svg className="night-trees" viewBox="0 0 1200 240" preserveAspectRatio="none">
        <path
          fill="currentColor"
          d="M0 240V150l40 18 26-46 34 40 30-66 38 58 28-30 36 52 32-72 40 66 28-38 34 46 30-58 38 62 26-34 36 44 32-66 40 60 28-42 34 50 30-62 38 66 26-30 36 46 32-70 40 64 28-36 34 44 30-60 38 58 26-28 36 48 32-64 40 62 28-40 34 48 30-56 38 60 26-32 36 42V240Z"
        />
      </svg>
      <div className="night-mist" />
      {DRIFTERS.map((d, i) => (
        <span
          key={i}
          className="drifter"
          style={{ top: d.top, left: d.left, '--dur': d.dur, animationDelay: d.delay }}
        >
          <Firefly color={d.color} size={d.size} />
        </span>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------------- app ------ */

// A compact digest of everything the React interface displays. If this is unchanged
// between snapshots there is nothing to re-render.
function displayDigest(state) {
  if (!state) return '';
  const seconds = state.deadline ? Math.ceil(Math.max(0, state.deadline - state.serverNow) / 1000) : 0;
  const count = state.countdownEnd ? Math.ceil(Math.max(0, state.countdownEnd - state.serverNow) / 1000) : 0;
  let roster = '';
  for (const p of state.players) {
    roster += `${p.id}:${p.name}:${p.color}:${p.score}:${p.matchPoints}:${p.totalScore}:${p.place}:${p.connected ? 1 : 0}:${p.isHost ? 1 : 0}:${p.dashReady ? 1 : 0};`;
  }
  return `${state.phase}|${state.round}|${seconds}|${count}|${roster}`;
}

function rosterKey(state) {
  return state ? state.players.map(p => `${p.id}:${p.connected ? 1 : 0}:${p.isHost ? 1 : 0}`).join(';') : '';
}

function App() {
  const [name, setName] = useState('');
  const [roomInput, setRoomInput] = useState(new URLSearchParams(location.search).get('room')?.toUpperCase() || '');
  const [view, setView] = useState(null);
  const [meId, setMeId] = useState(sessionStorage.getItem('ff-playerId') || '');
  const [error, setError] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [unreachable, setUnreachable] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [muted, setMuted] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [toast, setToast] = useState('');
  const calm = useMemo(prefersReducedMotion, []);

  const wsRef = useRef(null);
  const stateRef = useRef(null);
  const viewRef = useRef(null);
  const digestRef = useRef('');
  const commitTimerRef = useRef(null);
  const audioRef = useRef(null);
  const intentionalClose = useRef(false);
  // The seat, the latest name and "am I in a room" live in refs so the socket
  // handlers always read current values instead of the ones captured at connect time.
  const seatRef = useRef({
    playerId: sessionStorage.getItem('ff-playerId') || '',
    token: sessionStorage.getItem('ff-token') || '',
    room: sessionStorage.getItem('ff-room') || ''
  });
  const nameRef = useRef('');
  nameRef.current = name;
  const inRoomRef = useRef(false);
  const openTimerRef = useRef(null);
  const retryTimerRef = useRef(null);
  const lastAttemptRef = useRef(null);
  const lastMessageRef = useRef(0);
  const connectRef = useRef(null);
  const toastTimerRef = useRef(null);

  const showToast = useCallback((text, ms = 2200) => {
    setToast(text);
    clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(''), ms);
  }, []);

  const sound = useCallback(kind => {
    if (muted || !soundEnabled) return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      if (!audioRef.current) audioRef.current = new AudioContext();
      const ctx = audioRef.current;
      if (ctx.state === 'suspended') ctx.resume();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const now = ctx.currentTime;
      osc.type = kind === 'hit' ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(kind === 'star' ? 880 : kind === 'hit' ? 150 : 520, now);
      osc.frequency.exponentialRampToValueAtTime(kind === 'star' ? 1320 : kind === 'hit' ? 75 : 760, now + 0.12);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(kind === 'hit' ? 0.12 : 0.07, now + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.17);
    } catch {}
  }, [muted, soundEnabled]);

  const clearSeat = useCallback(() => {
    seatRef.current = { playerId: '', token: '', room: '' };
    sessionStorage.removeItem('ff-playerId');
    sessionStorage.removeItem('ff-token');
    sessionStorage.removeItem('ff-room');
  }, []);

  const commitView = useCallback(() => {
    clearTimeout(commitTimerRef.current);
    commitTimerRef.current = null;
    viewRef.current = stateRef.current;
    digestRef.current = displayDigest(stateRef.current);
    setView(stateRef.current);
  }, []);

  // Retry the seat every RETRY_DELAY_MS for as long as the server holds it (30s).
  const scheduleResume = useCallback(() => {
    if (retryTimerRef.current) return;
    retryTimerRef.current = window.setTimeout(() => {
      retryTimerRef.current = null;
      const seat = seatRef.current;
      if (!seat.room || !seat.playerId || !seat.token) return;
      connectRef.current?.('resume', { room: seat.room, playerId: seat.playerId, token: seat.token, name: nameRef.current || 'Firefly' }, true);
    }, RETRY_DELAY_MS);
  }, []);

  // The server could not be reached: keep retrying quietly during a game, and say so
  // plainly on the home screen.
  const handleUnreachable = useCallback(() => {
    clearTimeout(openTimerRef.current);
    openTimerRef.current = null;
    if (inRoomRef.current && seatRef.current.room && seatRef.current.token) {
      setConnecting(false);
      setReconnecting(true);
      scheduleResume();
    } else {
      setConnecting(false);
      setReconnecting(false);
      setUnreachable(true);
      // The player sees a friendly message; this says which address actually failed.
      console.warn(`[Firefly Feast] Could not reach the game server at ${WS_URL}`);
    }
  }, [scheduleResume]);

  const connect = useCallback((command, payload = {}, silent = false) => {
    clearTimeout(retryTimerRef.current);
    retryTimerRef.current = null;
    clearTimeout(openTimerRef.current);
    openTimerRef.current = null;
    intentionalClose.current = false;
    lastAttemptRef.current = { command, payload };
    if (!silent) {
      setError('');
      setUnreachable(false);
      setConnecting(true);
    }
    const previous = wsRef.current;
    wsRef.current = null;
    try { previous?.close(); } catch {}
    let ws;
    try { ws = new WebSocket(WS_URL); } catch { handleUnreachable(); return; }
    wsRef.current = ws;
    openTimerRef.current = window.setTimeout(() => {
      openTimerRef.current = null;
      if (wsRef.current !== ws) return;
      wsRef.current = null;
      try { ws.close(); } catch {}
      handleUnreachable();
    }, CONNECT_TIMEOUT_MS);
    ws.onopen = () => {
      lastMessageRef.current = Date.now();
      ws.send(JSON.stringify({ type: command, ...payload }));
    };
    ws.onmessage = event => {
      clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
      lastMessageRef.current = Date.now();
      let msg;
      try { msg = JSON.parse(event.data); } catch { return; }
      if (msg.type === 'welcome') {
        seatRef.current = { playerId: msg.playerId, token: msg.token, room: msg.room };
        setMeId(msg.playerId);
        setConnecting(false);
        setReconnecting(false);
        setUnreachable(false);
        setError('');
        sessionStorage.setItem('ff-playerId', msg.playerId);
        sessionStorage.setItem('ff-token', msg.token);
        sessionStorage.setItem('ff-room', msg.room);
        setRoomInput(msg.room);
        history.replaceState(null, '', `${location.pathname}?room=${msg.room}`);
      } else if (msg.type === 'state') {
        const previousState = stateRef.current;
        stateRef.current = msg;
        inRoomRef.current = true;
        if (!viewRef.current) {
          setConnecting(false);
          setReconnecting(false);
          setUnreachable(false);
          commitView();
        } else {
          // Structural changes land immediately; score and timer ticks are throttled.
          const structural =
            viewRef.current.phase !== msg.phase ||
            viewRef.current.round !== msg.round ||
            rosterKey(viewRef.current) !== rosterKey(msg);
          if (structural) {
            setReconnecting(false);
            commitView();
          } else if (displayDigest(msg) !== digestRef.current && !commitTimerRef.current) {
            commitTimerRef.current = window.setTimeout(commitView, UI_COMMIT_MS);
          }
        }
        // Event toasts and sounds, unchanged in behaviour.
        if (previousState?.events && msg.events?.length) {
          const latest = msg.events[msg.events.length - 1];
          const oldLatest = previousState.events[previousState.events.length - 1];
          if (latest && latest.id !== oldLatest?.id) {
            showToast(latest.text);
            if (latest.text.includes('star')) sound('star');
            else if (latest.text.includes('booped') || latest.text.includes('splashed')) sound('hit');
            else if (latest.kind === 'collect') sound('collect');
          }
        }
      } else if (msg.type === 'error') {
        setConnecting(false);
        // A refused resume means the seat is gone for good, so stop retrying and go home
        // with the reason.
        if (lastAttemptRef.current?.command === 'resume') {
          clearTimeout(retryTimerRef.current);
          retryTimerRef.current = null;
          clearTimeout(commitTimerRef.current);
          commitTimerRef.current = null;
          intentionalClose.current = true;
          clearSeat();
          inRoomRef.current = false;
          stateRef.current = null;
          viewRef.current = null;
          digestRef.current = '';
          setReconnecting(false);
          setView(null);
          setMeId('');
        }
        setError(msg.message);
      }
    };
    ws.onerror = () => { if (wsRef.current === ws) handleUnreachable(); };
    ws.onclose = () => {
      if (wsRef.current !== ws) return;
      wsRef.current = null;
      clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
      if (intentionalClose.current) { setConnecting(false); return; }
      handleUnreachable();
    };
  }, [sound, handleUnreachable, clearSeat, commitView, showToast]);
  connectRef.current = connect;

  useEffect(() => {
    const seat = seatRef.current;
    const savedName = sessionStorage.getItem('ff-name');
    if (seat.room && seat.playerId && seat.token) {
      if (savedName) setName(savedName);
      connect('resume', { room: seat.room, playerId: seat.playerId, token: seat.token, name: savedName || 'Firefly' });
    }
    return () => {
      intentionalClose.current = true;
      clearTimeout(retryTimerRef.current);
      clearTimeout(openTimerRef.current);
      clearTimeout(commitTimerRef.current);
      clearTimeout(toastTimerRef.current);
      try { wsRef.current?.close(); } catch {}
    };
  // Connect once on mount to restore a seat after refresh.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A phone that loses Wi-Fi often leaves the socket open but silent, with no close
  // event, so watch for the snapshots going quiet and treat that as a dropped connection.
  useEffect(() => {
    const id = window.setInterval(() => {
      if (!inRoomRef.current) return;
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      if (Date.now() - lastMessageRef.current < STALE_AFTER_MS) return;
      wsRef.current = null;
      try { ws.close(); } catch {}
      handleUnreachable();
    }, 1000);
    return () => clearInterval(id);
  }, [handleUnreachable]);

  // Coming back onto Wi-Fi should not wait out the retry timer.
  useEffect(() => {
    const onOnline = () => {
      if (!inRoomRef.current || wsRef.current) return;
      const seat = seatRef.current;
      if (!seat.room || !seat.token) return;
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
      connectRef.current?.('resume', { room: seat.room, playerId: seat.playerId, token: seat.token, name: nameRef.current || 'Firefly' }, true);
    };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, []);

  const send = useCallback(data => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data));
  }, []);

  const createRoom = () => {
    if (!name.trim()) return setError('Add your name first so everyone knows it’s you.');
    sessionStorage.setItem('ff-name', name);
    connect('create', { name });
  };
  const joinRoom = () => {
    if (!name.trim()) return setError('Add your name first so everyone knows it’s you.');
    if (roomInput.trim().length !== 4) return setError('Enter the 4-letter room code.');
    sessionStorage.setItem('ff-name', name);
    connect('join', { room: roomInput.trim().toUpperCase(), name });
  };
  const tryAgain = () => {
    const last = lastAttemptRef.current;
    setUnreachable(false);
    if (!last) return;
    connect(last.command, { ...last.payload, name: nameRef.current || last.payload.name || 'Firefly' });
  };
  const leaveRoom = () => {
    intentionalClose.current = true;
    clearTimeout(retryTimerRef.current);
    retryTimerRef.current = null;
    clearTimeout(commitTimerRef.current);
    commitTimerRef.current = null;
    try { wsRef.current?.close(); } catch {}
    wsRef.current = null;
    clearSeat();
    inRoomRef.current = false;
    stateRef.current = null;
    viewRef.current = null;
    digestRef.current = '';
    setView(null);
    setMeId('');
    setReconnecting(false);
    setError('');
    history.replaceState(null, '', location.pathname);
  };
  const copyInvite = async () => {
    const url = `${location.origin}${location.pathname}?room=${view?.room || roomInput}`;
    try {
      await navigator.clipboard.writeText(url);
      showToast('Invite link copied!', 1800);
    } catch {
      showToast(url, 4500);
    }
  };
  const enterSound = () => {
    setSoundEnabled(true);
    try {
      if (!audioRef.current) {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (Ctx) audioRef.current = new Ctx();
      }
      audioRef.current?.resume();
    } catch {}
  };

  const roomControls = (
    <div className="topbar-actions">
      <button className="btn-icon" onClick={() => setShowRules(true)} aria-label="How to play" title="How to play">?</button>
      <button className="btn-icon" onClick={copyInvite} aria-label="Copy invite link" title="Copy invite link">⇗</button>
      <button
        className="btn-icon"
        onClick={() => { setMuted(!muted); enterSound(); }}
        aria-label={muted ? 'Unmute sound' : 'Mute sound'}
        title={muted ? 'Unmute sound' : 'Mute sound'}
      >
        {muted ? '🔇' : '🔊'}
      </button>
    </div>
  );

  /* ------------------------------------------------------------------ home ---------- */

  if (!view) {
    return (
      <main className={`screen screen-home ${calm ? 'is-calm' : ''}`}>
        <NightScene />
        <div className="home-inner">
          <header className="title-block">
            <Firefly color="#F6E96B" size={84} className="hero-fly" title="A glowing firefly" />
            <p className="kicker">A LITTLE NIGHTTIME ADVENTURE</p>
            <h1 className="game-title">
              Firefly <em>Feast</em>
            </h1>
            <p className="tagline">Glow, gather dewdrops, dodge the rain, and see who shines brightest.</p>
          </header>

          <section className="panel home-panel">
            <label className="field-label" htmlFor="player-name">Your name</label>
            <input
              id="player-name"
              className="field"
              value={name}
              maxLength={18}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Grandma Jo"
              autoComplete="nickname"
            />
            <button className="btn btn-primary btn-block" onClick={createRoom} disabled={connecting}>
              {connecting ? 'Connecting…' : <>Start a new game <span aria-hidden="true">✦</span></>}
            </button>

            <div className="divider"><span>or join your family</span></div>

            <div className="join-row">
              <input
                className="field field-code"
                aria-label="Room code"
                value={roomInput}
                maxLength={4}
                onChange={e => setRoomInput(e.target.value.toUpperCase().replace(/[^A-Z]/g, '').replace(/[IO]/g, ''))}
                placeholder="CODE"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck="false"
              />
              <button className="btn btn-ghost" onClick={joinRoom} disabled={connecting}>
                {connecting ? 'Connecting…' : 'Join'}
              </button>
            </div>

            {unreachable && (
              <div className="notice notice-warn" role="alert">
                <p>{UNREACHABLE_MESSAGE}</p>
                <button className="btn btn-ghost btn-block" onClick={tryAgain}>Try again ↻</button>
              </div>
            )}
            {error && <p className="field-error" role="alert">{error}</p>}

            <button className="link-button" onClick={() => setShowRules(true)}>How to play</button>
          </section>

          <p className="home-foot"><span aria-hidden="true">☾</span> No accounts. No downloads. Just play together.</p>
        </div>
        {showRules && <HowToPlayModal onClose={() => setShowRules(false)} />}
        {toast && <div className="toast" role="status">{toast}</div>}
      </main>
    );
  }

  /* ------------------------------------------------------------------ in a room ----- */

  const me = view.players.find(p => p.id === (view.me || meId));
  const host = !!me?.isHost;
  const playing = view.phase === 'countdown' || view.phase === 'playing';
  const results = view.phase === 'roundResults' || view.phase === 'matchResults';

  return (
    <main className={`screen screen-room ${playing ? 'is-playing' : ''} ${calm ? 'is-calm' : ''}`}>
      <header className="topbar">
        <div className="brand">
          <Firefly color={me?.color || '#65F6D0'} size={26} className="brand-fly" />
          <strong>Firefly Feast</strong>
        </div>
        <div className="topbar-right">
          <span className="room-chip">ROOM <b>{view.room}</b></span>
          {roomControls}
        </div>
      </header>

      {!playing && !results && (
        <section className="lobby">
          <div className="lobby-head">
            <div>
              <p className="kicker">YOUR NIGHT GARDEN</p>
              <h2 className="display">Gather your fireflies</h2>
              <p className="subcopy">Share the code and get everyone glowing.</p>
            </div>
            <button className="btn btn-quiet" onClick={leaveRoom}>← Leave</button>
          </div>

          <div className="lobby-grid">
            <div className="lobby-main">
              <div className="panel code-panel">
                <div className="code-text">
                  <span className="tiny-label">YOUR ROOM CODE</span>
                  <strong className="code-big">{view.room}</strong>
                  <span className="code-hint">Everyone types this, or just tap the link below.</span>
                </div>
                <button className="btn btn-ghost" onClick={copyInvite}>Copy invite link ⇗</button>
              </div>

              <div className="panel roster-panel">
                <div className="panel-head">
                  <strong>In the garden</strong>
                  <span>{view.players.length}/{LOBBY_SLOTS}</span>
                </div>
                <ul className="roster">
                  {view.players.map(p => (
                    <li className={`seat ${p.id === meId ? 'is-me' : ''} ${p.connected ? '' : 'is-away'}`} key={p.id}>
                      <Firefly color={p.color} size={44} className="seat-fly" />
                      <span className="seat-name">{p.name}</span>
                      <span className="seat-tags">
                        {p.id === meId && <em className="tag tag-you">YOU</em>}
                        {p.isHost && <em className="tag tag-host" title="Host">♛ HOST</em>}
                        {!p.connected && <em className="tag tag-away">AWAY</em>}
                      </span>
                    </li>
                  ))}
                  {Array.from({ length: Math.max(0, LOBBY_SLOTS - view.players.length) }).map((_, i) => (
                    <li className="seat seat-empty" key={`empty-${i}`}>
                      <span className="seat-slot" aria-hidden="true">✦</span>
                      <span className="seat-name">Waiting…</span>
                    </li>
                  ))}
                </ul>
              </div>

              {host ? (
                <button
                  className="btn btn-primary btn-block btn-start"
                  onClick={() => { enterSound(); send({ type: 'start' }); }}
                  disabled={view.players.filter(p => p.connected).length < 1}
                >
                  Start match <span aria-hidden="true">→</span>
                </button>
              ) : (
                <p className="waiting-note">✦ Waiting for the host to start…</p>
              )}
            </div>

            <aside className="panel rules-panel">
              <div className="modal-head">
                <div>
                  <p className="kicker">HOW TO PLAY</p>
                  <h3 className="display-sm">Ready, set, glow!</h3>
                </div>
              </div>
              <HowToPlay />
            </aside>
          </div>
        </section>
      )}

      {playing && (
        <section className="play">
          <div className="hud">
            <div className="hud-cell">
              <span className="tiny-label">ROUND</span>
              <strong>{view.round}<small>/3</small></strong>
            </div>
            <div className={`hud-cell hud-timer ${view.phase === 'playing' && view.deadline - view.serverNow < 10000 ? 'is-low' : ''}`}>
              <span className="tiny-label">{view.phase === 'countdown' ? 'STARTS IN' : 'TIME LEFT'}</span>
              <strong>
                {view.phase === 'countdown'
                  ? Math.max(1, Math.ceil((view.countdownEnd - view.serverNow) / 1000))
                  : formatTime(Math.max(0, view.deadline - view.serverNow))}
              </strong>
            </div>
            <div className="hud-cell hud-score">
              <span className="tiny-label">YOUR DEWDROPS</span>
              <strong key={me?.score ?? 0} className="score-pop">{me?.score ?? 0}<small aria-hidden="true"> ✦</small></strong>
            </div>
          </div>

          <GameCanvas stateRef={stateRef} meId={meId} send={send} calm={calm} />

          <div className="play-rail">
            <ol className="board">
              {[...view.players].sort((a, b) => b.score - a.score).map((p, i) => (
                <li className={`board-row ${p.id === meId ? 'is-me' : ''}`} key={p.id}>
                  <span className="board-rank">{i + 1}</span>
                  <span className="board-dot" style={{ background: p.color }} />
                  <span className="board-name">{p.name}</span>
                  <b>{p.score}</b>
                </li>
              ))}
            </ol>
            <button
              className={`dash-btn ${me?.dashReady ? 'is-ready' : 'is-cooling'}`}
              onPointerDown={e => { e.preventDefault(); send({ type: 'dash' }); enterSound(); }}
              aria-label="Dash"
            >
              <span className="dash-bolt" aria-hidden="true">⚡</span>
              <strong>DASH</strong>
              <small>{me?.dashReady ? 'READY' : '…'}</small>
            </button>
            <p className="hint">Drag the arena to fly · Space to dash</p>
          </div>
        </section>
      )}

      {results && (
        <ResultsScreen view={view} meId={meId} host={host} send={send} onLeave={leaveRoom} />
      )}

      {reconnecting && (
        <div className="reconnect" role="status">
          <span className="reconnect-dot" aria-hidden="true" />
          Reconnecting…
        </div>
      )}
      {showRules && <HowToPlayModal onClose={() => setShowRules(false)} />}
      {toast && <div className="toast" role="status">{toast}</div>}
      {error && (
        <div className="floating-error" role="alert">
          {error}
          <button onClick={() => setError('')} aria-label="Dismiss">✕</button>
        </div>
      )}
    </main>
  );
}

/* --------------------------------------------------------------------- results ------ */

function ResultsScreen({ view, meId, host, send, onLeave }) {
  const isMatch = view.phase === 'matchResults';
  const ranked = useMemo(
    () =>
      [...view.players].sort((a, b) =>
        isMatch ? b.matchPoints - a.matchPoints || b.totalScore - a.totalScore : b.score - a.score
      ),
    [view.players, isMatch]
  );

  // Match-point maths and tie-breaks are the server's; this only presents them.
  const tieNote = (() => {
    if (isMatch) {
      const tiedPoints = ranked.length > 1 && ranked[0].matchPoints === ranked[1].matchPoints;
      const tiedAll = tiedPoints && ranked[0].totalScore === ranked[1].totalScore;
      if (tiedAll) return 'It’s a tie! We have co-champions.';
      if (tiedPoints) return 'Match points were tied, so total dewdrops decided the champion.';
      return 'The brightest firefly wins the match!';
    }
    const top = Math.max(...view.players.map(p => p.score));
    if (view.players.length > 1 && view.players.filter(p => p.score === top).length > 1) {
      return 'It’s a tie! You share the medal.';
    }
    return null;
  })();

  return (
    <section className="results">
      <div className="panel results-panel">
        <div className="results-crown" aria-hidden="true">✦　✧　✦</div>
        <p className="kicker">{isMatch ? 'THE NIGHT GARDEN CHAMPIONS' : `ROUND ${view.round} OF 3 COMPLETE`}</p>
        <h2 className="display">{isMatch ? 'Who shone brightest?' : 'Look at you glow!'}</h2>
        <p className="subcopy">
          {isMatch ? 'Three rounds down. One very shiny champion.' : 'Here’s how this round shook out.'}
        </p>

        <ol className="result-list">
          {ranked.map((p, i, arr) => {
            const value = isMatch ? p.matchPoints : p.score;
            const tiedWithAbove =
              i > 0 &&
              value === (isMatch ? arr[i - 1].matchPoints : arr[i - 1].score) &&
              (!isMatch || p.totalScore === arr[i - 1].totalScore);
            const rank = isMatch ? (tiedWithAbove ? (i > 0 ? i : 1) : i + 1) : p.place || i + 1;
            const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}.`;
            return (
              <li className={`result-row ${rank === 1 ? 'is-winner' : ''}`} key={p.id}>
                <span className="result-medal" aria-hidden="true">{medal}</span>
                <Firefly color={p.color} size={38} className="result-fly" />
                <span className="result-name">
                  {p.name}
                  {p.id === meId && <em className="tag tag-you">YOU</em>}
                </span>
                <span className="result-value">
                  <b>{value}</b>
                  <small>{isMatch ? 'pts' : 'dew'}</small>
                  {isMatch && <i>{p.totalScore} dew total</i>}
                </span>
                {rank === 1 && <span className="winner-sparks" aria-hidden="true" />}
              </li>
            );
          })}
        </ol>

        {tieNote && <p className="tie-note">{tieNote}</p>}

        <div className="result-actions">
          {host && !isMatch && (
            <button className="btn btn-primary btn-block" onClick={() => send({ type: 'nextRound' })}>
              Next round <span aria-hidden="true">→</span>
            </button>
          )}
          {host && isMatch && (
            <button className="btn btn-primary btn-block" onClick={() => send({ type: 'playAgain' })}>
              Play again <span aria-hidden="true">↻</span>
            </button>
          )}
          {host && (
            <button className="btn btn-ghost btn-block" onClick={() => send({ type: 'backLobby' })}>
              Back to lobby
            </button>
          )}
          {!host && <p className="waiting-note">✦ Waiting for the host…</p>}
          <button className="btn btn-quiet btn-block" onClick={onLeave}>Leave game</button>
        </div>
      </div>
    </section>
  );
}

function formatTime(ms) {
  const seconds = Math.ceil(ms / 1000);
  return `0:${String(seconds).padStart(2, '0')}`;
}

createRoot(document.getElementById('root')).render(<App />);
