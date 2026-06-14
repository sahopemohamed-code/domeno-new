// server.js - خادم اللعبة (Express + Socket.io)
const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { DominoGame, TARGET_SCORES } = require('./gameEngine');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

app.use(express.static(path.join(__dirname));

const PORT = process.env.PORT || 3000;

// rooms[code] = { code, players: [seat0..seat3], game, targetScore, started, botTimer }
const rooms = {};

const BOT_NAMES = ['روبوت أحمد', 'روبوت سارة', 'روبوت علي', 'روبوت ليلى'];
const AVATARS = ['🦁', '🐯', '🐺', '🦊', '🐻', '🐼', '🐸', '🦅', '🐲', '🦉'];

function makeRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = '';
    for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
  } while (rooms[code]);
  return code;
}

function makeToken() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function emptyPlayer(seat) {
  return {
    seat,
    name: BOT_NAMES[seat],
    avatar: AVATARS[(seat + 4) % AVATARS.length],
    isBot: true,
    connected: true,
    socketId: null,
    token: null
  };
}

function publicPlayers(room) {
  return room.players.map(p => ({
    seat: p.seat,
    name: p.name,
    avatar: p.avatar,
    isBot: p.isBot,
    connected: p.connected
  }));
}

function broadcastState(room) {
  room.players.forEach(p => {
    if (!p.isBot && p.socketId) {
      const state = room.game.getStateForSeat(p.seat);
      io.to(p.socketId).emit('state', {
        room: {
          code: room.code,
          started: room.started,
          players: publicPlayers(room),
          targetScore: room.targetScore,
          hostSeat: 0
        },
        game: state,
        yourSeat: p.seat
      });
    }
  });
}

function chooseBotMove(game, seat) {
  const moves = game.getValidMoves(seat);
  if (moves.length === 0) return null;
  // تفضيل لعب الدبلات أولاً، ثم أول حركة متاحة
  const hand = game.hands[seat];
  const doubleMove = moves.find(m => {
    const t = hand[m.tileIndex];
    return t && t[0] === t[1];
  });
  const chosen = doubleMove || moves[Math.floor(Math.random() * moves.length)];
  const side = chosen.sides[Math.floor(Math.random() * chosen.sides.length)];
  return { tileIndex: chosen.tileIndex, side };
}

function scheduleNextStep(room) {
  clearTimeout(room.botTimer);
  if (!room.started) return;
  const game = room.game;

  if (game.gameOver) {
    return; // اللعبة انتهت، بانتظار "لعب مرة أخرى"
  }

  if (game.roundOver) {
    room.botTimer = setTimeout(() => {
      game.startNewRound(game.nextStarter);
      broadcastState(room);
      scheduleNextStep(room);
    }, 4500);
    return;
  }

  const seat = game.currentTurn;
  const player = room.players[seat];
  const isBotControlled = player.isBot || !player.connected;
  if (isBotControlled) {
    room.botTimer = setTimeout(() => {
      const move = chooseBotMove(game, seat);
      let result;
      if (!move) {
        result = game.pass(seat);
      } else {
        result = game.playTile(seat, move.tileIndex, move.side);
      }
      if (result.ok) {
        broadcastState(room);
        scheduleNextStep(room);
      }
    }, 900 + Math.random() * 700);
  }
}

io.on('connection', (socket) => {
  socket.on('createRoom', ({ name, targetScore }) => {
    const code = makeRoomCode();
    const room = {
      code,
      players: [emptyPlayer(0), emptyPlayer(1), emptyPlayer(2), emptyPlayer(3)],
      game: new DominoGame(TARGET_SCORES.includes(targetScore) ? targetScore : 101),
      targetScore: TARGET_SCORES.includes(targetScore) ? targetScore : 101,
      started: false,
      botTimer: null
    };
    const token = makeToken();
    room.players[0] = {
      seat: 0,
      name: (name || 'أنا').slice(0, 16),
      avatar: AVATARS[0],
      isBot: false,
      connected: true,
      socketId: socket.id,
      token
    };
    rooms[code] = room;
    socket.join(code);
    socket.data.roomCode = code;
    socket.data.seat = 0;
    socket.data.token = token;

    socket.emit('joined', { code, seat: 0, token });
    broadcastState(room);
  });

  socket.on('joinRoom', ({ code, name }) => {
    code = (code || '').toUpperCase().trim();
    const room = rooms[code];
    if (!room) {
      socket.emit('errorMsg', 'لم يتم العثور على الغرفة. تحقق من الرمز.');
      return;
    }
    // البحث عن مقعد بوت لاستبداله، أو مقعد منقطع لاستعادته بنفس الاسم
    const botSeat = room.players.find(p => p.isBot);
    if (!botSeat) {
      socket.emit('errorMsg', 'الغرفة مكتملة بالفعل.');
      return;
    }
    const token = makeToken();
    const seat = botSeat.seat;
    room.players[seat] = {
      seat,
      name: (name || 'لاعب').slice(0, 16),
      avatar: AVATARS[seat],
      isBot: false,
      connected: true,
      socketId: socket.id,
      token
    };
    socket.join(code);
    socket.data.roomCode = code;
    socket.data.seat = seat;
    socket.data.token = token;

    socket.emit('joined', { code, seat, token });
    broadcastState(room);
  });

  socket.on('rejoin', ({ code, token }) => {
    code = (code || '').toUpperCase().trim();
    const room = rooms[code];
    if (!room) {
      socket.emit('errorMsg', 'الغرفة غير موجودة بعد الآن.');
      return;
    }
    const player = room.players.find(p => p.token === token);
    if (!player) {
      socket.emit('errorMsg', 'تعذرت استعادة جلستك.');
      return;
    }
    player.socketId = socket.id;
    player.connected = true;
    socket.join(code);
    socket.data.roomCode = code;
    socket.data.seat = player.seat;
    socket.data.token = token;

    socket.emit('joined', { code, seat: player.seat, token });
    broadcastState(room);
    if (room.started) scheduleNextStep(room);
  });

  socket.on('startGame', () => {
    const room = rooms[socket.data.roomCode];
    if (!room) return;
    if (socket.data.seat !== 0) return; // فقط صاحب الغرفة
    if (room.started) return;
    room.started = true;
    room.game.startNewRound(null);
    broadcastState(room);
    scheduleNextStep(room);
  });

  socket.on('playTile', ({ tileIndex, side }) => {
    const room = rooms[socket.data.roomCode];
    if (!room || !room.started) return;
    const seat = socket.data.seat;
    const result = room.game.playTile(seat, tileIndex, side);
    if (!result.ok) {
      socket.emit('errorMsg', result.error);
      return;
    }
    broadcastState(room);
    scheduleNextStep(room);
  });

  socket.on('pass', () => {
    const room = rooms[socket.data.roomCode];
    if (!room || !room.started) return;
    const seat = socket.data.seat;
    const result = room.game.pass(seat);
    if (!result.ok) {
      socket.emit('errorMsg', result.error);
      return;
    }
    broadcastState(room);
    scheduleNextStep(room);
  });

  socket.on('playAgain', () => {
    const room = rooms[socket.data.roomCode];
    if (!room) return;
    if (socket.data.seat !== 0) return;
    room.game = new DominoGame(room.targetScore);
    room.started = true;
    room.game.startNewRound(null);
    broadcastState(room);
    scheduleNextStep(room);
  });

  socket.on('sendEmote', (emote) => {
    const room = rooms[socket.data.roomCode];
    if (!room) return;
    room.players.forEach(p => {
      if (!p.isBot && p.socketId) {
        io.to(p.socketId).emit('emote', { seat: socket.data.seat, emote });
      }
    });
  });

  socket.on('disconnect', () => {
    const code = socket.data.roomCode;
    const room = rooms[code];
    if (!room) return;
    const player = room.players[socket.data.seat];
    if (player && player.socketId === socket.id) {
      player.connected = false;
      broadcastState(room);
      if (room.started) scheduleNextStep(room);
    }
    // تنظيف الغرف الفاضية تماماً (كل المقاعد بوت أو غير متصلة)
    const anyHuman = room.players.some(p => !p.isBot && p.connected);
    if (!anyHuman) {
      setTimeout(() => {
        const r = rooms[code];
        if (!r) return;
        const stillNoHuman = r.players.some(p => !p.isBot && p.connected) === false;
        if (stillNoHuman) {
          clearTimeout(r.botTimer);
          delete rooms[code];
        }
      }, 60000);
    }
  });
});

server.listen(PORT, () => {
  console.log(`Domino server running on port ${PORT}`);
});
