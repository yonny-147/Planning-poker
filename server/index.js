import express from 'express';
import http from 'http';
import cors from 'cors';
import { Server } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET','POST'] }
});

/** In-memory room store. For production, swap with Redis or DB */
const rooms = new Map();

function createRoom({ roomName = 'Sala', deckName = 'Fibonacci', customDeck = '1,2,3,5,8,13,?,☕' }) {
  const id = uuidv4().slice(0, 8);
  const room = {
    id,
    roomName,
    deckName,
    customDeck,
    stories: [],
    participants: {}, // {socketId: {id,name,role}}
    currentStoryId: null,
    votes: {}, // {participantId: value}
    revealed: false,
    timer: { running: false, seconds: 0, interval: null },
    createdAt: Date.now(),
  };
  rooms.set(id, room);
  return room;
}

function getRoom(id) {
  return rooms.get(id) || null;
}

function roomStatePublic(room) {
  return {
    id: room.id,
    roomName: room.roomName,
    deckName: room.deckName,
    customDeck: room.customDeck,
    stories: room.stories,
    participants: Object.values(room.participants),
    currentStoryId: room.currentStoryId,
    votes: room.revealed ? room.votes : maskVotes(room.votes),
    revealed: room.revealed,
    timer: { running: room.timer.running, seconds: room.timer.seconds },
    createdAt: room.createdAt,
  };
}

function maskVotes(votes) {
  const masked = {};
  Object.keys(votes).forEach(pid => masked[pid] = '🂠');
  return masked;
}

function addStory(room, title) {
  const id = uuidv4().slice(0, 8);
  room.stories.push({ id, title, notes: '', finalEstimate: '' });
  room.currentStoryId = id;
  resetRound(room);
}

function updateStory(room, id, patch) {
  room.stories = room.stories.map(s => s.id === id ? { ...s, ...patch } : s);
}

function removeStory(room, id) {
  room.stories = room.stories.filter(s => s.id !== id);
  if (room.currentStoryId === id) {
    room.currentStoryId = room.stories[0]?.id || null;
    resetRound(room);
  }
}

function resetRound(room) {
  room.votes = {};
  room.revealed = false;
  stopTimer(room);
  room.timer.seconds = 0;
}

function reveal(room) {
  room.revealed = true;
  stopTimer(room);
}

function startTimer(room) {
  if (room.timer.interval) return;
  room.timer.running = true;
  room.timer.interval = setInterval(() => {
    room.timer.seconds += 1;
    io.to(room.id).emit('room:state', roomStatePublic(room));
  }, 1000);
}

function stopTimer(room) {
  room.timer.running = false;
  if (room.timer.interval) {
    clearInterval(room.timer.interval);
    room.timer.interval = null;
  }
}

app.post('/api/rooms', (req, res) => {
  const room = createRoom(req.body || {});
  res.json({ id: room.id });
});

app.get('/api/rooms/:id', (req, res) => {
  const room = getRoom(req.params.id);
  if (!room) return res.status(404).json({ error: 'Room not found' });
  res.json(roomStatePublic(room));
});

io.on('connection', (socket) => {
  // join a room
  socket.on('room:join', ({ roomId, name, role }) => {
    const room = getRoom(roomId);
    if (!room) {
      socket.emit('room:error', 'Sala no existe');
      return;
    }
    socket.join(roomId);
    room.participants[socket.id] = { id: socket.id, name: name || 'Anónimo', role: role || 'Miembro' };
    io.to(roomId).emit('room:state', roomStatePublic(room));
  });

  // leave on disconnect
  socket.on('disconnect', () => {
    for (const room of rooms.values()) {
      if (room.participants[socket.id]) {
        delete room.participants[socket.id];
        delete room.votes[socket.id];
        io.to(room.id).emit('room:state', roomStatePublic(room));
      }
    }
  });

  // story events
  socket.on('story:add', ({ roomId, title }) => {
    const room = getRoom(roomId); if (!room) return;
    addStory(room, title || 'Nueva historia');
    io.to(roomId).emit('room:state', roomStatePublic(room));
  });

  socket.on('story:update', ({ roomId, id, patch }) => {
    const room = getRoom(roomId); if (!room) return;
    updateStory(room, id, patch || {});
    io.to(roomId).emit('room:state', roomStatePublic(room));
  });

  socket.on('story:remove', ({ roomId, id }) => {
    const room = getRoom(roomId); if (!room) return;
    removeStory(room, id);
    io.to(roomId).emit('room:state', roomStatePublic(room));
  });

  socket.on('story:setCurrent', ({ roomId, id }) => {
    const room = getRoom(roomId); if (!room) return;
    room.currentStoryId = id || null;
    resetRound(room);
    io.to(roomId).emit('room:state', roomStatePublic(room));
  });

  // voting
  socket.on('vote:cast', ({ roomId, participantId, value }) => {
    const room = getRoom(roomId); if (!room) return;
    room.votes[participantId] = value;
    io.to(roomId).emit('room:state', roomStatePublic(room));
  });

  socket.on('round:reveal', ({ roomId }) => {
    const room = getRoom(roomId); if (!room) return;
    reveal(room);
    io.to(roomId).emit('room:state', roomStatePublic(room));
  });

  socket.on('round:reset', ({ roomId }) => {
    const room = getRoom(roomId); if (!room) return;
    resetRound(room);
    io.to(roomId).emit('room:state', roomStatePublic(room));
  });

  socket.on('round:setFinal', ({ roomId, value }) => {
    const room = getRoom(roomId); if (!room) return;
    if (room.currentStoryId) {
      updateStory(room, room.currentStoryId, { finalEstimate: value });
      io.to(roomId).emit('room:state', roomStatePublic(room));
    }
  });

  // deck & settings
  socket.on('deck:set', ({ roomId, deckName }) => {
    const room = getRoom(roomId); if (!room) return;
    room.deckName = deckName || room.deckName;
    io.to(roomId).emit('room:state', roomStatePublic(room));
  });

  socket.on('deck:setCustom', ({ roomId, customDeck }) => {
    const room = getRoom(roomId); if (!room) return;
    room.customDeck = customDeck || room.customDeck;
    io.to(roomId).emit('room:state', roomStatePublic(room));
  });

  // timer
  socket.on('timer:start', ({ roomId }) => { const room = getRoom(roomId); if (!room) return; startTimer(room); });
  socket.on('timer:stop', ({ roomId }) => { const room = getRoom(roomId); if (!room) return; stopTimer(room); io.to(roomId).emit('room:state', roomStatePublic(room)); });

});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log('Planning Poker server running on :' + PORT);
});
