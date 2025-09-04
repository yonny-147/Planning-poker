import React, { useEffect, useMemo, useRef, useState } from 'react';
import io from 'socket.io-client';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:4000';

const DECKS = {
  'Fibonacci': ['0','1','2','3','5','8','13','20','40','100','?','☕'],
  'Powers of 2': ['0','1','2','4','8','16','32','64','?','☕'],
  'T‑Shirt': ['XS','S','M','L','XL','?','☕'],
  'Personalizado': ['1','2','3','5','8','13','?','☕']
};

export default function App(){
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const [roomId, setRoomId] = useState(new URLSearchParams(location.search).get('room') || '');
  const [me, setMe] = useState({ name: '', role: 'Miembro' });

  const [state, setState] = useState(null);

  useEffect(() => {
    const s = io(SERVER_URL, { transports: ['websocket'] });
    setSocket(s);
    s.on('connect', () => setConnected(true));
    s.on('disconnect', () => setConnected(false));
    s.on('room:state', (st) => setState(st));
    s.on('room:error', (msg) => alert(msg));
    return () => s.disconnect();
  }, []);

  async function createRoom(){
    const res = await fetch(`${SERVER_URL}/api/rooms`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({}) });
    const data = await res.json();
    setRoomId(data.id);
    const url = new URL(location.href);
    url.searchParams.set('room', data.id);
    history.replaceState({}, '', url);
  }

  function join(){
    if (!roomId) return alert('Ingresa el código de la sala');
    socket.emit('room:join', { roomId, name: me.name || 'Anónimo', role: me.role });
  }

  const deckValues = useMemo(() => {
    if (!state) return [];
    if (state.deckName !== 'Personalizado') return DECKS[state.deckName];
    return state.customDeck.split(',').map(s => s.trim()).filter(Boolean);
  }, [state]);

  function addStory(title){
    socket.emit('story:add', { roomId, title });
  }

  return (
    <div style={{fontFamily:'Inter, system-ui, Arial', color:'#e5e7eb', background:'#0f172a', minHeight:'100vh'}}>
      <div style={{maxWidth:1200, margin:'0 auto', padding:'24px'}}>
        <h1 style={{fontSize:32, fontWeight:800, marginBottom:8}}>Planning Poker – Realtime</h1>
        <p style={{color:'#94a3b8', marginBottom:16}}>Comparte el código de sala para que tu equipo se una.</p>

        {/* Connect/Create/Join */}
        <div style={{display:'flex', gap:12, flexWrap:'wrap', marginBottom:24, alignItems:'center'}}>
          <span style={{fontSize:12, color: connected ? '#34d399' : '#f87171'}}>{connected ? 'Conectado' : 'Desconectado'}</span>
          <button onClick={createRoom} style={btn('indigo')}>Crear sala</button>
          <input placeholder="Código de sala" value={roomId} onChange={e=>setRoomId(e.target.value)} style={input()} />
          <input placeholder="Tu nombre" value={me.name} onChange={e=>setMe({...me, name:e.target.value})} style={input(200)} />
          <select value={me.role} onChange={e=>setMe({...me, role:e.target.value})} style={select()}>
            <option>Miembro</option>
            <option>Facilitador</option>
          </select>
          <button onClick={join} style={btn('emerald')}>Unirme</button>
          {state?.id && <span style={{fontSize:12, color:'#94a3b8'}}>Sala: <code>{state.id}</code></span>}
        </div>

        {state && (
          <>
            <TopBar state={state} roomId={roomId} socket={socket} deckValues={deckValues} />
            <div style={{display:'grid', gap:16, gridTemplateColumns:'1fr 2fr'}}>
              <Stories state={state} roomId={roomId} socket={socket} addStory={addStory} />
              <RightSide state={state} roomId={roomId} socket={socket} deckValues={deckValues} meId={socket?.id} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function TopBar({ state, roomId, socket, deckValues }){
  const [custom, setCustom] = useState(state.customDeck);
  useEffect(()=>setCustom(state.customDeck), [state.customDeck]);

  return (
    <div style={card()}>
      <div style={{display:'flex', gap:12, alignItems:'center', justifyContent:'space-between', flexWrap:'wrap'}}>
        <div>
          <div style={{fontWeight:600}}>Deck</div>
          <select value={state.deckName} onChange={e=>socket.emit('deck:set', {roomId, deckName:e.target.value})} style={select()}>
            {Object.keys(DECKS).map(d => <option key={d}>{d}</option>)}
          </select>
          {state.deckName === 'Personalizado' && (
            <>
              <input value={custom} onChange={e=>setCustom(e.target.value)} placeholder="1,2,3,5,8,13,?,☕" style={input(300)} />
              <button onClick={()=>socket.emit('deck:setCustom', {roomId, customDeck:custom})} style={btn('indigo')}>Guardar</button>
            </>
          )}
        </div>
        <div style={{display:'flex', gap:6, flexWrap:'wrap'}}>
          {deckValues.map(v => <span key={v} style={chip()}>{v}</span>)}
        </div>
        <Timer state={state} roomId={roomId} socket={socket} />
      </div>
    </div>
  );
}

function Stories({ state, roomId, socket, addStory }){
  const [title, setTitle] = useState('');
  return (
    <div style={card()}>
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8}}>
        <div style={{fontWeight:600}}>Historias</div>
      </div>

      <div style={{display:'flex', gap:8, marginBottom:12}}>
        <input value={title} onChange={e=>setTitle(e.target.value)} onKeyDown={e=>{ if(e.key==='Enter'&&title.trim()){ addStory(title.trim()); setTitle(''); } }} placeholder="CT-1456 – Checkout carrito" style={{...input(), flex:1}} />
        <button onClick={()=>{ if (!title.trim()) return; addStory(title.trim()); setTitle(''); }} style={btn('indigo')}>Añadir</button>
      </div>

      <div style={{display:'grid', gap:8, maxHeight:360, overflow:'auto'}}>
        {state.stories.length===0 && <div style={{color:'#94a3b8', fontSize:12}}>Sin historias. Agrega una para empezar.</div>}
        {state.stories.map(s => (
          <div key={s.id} style={{...cardInner(), borderColor: s.id===state.currentStoryId? '#6366f1':'#1f2937'}}>
            <button onClick={()=>socket.emit('story:setCurrent', {roomId, id:s.id})} style={{textAlign:'left', flex:1}}>
              <div style={{fontWeight:600}}>{s.title}</div>
              <div style={{fontSize:12, color:'#94a3b8'}}>{s.notes}</div>
              {s.finalEstimate && <div style={{marginTop:4, fontSize:12, color:'#34d399'}}>Estimación final: {s.finalEstimate}</div>}
            </button>
            <div style={{display:'flex', gap:6}}>
              <button onClick={()=>{
                const v = prompt('Notas/Contexto de la historia:', s.notes || '');
                if (v !== null) socket.emit('story:update', {roomId, id:s.id, patch:{notes:v}});
              }} style={tinyBtn()}>Notas</button>
              <button onClick={()=>socket.emit('story:remove', {roomId, id:s.id})} style={tinyBtn('red')}>Eliminar</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RightSide({ state, roomId, socket, deckValues, meId }){
  return (
    <div style={{display:'grid', gap:16}}>
      <Participants state={state} />
      <Voting state={state} roomId={roomId} socket={socket} deckValues={deckValues} meId={meId} />
    </div>
  );
}

function Participants({ state }){
  return (
    <div style={card()}>
      <div style={{fontWeight:600, marginBottom:8}}>Participantes</div>
      <div style={{display:'grid', gap:8, gridTemplateColumns:'repeat(auto-fill, minmax(200px, 1fr))'}}>
        {state.participants.map(p => (
          <div key={p.id} style={cardInner()}>
            <div>
              <div style={{fontWeight:600}}>{p.name}</div>
              <div style={{fontSize:12, color:'#94a3b8'}}>{p.role}</div>
            </div>
            <span style={{fontSize:12, color:'#94a3b8'}}>{p.id.slice(0,6)}…</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Voting({ state, roomId, socket, deckValues, meId }){
  const [pickerOpen, setPickerOpen] = useState(false);

  function cast(v){
    socket.emit('vote:cast', { roomId, participantId: meId, value: v });
    setPickerOpen(false);
  }

  const everyoneCount = state.participants.length;
  const votesCount = Object.keys(state.votes).length;

  return (
    <div style={card()}>
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
        <div style={{fontWeight:600}}>Votación</div>
        <div style={{fontSize:12, color:'#94a3b8'}}>Votos: {votesCount}/{everyoneCount}</div>
      </div>

      <div style={{display:'flex', gap:8, marginTop:8, marginBottom:12}}>
        <button onClick={()=>setPickerOpen(true)} style={btn('slate')}>Elegir carta</button>
        <button onClick={()=>socket.emit('round:reveal', {roomId})} style={btn('emerald')}>Revelar</button>
        <button onClick={()=>socket.emit('round:reset', {roomId})} style={btn('slate')}>Nueva ronda</button>
      </div>

      <div style={{display:'grid', gap:8, gridTemplateColumns:'repeat(auto-fill, minmax(160px, 1fr))'}}>
        {Object.entries(state.votes).map(([pid, v]) => (
          <div key={pid} style={cardInner()}>
            <span style={{fontSize:12, color:'#94a3b8'}}>{pid.slice(0,6)}…</span>
            <span style={{fontSize:18, fontWeight:700}}>{v}</span>
          </div>
        ))}
      </div>

      {state.revealed && (
        <FinalEstimate state={state} roomId={roomId} socket={socket} />
      )}

      {pickerOpen && (
        <div style={modalBack()} onClick={()=>setPickerOpen(false)}>
          <div style={modal()} onClick={e=>e.stopPropagation()}>
            <div style={{fontWeight:700, marginBottom:12}}>Selecciona tu carta</div>
            <div style={{display:'grid', gap:8, gridTemplateColumns:'repeat(auto-fill, minmax(80px, 1fr))'}}>
              {deckValues.map(v => (
                <button key={v} onClick={()=>cast(v)} style={cardButton()}>{v}</button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FinalEstimate({ state, roomId, socket }){
  const [value, setValue] = useState(state.stories.find(s=>s.id===state.currentStoryId)?.finalEstimate || '');
  useEffect(()=>{
    setValue(state.stories.find(s=>s.id===state.currentStoryId)?.finalEstimate || '');
  }, [state.currentStoryId, state.stories]);
  return (
    <div style={{marginTop:12, display:'flex', gap:8, alignItems:'center'}}>
      <span style={{fontSize:12, color:'#94a3b8'}}>Fijar estimación para la historia actual:</span>
      <input value={value} onChange={e=>setValue(e.target.value)} placeholder="Ej. 5" style={input(120)} />
      <button onClick={()=>socket.emit('round:setFinal', {roomId, value})} style={btn('indigo')}>Guardar</button>
    </div>
  );
}

function Timer({ state, roomId, socket }){
  const t = state.timer;
  return (
    <div style={{display:'flex', gap:8, alignItems:'center'}}>
      <button onClick={()=> socket.emit(t.running ? 'timer:stop':'timer:start', {roomId})} style={btn(t.running ? 'emerald':'slate')}>
        ⏱️ {fmtTime(t.seconds)} {t.running ? 'Detener':'Iniciar'}
      </button>
    </div>
  );
}

function fmtTime(s){
  const m = Math.floor(s/60);
  const r = s%60;
  return String(m).padStart(2,'0')+':'+String(r).padStart(2,'0');
}

/* --- tiny UI helpers --- */
function card(){ return { background:'#0b1220', border:'1px solid #1f2937', borderRadius:16, padding:16, marginBottom:16 }; }
function cardInner(){ return { background:'#0b1220', border:'1px solid #1f2937', borderRadius:14, padding:12, display:'flex', alignItems:'center', justifyContent:'space-between' }; }
function input(w=240){ return { background:'#0b1220', border:'1px solid #1f2937', borderRadius:12, padding:'8px 10px', color:'#e5e7eb', width:w }; }
function select(){ return { ...input(160) }; }
function btn(color){
  const map = { indigo:'#6366f1', emerald:'#10b981', red:'#ef4444', slate:'#334155' };
  return { background: map[color] || '#334155', border:'1px solid transparent', borderRadius:12, padding:'8px 12px', color:'#fff', fontWeight:600, cursor:'pointer' };
}
function tinyBtn(color){
  const map = { red:'#ef4444', slate:'#334155' };
  return { background: map[color] || '#334155', border:'1px solid transparent', borderRadius:8, padding:'6px 8px', color:'#fff', fontSize:12, cursor:'pointer' };
}
function chip(){ return { background:'#111827', border:'1px solid #1f2937', borderRadius:8, padding:'4px 8px', fontSize:12 }; }
function cardButton(){ return { background:'#1f2937', border:'1px solid #374151', borderRadius:12, padding:'18px 0', fontWeight:800, fontSize:18, cursor:'pointer' }; }
function modalBack(){ return { position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', padding:16 }; }
function modal(){ return { background:'#0b1220', border:'1px solid #1f2937', borderRadius:16, padding:16, width:'100%', maxWidth:600 }; }
