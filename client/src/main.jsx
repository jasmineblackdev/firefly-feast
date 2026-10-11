import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const WS_URL = (import.meta.env.VITE_WS_URL || `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`).replace(/\/$/, '');
const COLORS = ['#65F6D0','#FFB45E','#C5A4FF','#FF7FA8','#7ED7FF','#F6E96B','#A8F078','#FF927A'];

function App() {
  const [name, setName] = useState('');
  const [roomInput, setRoomInput] = useState(new URLSearchParams(location.search).get('room')?.toUpperCase() || '');
  const [room, setRoom] = useState(null);
  const [meId, setMeId] = useState(sessionStorage.getItem('ff-playerId') || '');
  const [resumeToken, setResumeToken] = useState(sessionStorage.getItem('ff-token') || '');
  const [error, setError] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [muted, setMuted] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [toast, setToast] = useState('');
  const wsRef = useRef(null);
  const stateRef = useRef(null);
  const audioRef = useRef(null);
  const reconnectRef = useRef(null);
  const intentionalClose = useRef(false);

  const sound = useCallback((kind) => {
    if (muted || !soundEnabled) return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      if (!audioRef.current) audioRef.current = new AudioContext();
      const ctx = audioRef.current;
      if (ctx.state === 'suspended') ctx.resume();
      const osc = ctx.createOscillator(); const gain = ctx.createGain();
      const now = ctx.currentTime;
      osc.type = kind === 'hit' ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(kind === 'star' ? 880 : kind === 'hit' ? 150 : 520, now);
      osc.frequency.exponentialRampToValueAtTime(kind === 'star' ? 1320 : kind === 'hit' ? 75 : 760, now + 0.12);
      gain.gain.setValueAtTime(0.0001, now); gain.gain.exponentialRampToValueAtTime(kind === 'hit' ? 0.12 : 0.07, now + 0.015); gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
      osc.connect(gain); gain.connect(ctx.destination); osc.start(now); osc.stop(now + 0.17);
    } catch {}
  }, [muted, soundEnabled]);

  const connect = useCallback((command, payload = {}) => {
    setError(''); setConnecting(true); intentionalClose.current = false;
    try { wsRef.current?.close(); } catch {}
    const ws = new WebSocket(WS_URL); wsRef.current = ws;
    ws.onopen = () => ws.send(JSON.stringify({ type: command, ...payload }));
    ws.onmessage = (event) => {
      let msg; try { msg = JSON.parse(event.data); } catch { return; }
      if (msg.type === 'welcome') {
        setMeId(msg.playerId); setResumeToken(msg.token); setConnecting(false);
        sessionStorage.setItem('ff-playerId', msg.playerId); sessionStorage.setItem('ff-token', msg.token); sessionStorage.setItem('ff-room', msg.room);
        setRoomInput(msg.room); history.replaceState(null, '', `${location.pathname}?room=${msg.room}`);
      } else if (msg.type === 'state') {
        const prev = stateRef.current; stateRef.current = msg; setRoom(msg);
        if (prev?.events && msg.events?.length) {
          const latest = msg.events[msg.events.length - 1]; const oldLatest = prev.events[prev.events.length - 1];
          if (latest && latest.id !== oldLatest?.id) {
            setToast(latest.text); window.setTimeout(() => setToast(''), 2200);
            if (latest.text.includes('star')) sound('star'); else if (latest.text.includes('booped') || latest.text.includes('splashed')) sound('hit'); else if (latest.kind === 'collect') sound('collect');
          }
        }
      } else if (msg.type === 'error') { setError(msg.message); setConnecting(false); }
    };
    ws.onerror = () => { setConnecting(false); };
    ws.onclose = () => {
      if (wsRef.current !== ws) return;
      wsRef.current = null;
      setConnecting(false);
      const savedRoom = sessionStorage.getItem('ff-room');
      if (!intentionalClose.current && meId && resumeToken && savedRoom && !reconnectRef.current) {
        reconnectRef.current = window.setTimeout(() => {
          reconnectRef.current = null;
          connect('resume', { room: savedRoom, playerId: meId, token: resumeToken, name: name || 'Firefly' });
        }, 1300);
      }
    };
  }, [meId, resumeToken, name, sound]);

  useEffect(() => {
    const savedRoom = sessionStorage.getItem('ff-room'); const savedId = sessionStorage.getItem('ff-playerId'); const savedToken = sessionStorage.getItem('ff-token'); const savedName = sessionStorage.getItem('ff-name');
    if (savedRoom && savedId && savedToken) { if (savedName) setName(savedName); connect('resume', { room: savedRoom, playerId: savedId, token: savedToken, name: savedName || 'Firefly' }); }
    return () => { intentionalClose.current = true; clearTimeout(reconnectRef.current); try { wsRef.current?.close(); } catch {} };
  // Connect once on mount to restore a seat after refresh.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const send = useCallback((data) => { const ws = wsRef.current; if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data)); }, []);
  const createRoom = () => { if (!name.trim()) return setError('Add your name first so everyone knows it’s you.'); sessionStorage.setItem('ff-name', name); connect('create', { name }); };
  const joinRoom = () => { if (!name.trim()) return setError('Add your name first so everyone knows it’s you.'); if (roomInput.trim().length !== 4) return setError('Enter the 4-letter room code.'); sessionStorage.setItem('ff-name', name); connect('join', { room: roomInput.trim().toUpperCase(), name }); };
  const copyInvite = async () => {
    const url = `${location.origin}${location.pathname}?room=${room?.room || roomInput}`;
    try { await navigator.clipboard.writeText(url); setToast('Invite link copied!'); window.setTimeout(() => setToast(''), 1800); }
    catch { setToast(url); window.setTimeout(() => setToast(''), 4500); }
  };
  const enterSound = () => { setSoundEnabled(true); try { if (!audioRef.current) { const Ctx = window.AudioContext || window.webkitAudioContext; if (Ctx) audioRef.current = new Ctx(); } audioRef.current?.resume(); } catch {} };

  if (!room) return <main className="home-shell">
    <div className="home-sky"><span>✦</span><span>·</span><span>✧</span><span>·</span><span>✦</span><span>✧</span></div>
    <section className="home-card">
      <div className="brand-firefly" aria-hidden="true"><span className="wing wing-left"/><span className="wing wing-right"/><span className="firefly-body"/><span className="glow"/></div>
      <p className="eyebrow">A LITTLE NIGHTTIME ADVENTURE</p><h1>Firefly <em>Feast</em></h1>
      <p className="intro">Glow, gather dewdrops, dodge the rain, and see who shines brightest.</p>
      <label className="field-label" htmlFor="player-name">Your name</label>
      <input id="player-name" value={name} maxLength={18} onChange={e => setName(e.target.value)} placeholder="e.g. Grandma Jo" autoComplete="nickname" />
      <button className="primary-button" onClick={createRoom} disabled={connecting}>{connecting ? 'Connecting…' : '✦  Start a new game'}</button>
      <div className="or-divider"><span/>or join your family<span/></div>
      <div className="join-row"><input aria-label="Room code" value={roomInput} maxLength={4} onChange={e => setRoomInput(e.target.value.toUpperCase().replace(/[^A-Z]/g, '').replace(/[IO]/g, ''))} placeholder="ROOM CODE"/><button className="join-button" onClick={joinRoom} disabled={connecting}>Join ↗</button></div>
      {error && <p className="error-message" role="alert">{error}</p>}
      <p className="privacy-note"><span>☾</span> No accounts. No downloads. Just play together.</p>
    </section>
    <div className="home-ground"><span>♧</span><span>♣</span><span>♧</span><span>♣</span><span>♧</span></div>
  </main>;

  const me = room.players.find(p => p.id === (room.me || meId));
  const host = me?.isHost;
  const active = ['countdown', 'playing'].includes(room.phase);
  const results = ['roundResults', 'matchResults'].includes(room.phase);
  return <main className={`game-shell ${active ? 'in-game' : ''}`}>
    <header className="game-header"><div className="mini-brand"><span className="mini-glow">✦</span><strong>Firefly Feast</strong></div><div className="header-actions"><span className="room-pill">ROOM <b>{room.room}</b></span><button className="icon-button" onClick={copyInvite} aria-label="Copy invite link" title="Copy invite link">↗</button><button className="icon-button" onClick={() => { setMuted(!muted); enterSound(); }} aria-label={muted ? 'Unmute sound' : 'Mute sound'} title={muted ? 'Unmute sound' : 'Mute sound'}>{muted ? '🔇' : '🔊'}</button></div></header>
    {!active && !results && <section className="lobby-layout">
      <div className="lobby-main"><div className="section-kicker">YOUR NIGHT GARDEN</div><h2>Gather your fireflies</h2><p className="subcopy">Share the room code and get everyone glowing.</p>
        <div className="room-code-card"><div><span className="tiny-label">YOUR ROOM CODE</span><strong className="big-code">{room.room}</strong><span className="code-hint">Tap the arrow above to copy your invite link</span></div><button className="copy-button" onClick={copyInvite}>Copy invite link ↗</button></div>
        <div className="player-list-card"><div className="card-heading"><strong>In the garden</strong><span>{room.players.length}/8 players</span></div>
          {room.players.map((p, i) => <div className="player-row" key={p.id}><span className="player-dot" style={{'--player-color':p.color}}><i/></span><span className="player-name">{p.name}{p.id === meId ? <small>YOU</small> : null}{!p.connected ? <small className="away-tag">AWAY</small> : null}</span>{p.isHost && <span className="host-crown" title="Host">♛</span>}</div>)}
          {room.players.length < 8 && <div className="waiting-row"><span className="plus-dot">＋</span><span>Waiting for more fireflies…</span></div>}
        </div>
        {host ? <button className="primary-button start-button" onClick={() => { enterSound(); send({type:'start'}); }} disabled={room.players.filter(p => p.connected).length < 1}>Start match <span>→</span></button> : <div className="waiting-host">✦ Waiting for host to start…</div>}
      </div>
      <aside className="rules-card"><div className="rules-title"><span>✧</span><div><p className="section-kicker">HOW TO PLAY</p><h3>Ready, set, glow!</h3></div></div>
        <div className="rule"><span className="rule-icon move-icon">↕</span><div><b>Fly around</b><p>Drag anywhere in the arena to steer. On a keyboard, use <kbd>WASD</kbd> or <kbd>↑↓←→</kbd>.</p></div></div>
        <div className="rule"><span className="rule-icon dew-icon">✦</span><div><b>Collect dewdrops</b><p>Each dewdrop is <strong>+1 point</strong>. They keep coming back!</p></div></div>
        <div className="rule"><span className="rule-icon star-icon">★</span><div><b>Chase golden stars</b><p>Stars are worth <strong>+5</strong>, appear about every 7 seconds, and fade after 6.</p></div></div>
        <div className="rule"><span className="rule-icon rain-icon">☂</span><div><b>Watch for rain</b><p>Rain gets faster and more frequent. A splash knocks you back and spills up to 2 dewdrops. You blink while protected for 1.5 seconds.</p></div></div>
        <div className="rule"><span className="rule-icon dash-icon">⚡</span><div><b>Dash & boop</b><p>Tap <strong>DASH</strong> or press <kbd>Space</kbd> for a speed burst. Boop another firefly to knock them back and spill 2 dewdrops. Rain can't hit you mid-dash.</p></div></div>
        <div className="match-note"><span>🏆</span><p><b>3 rounds · 60 seconds each</b><br/>Earn match points: 1st = 3, 2nd = 2, 3rd = 1. Most match points wins! Total dewdrops break a match-point tie.</p></div>
      </aside>
    </section>}
    {active && <section className="play-layout"><div className="arena-column"><div className="arena-topline"><span className="live-dot"/> {room.phase === 'countdown' ? 'GET READY' : `ROUND ${room.round} OF 3`}<span className="arena-tip">✧ Stay glowy</span></div><GameCanvas state={room} meId={meId} send={send}/></div>
      <aside className="play-panel"><div className="timer-card"><span>{room.phase === 'countdown' ? 'ROUND STARTS IN' : 'TIME LEFT'}</span><strong>{room.phase === 'countdown' ? Math.max(1, Math.ceil((room.countdownEnd - Date.now()) / 1000)) : formatTime(Math.max(0, room.deadline - Date.now()))}</strong><small>Round {room.round} / 3</small></div>
        <div className="my-score-card"><span>YOUR DEWDROPS</span><strong>{me?.score ?? 0}<small> ✦</small></strong><div className="match-points">Match points: <b>{me?.matchPoints ?? 0}</b></div></div>
        <div className="scoreboard"><div className="scoreboard-title">LEADERBOARD <span>✧</span></div>{[...room.players].sort((a,b)=>b.score-a.score).map((p,i)=><div className={`score-row ${p.id === meId ? 'is-me' : ''}`} key={p.id}><span className="score-rank">{i===0?'①':i===1?'②':i===2?'③':i+1}</span><span className="score-color" style={{background:p.color}}/><span className="score-name">{p.name}{p.id===meId?' · You':''}</span><b>{p.score}</b></div>)}</div>
        <button className={`dash-button ${me?.dashReady ? 'ready' : 'cooldown'}`} onPointerDown={e => { e.preventDefault(); send({type:'dash'}); enterSound(); }}><span>⚡</span><strong>DASH</strong><small>{me?.dashReady ? 'READY!' : 'RECHARGING'}</small></button><p className="control-hint">Drag the arena to fly · Space to dash</p>
      </aside></section>}
    {results && <section className="results-wrap"><div className="results-card"><div className="results-sparkle">✦　✧　✦</div><p className="section-kicker">{room.phase === 'matchResults' ? 'THE NIGHT GARDEN CHAMPIONS' : `ROUND ${room.round} COMPLETE`}</p><h2>{room.phase === 'matchResults' ? 'Who shines brightest?' : 'Look at you glow!'}</h2><p className="subcopy">{room.phase === 'matchResults' ? 'Three rounds down. One very shiny champion.' : 'Here’s how this round shook out.'}</p>
        <div className="results-list">{[...room.players].sort((a,b)=> (room.phase === 'matchResults' ? b.matchPoints-a.matchPoints || b.totalScore-a.totalScore : b.score-a.score)).map((p,i,arr)=>{const score=room.phase==='matchResults'?p.matchPoints:p.score;const tied= i>0 && score===(room.phase==='matchResults'?arr[i-1].matchPoints:arr[i-1].score) && (room.phase==='roundResults' || p.totalScore===arr[i-1].totalScore);const rank=room.phase==='roundResults'?(p.place||i+1):(tied?(i>0?i:1):i+1);const medal=rank===1?'🥇':rank===2?'🥈':rank===3?'🥉':`${rank}.`;return <div className={`result-row ${rank===1?'first-place':''}`} key={p.id}><span className="medal">{medal}</span><span className="result-dot" style={{background:p.color}}/><span className="result-name">{p.name}{p.id===meId?' (You)':''}</span><span className="result-score">{score} <small>{room.phase==='matchResults'?'pts':'dew'}</small></span></div>})}</div>
        {room.phase==='roundResults' && room.players.length > 1 && room.players.filter(p=>p.score === Math.max(...room.players.map(q=>q.score))).length > 1 && <div className="tie-note">It’s a tie! You share the medal.</div>}
        {room.phase==='matchResults' && <div className="tie-note">{(() => { const sorted=[...room.players].sort((a,b)=>b.matchPoints-a.matchPoints||b.totalScore-a.totalScore); const tied=sorted.length>1&&sorted[0].matchPoints===sorted[1].matchPoints&&sorted[0].totalScore===sorted[1].totalScore; return tied ? 'It’s a tie! We have co-champions.' : sorted.length>1&&sorted[0].matchPoints===sorted[1].matchPoints ? 'Match points tied! Total dewdrops decided the champion.' : 'The brightest firefly wins the match!'; })()}</div>}
        <div className="result-actions">{host && room.phase==='roundResults' && <button className="primary-button" onClick={() => send({type:'nextRound'})}>Next round <span>→</span></button>}{host && room.phase==='matchResults' && <button className="primary-button" onClick={() => send({type:'playAgain'})}>Play again <span>↻</span></button>}{host && <button className="secondary-button" onClick={() => send({type:'backLobby'})}>Back to lobby</button>}{!host && <p className="waiting-host">✦ Waiting for host…</p>}</div>
      </div></section>}
    {toast && <div className="toast" role="status">{toast}</div>}
    {error && <div className="floating-error" role="alert">{error}<button onClick={() => setError('')}>×</button></div>}
  </main>;
}

function formatTime(ms) { const seconds = Math.ceil(ms / 1000); return `0:${String(seconds).padStart(2,'0')}`; }

function GameCanvas({ state, meId, send }) {
  const latestState = useRef(state); latestState.current = state;
  const canvasRef = useRef(null); const inputRef = useRef({x:0,y:0}); const pointerRef = useRef(null); const rafRef = useRef(null); const lastSend = useRef(0);
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return; const ctx = canvas.getContext('2d'); let alive = true;
    const resize = () => { const rect = canvas.getBoundingClientRect(); const dpr = Math.min(window.devicePixelRatio || 1, 2); canvas.width = Math.round(rect.width*dpr); canvas.height = Math.round(rect.height*dpr); ctx.setTransform(dpr,0,0,dpr,0,0); };
    resize(); const ro = new ResizeObserver(resize); ro.observe(canvas);
    const draw = (time) => {
      if (!alive) return; const currentState = latestState.current; const w = canvas.clientWidth, h = canvas.clientHeight; const s = Math.min(w,h); const ox=(w-s)/2, oy=(h-s)/2; const sc=s/1000;
      ctx.clearRect(0,0,w,h); ctx.fillStyle='#07152d'; ctx.fillRect(0,0,w,h);
      ctx.save(); ctx.translate(ox,oy); ctx.scale(sc,sc);
      const grad=ctx.createRadialGradient(500,400,50,500,500,700); grad.addColorStop(0,'#15395a'); grad.addColorStop(1,'#08142b'); ctx.fillStyle=grad; ctx.fillRect(0,0,1000,1000);
      // still night sky stars
      for(let i=0;i<70;i++){const x=(i*197+37)%1000,y=(i*331+83)%1000;ctx.globalAlpha=0.18+((i%4)*0.12);ctx.fillStyle='#d9f9ff';ctx.beginPath();ctx.arc(x,y,(i%3)+1,0,Math.PI*2);ctx.fill();} ctx.globalAlpha=1;
      // edge grass
      for(let i=0;i<75;i++){const x=(i*137)%1000;const y=i%2?8:992;ctx.strokeStyle=i%2?'#2a826c':'#327e6a';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(x,y);ctx.quadraticCurveTo(x-15,y+(i%2?15:-15),x-8,y+(i%2?26:-26));ctx.stroke();}
      // lily pads
      for(let i=0;i<9;i++){const x=(i*241+120)%920+40,y=(i*173+140)%880+60;ctx.fillStyle=i%2?'#164d50':'#1c5a54';ctx.beginPath();ctx.ellipse(x,y,34+(i%3)*7,20+(i%2)*6,((i%5)-2)*.2,0.4,Math.PI*2-0.35);ctx.lineTo(x,y);ctx.closePath();ctx.fill();ctx.strokeStyle='#347d6b';ctx.lineWidth=2;ctx.stroke();}
      // dewdrops
      for(const d of currentState.dewdrops||[]){ctx.save();ctx.shadowBlur=17;ctx.shadowColor=d.dropped?'#ffb75e':'#6df6d5';ctx.fillStyle=d.dropped?'#ffbf70':'#8bffe0';ctx.beginPath();ctx.arc(d.x,d.y,d.r||9,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;ctx.fillStyle='#fff';ctx.globalAlpha=.8;ctx.beginPath();ctx.arc(d.x-3,d.y-3,2.5,0,Math.PI*2);ctx.fill();ctx.restore();ctx.globalAlpha=1;}
      // golden star blink on last second
      const star=currentState.star; if(star){const remain=star.expiresAt-currentState.serverNow;ctx.save();ctx.translate(star.x,star.y);ctx.rotate(time/700);ctx.globalAlpha=remain<1000&&Math.floor(time/110)%2===0?.22:1;ctx.shadowBlur=28;ctx.shadowColor='#ffda65';ctx.fillStyle='#ffdf70';ctx.beginPath();for(let i=0;i<10;i++){const a=-Math.PI/2+i*Math.PI/5,r=i%2?12:25;ctx.lineTo(Math.cos(a)*r,Math.sin(a)*r);}ctx.closePath();ctx.fill();ctx.shadowBlur=0;ctx.restore();ctx.globalAlpha=1;}
      // raindrops
      for(const r of currentState.rain||[]){ctx.strokeStyle='#7fc9ff';ctx.lineWidth=4;ctx.lineCap='round';ctx.globalAlpha=.8;ctx.beginPath();ctx.moveTo(r.x,r.y-10);ctx.lineTo(r.x-5,r.y+8);ctx.stroke();}ctx.globalAlpha=1;
      // fireflies
      for(const p of currentState.players||[]){if(!p.connected) continue;const blink=p.invulnerable&&Math.floor(time/100)%2===0;ctx.save();ctx.translate(p.x,p.y);if(blink)ctx.globalAlpha=.36;
        ctx.shadowBlur=p.dashing?36:24;ctx.shadowColor=p.color;ctx.fillStyle=p.color;
        // flapping wings
        const flap=Math.sin(time/55+(p.x/40))*0.55;ctx.globalAlpha*=0.82;ctx.beginPath();ctx.ellipse(-10,-7,10,6+flap*3,-.6,0,Math.PI*2);ctx.ellipse(10,-7,10,6-flap*3,.6,0,Math.PI*2);ctx.fill();ctx.globalAlpha=blink?.36:1;
        ctx.beginPath();ctx.ellipse(0,1,9,14,0,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;ctx.fillStyle='#092238';ctx.beginPath();ctx.arc(-3,-3,1.7,0,Math.PI*2);ctx.arc(3,-3,1.7,0,Math.PI*2);ctx.fill();ctx.fillStyle='#fff3b0';ctx.globalAlpha=.85;ctx.beginPath();ctx.ellipse(0,6,4,5,0,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;
        if(p.id===meId){ctx.setLineDash([7,7]);ctx.strokeStyle='#fff';ctx.lineWidth=3;ctx.beginPath();ctx.arc(0,0,25,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);}
        ctx.font='bold 19px system-ui';ctx.textAlign='center';ctx.textBaseline='bottom';const label=p.id===meId?'You':p.name;const tw=ctx.measureText(label).width;ctx.fillStyle='rgba(3,12,28,.76)';roundRect(ctx,-tw/2-9,-48,tw+18,25,9);ctx.fill();ctx.fillStyle='#f3fbff';ctx.fillText(label,0,-28);
        ctx.restore();
      }
      // joystick indicator while dragging
      if(pointerRef.current){const a=pointerRef.current;ctx.globalAlpha=.45;ctx.strokeStyle='#d6fff8';ctx.lineWidth=3;ctx.beginPath();ctx.arc(a.startX,a.startY,48,0,Math.PI*2);ctx.stroke();ctx.fillStyle='#d6fff8';ctx.beginPath();ctx.arc(a.startX+a.dx*36,a.startY+a.dy*36,17,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;}
      ctx.restore();
      rafRef.current=requestAnimationFrame(draw);
    };
    rafRef.current=requestAnimationFrame(draw);
    return()=>{alive=false;cancelAnimationFrame(rafRef.current);ro.disconnect();};
  },[meId]);
  useEffect(()=>{const id=window.setInterval(()=>send({type:'input',...inputRef.current}),100);return()=>clearInterval(id);},[send]);
  useEffect(()=>{const down=e=>{if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','w','a','s','d','W','A','S','D',' '].includes(e.key)){if(e.key===' '){e.preventDefault();send({type:'dash'});return;}e.preventDefault();const keys=keysRef.current;keys.add(e.key.toLowerCase());updateKeys();}};const up=e=>{keysRef.current.delete(e.key.toLowerCase());updateKeys();};function updateKeys(){const k=keysRef.current;let x=(k.has('d')||k.has('arrowright')?1:0)-(k.has('a')||k.has('arrowleft')?1:0);let y=(k.has('s')||k.has('arrowdown')?1:0)-(k.has('w')||k.has('arrowup')?1:0);const l=Math.hypot(x,y)||1;inputRef.current={x:x/l,y:y/l};}const keysRef=window.__fireflyKeys||(window.__fireflyKeys=new Set());window.addEventListener('keydown',down,{passive:false});window.addEventListener('keyup',up);return()=>{window.removeEventListener('keydown',down);window.removeEventListener('keyup',up);};},[send]);
  const point = e => { const rect=canvasRef.current.getBoundingClientRect();const s=Math.min(rect.width,rect.height);const ox=(rect.width-s)/2,oy=(rect.height-s)/2;return {x:(e.clientX-rect.left-ox)*1000/s,y:(e.clientY-rect.top-oy)*1000/s};};
  const start = e => { if(e.pointerType==='mouse'&&e.button!==0)return; e.preventDefault();canvasRef.current.setPointerCapture?.(e.pointerId);const pt=point(e);pointerRef.current={startX:pt.x,startY:pt.y,dx:0,dy:0,id:e.pointerId};inputRef.current={x:0,y:0};};
  const move = e => {if(!pointerRef.current||pointerRef.current.id!==e.pointerId)return;e.preventDefault();const pt=point(e),a=pointerRef.current;let dx=pt.x-a.startX,dy=pt.y-a.startY;const len=Math.hypot(dx,dy),max=100;if(len>max){dx=dx/len*max;dy=dy/len*max;}a.dx=dx/max;a.dy=dy/max;inputRef.current={x:a.dx,y:a.dy};};
  const end = e => {if(pointerRef.current&&pointerRef.current.id===e.pointerId){pointerRef.current=null;inputRef.current={x:0,y:0};send({type:'input',x:0,y:0});}};
  return <div className="arena-wrap"><canvas ref={canvasRef} className="arena-canvas" aria-label="Game arena. Drag to steer your firefly." onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onContextMenu={e=>e.preventDefault()}/>{state.phase==='countdown'&&<div className="countdown-overlay"><span>{Math.max(1,Math.ceil((state.countdownEnd-Date.now())/1000))}</span><small>GET READY!</small></div>}</div>;
}
function roundRect(ctx,x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();}

createRoot(document.getElementById('root')).render(<App/>);
