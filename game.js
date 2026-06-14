// game.js - منطق واجهة اللعبة (اتصال مباشر Peer-to-Peer عبر PeerJS - بدون خادم)

// ===== أنماط النقاط (Pips) لكل قيمة من 0 إلى 6 على شبكة 3x3 =====
const PIP_PATTERNS = {
  0: [],
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8]
};

function createTileHalf(value) {
  const half = document.createElement('div');
  half.className = 'tile-half';
  const pattern = PIP_PATTERNS[value] || [];
  for (let i = 0; i < 9; i++) {
    const cell = document.createElement('div');
    if (pattern.includes(i)) cell.className = 'pip';
    half.appendChild(cell);
  }
  return half;
}

function createTileElement(a, b, { orientation = 'horizontal', extraClass = '' } = {}) {
  const el = document.createElement('div');
  el.className = `tile ${orientation} ${extraClass}`.trim();
  el.appendChild(createTileHalf(a));
  el.appendChild(createTileHalf(b));
  return el;
}

function cap(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// ===== عناصر DOM =====
const lobbyScreen = document.getElementById('lobby');
const gameScreen = document.getElementById('game');
const nameInput = document.getElementById('nameInput');
const codeInput = document.getElementById('codeInput');
const createBtn = document.getElementById('createBtn');
const joinBtn = document.getElementById('joinBtn');
const createPanel = document.getElementById('createPanel');
const joinPanel = document.getElementById('joinPanel');
const lobbyError = document.getElementById('lobbyError');
const targetChips = document.getElementById('targetChips');

const roomCodeDisplay = document.getElementById('roomCodeDisplay');
const roundInfo = document.getElementById('roundInfo');
const scoreA = document.getElementById('scoreA');
const scoreB = document.getElementById('scoreB');
const leaveBtn = document.getElementById('leaveBtn');

const boardEl = document.getElementById('board');
const boardScroll = document.getElementById('boardScroll');
const handEl = document.getElementById('hand');
const handScroll = document.getElementById('handScroll');
const emptyHint = document.getElementById('emptyHint');
const dropLeft = document.getElementById('dropLeft');
const dropRight = document.getElementById('dropRight');

const passBtn = document.getElementById('passBtn');
const startBtn = document.getElementById('startBtn');

const roundModal = document.getElementById('roundModal');
const roundModalContent = document.getElementById('roundModalContent');
const gameOverModal = document.getElementById('gameOverModal');
const gameOverContent = document.getElementById('gameOverContent');
const playAgainBtn = document.getElementById('playAgainBtn');
const backToLobbyBtn = document.getElementById('backToLobbyBtn');
const toast = document.getElementById('toast');
const connBanner = document.getElementById('connBanner');
const connLostModal = document.getElementById('connLostModal');
const connLostDetail = document.getElementById('connLostDetail');
const connLostBtn = document.getElementById('connLostBtn');

// ===== ثوابت =====
const BOT_NAMES = ['روبوت أحمد', 'روبوت سارة', 'روبوت علي', 'روبوت ليلى'];
const AVATARS = ['🦁', '🐯', '🐺', '🦊', '🐻', '🐼', '🐸', '🦅', '🐲', '🦉'];
const PEER_PREFIX = 'domino2026-';
const PEER_CONFIG = {
  config: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ]
  }
};

// ===== الحالة العامة =====
let peer = null;
let mySeat = null;
let myToken = null;
let roomCode = null;
let isHost = false;
let lastState = null;
let selectedTileIndex = null;
let lastActionKey = null;
let hasJoined = false;
let createAttempts = 0;
let reconnectAttempts = 0;
let reconnectTimer = null;

// حالة المضيف فقط
let room = null;     // { code, players[4], game, targetScore, started, botTimer }
let conns = {};      // seat(1..3) -> DataConnection

// حالة الضيف فقط
let hostConn = null; // DataConnection بالمضيف

// ===== أدوات مساعدة للواجهة =====
function showScreen(name) {
  lobbyScreen.classList.toggle('hidden', name !== 'lobby');
  gameScreen.classList.toggle('hidden', name !== 'game');
}

function showToast(msg) {
  toast.textContent = msg;
  toast.classList.remove('hidden');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => toast.classList.add('hidden'), 2500);
}

function showLobbyError(msg) {
  lobbyError.textContent = msg;
  lobbyError.classList.remove('hidden');
}

function resetLobbyButtons() {
  createBtn.disabled = false;
  createBtn.querySelector('span').textContent = 'إنشاء غرفة جديدة';
  joinBtn.disabled = false;
  joinBtn.querySelector('span').textContent = 'انضمام للغرفة';
}

function setConnBanner(show) {
  connBanner.classList.toggle('hidden', !show);
}

function showSessionEnded(msg) {
  setConnBanner(false);
  connLostDetail.textContent = msg;
  connLostModal.classList.remove('hidden');
}

// ===== أكواد الغرف والرموز =====
function makeRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function makeToken() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// ===== جلسة محفوظة (localStorage) - لإعادة الاتصال بعد إعادة فتح الصفحة =====
function saveSession() {
  try {
    localStorage.setItem('domino_session', JSON.stringify({
      role: isHost ? 'host' : 'guest',
      code: roomCode,
      token: myToken,
      name: (nameInput.value.trim() || 'أنا')
    }));
  } catch (e) {}
}

function clearSession() {
  try {
    localStorage.removeItem('domino_session');
    localStorage.removeItem('domino_host_room');
  } catch (e) {}
}

function persistHostRoom() {
  if (!isHost || !room) return;
  try {
    localStorage.setItem('domino_host_room', JSON.stringify({
      code: room.code,
      targetScore: room.targetScore,
      started: room.started,
      players: room.players.map(p => ({
        seat: p.seat, name: p.name, avatar: p.avatar, isBot: p.isBot, token: p.token
      })),
      gameState: { ...room.game }
    }));
  } catch (e) {}
}

// ===========================================================
// ===================== منطق المضيف (Host) =================
// المضيف يشغّل قواعد اللعبة كاملة محلياً (gameEngine.js)
// ويرسل حالة اللعبة لكل لاعب متصل عبر PeerJS
// ===========================================================

function emptyPlayer(seat) {
  return {
    seat,
    name: BOT_NAMES[seat],
    avatar: AVATARS[(seat + 4) % AVATARS.length],
    isBot: true,
    connected: true,
    token: null
  };
}

function publicPlayers() {
  return room.players.map(p => ({
    seat: p.seat,
    name: p.name,
    avatar: p.avatar,
    isBot: p.isBot,
    connected: p.connected
  }));
}

function buildStatePayload(seat) {
  return {
    type: 'state',
    room: {
      code: room.code,
      started: room.started,
      players: publicPlayers(),
      targetScore: room.targetScore,
      hostSeat: 0
    },
    game: room.game.getStateForSeat(seat),
    yourSeat: seat
  };
}

function broadcastState() {
  if (!room) return;
  // مقعد المضيف (0) يُعرض محلياً مباشرة
  if (mySeat === 0) {
    lastState = buildStatePayload(0);
    render(lastState);
  }
  // باقي اللاعبين عبر الاتصال المباشر
  for (let seat = 1; seat < 4; seat++) {
    const conn = conns[seat];
    if (conn && conn.open) {
      try { conn.send(buildStatePayload(seat)); } catch (e) {}
    }
  }
  persistHostRoom();
}

function sendErrorTo(seat, msg) {
  if (seat === 0) {
    showToast(msg);
  } else if (conns[seat] && conns[seat].open) {
    try { conns[seat].send({ type: 'errorMsg', msg }); } catch (e) {}
  }
}

function chooseBotMove(game, seat) {
  const moves = game.getValidMoves(seat);
  if (moves.length === 0) return null;
  // تفضيل لعب الدبلات أولاً، ثم أول حركة متاحة عشوائياً
  const hand = game.hands[seat];
  const doubleMove = moves.find(m => {
    const t = hand[m.tileIndex];
    return t && t[0] === t[1];
  });
  const chosen = doubleMove || moves[Math.floor(Math.random() * moves.length)];
  const side = chosen.sides[Math.floor(Math.random() * chosen.sides.length)];
  return { tileIndex: chosen.tileIndex, side };
}

function scheduleNextStep() {
  if (!room) return;
  clearTimeout(room.botTimer);
  if (!room.started) return;
  const game = room.game;

  if (game.gameOver) {
    return; // اللعبة انتهت، بانتظار "لعب مرة أخرى"
  }

  if (game.roundOver) {
    room.botTimer = setTimeout(() => {
      game.startNewRound(game.nextStarter);
      broadcastState();
      scheduleNextStep();
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
        broadcastState();
        scheduleNextStep();
      }
    }, 900 + Math.random() * 700);
  }
}

function applyAction(seat, action) {
  if (!room || !room.started) return;
  let result;
  if (action.type === 'playTile') {
    result = room.game.playTile(seat, action.tileIndex, action.side);
  } else if (action.type === 'pass') {
    result = room.game.pass(seat);
  } else {
    return;
  }

  if (!result.ok) {
    sendErrorTo(seat, result.error);
    return;
  }
  broadcastState();
  scheduleNextStep();
}

function hostStartGame() {
  if (!room || room.started) return;
  room.started = true;
  room.game.startNewRound(null);
  broadcastState();
  scheduleNextStep();
}

function hostPlayAgain() {
  if (!room) return;
  clearTimeout(room.botTimer);
  room.game = new DominoGame(room.targetScore);
  room.started = true;
  room.game.startNewRound(null);
  broadcastState();
  scheduleNextStep();
}

function handleGuestMessage(seat, conn, msg) {
  if (msg.type === 'playTile' || msg.type === 'pass') {
    applyAction(seat, msg);
  }
}

function handleHandshake(conn, msg) {
  if (msg.type === 'join') {
    const botSeatObj = room.players.find(p => p.isBot);
    if (!botSeatObj) {
      try { conn.send({ type: 'errorMsg', msg: 'الغرفة مكتملة بالفعل.' }); } catch (e) {}
      return;
    }
    const seat = botSeatObj.seat;
    const token = makeToken();
    room.players[seat] = {
      seat,
      name: (msg.name || 'لاعب').slice(0, 16),
      avatar: AVATARS[seat],
      isBot: false,
      connected: true,
      token
    };
    conn._seat = seat;
    conns[seat] = conn;
    try { conn.send({ type: 'joined', code: room.code, seat, token }); } catch (e) {}
    broadcastState();
    if (room.started) scheduleNextStep();
  } else if (msg.type === 'rejoin') {
    const player = room.players.find(p => p.token === msg.token);
    if (!player) {
      try { conn.send({ type: 'errorMsg', msg: 'تعذرت استعادة جلستك.' }); } catch (e) {}
      return;
    }
    player.connected = true;
    player.isBot = false;
    conn._seat = player.seat;
    conns[player.seat] = conn;
    try { conn.send({ type: 'joined', code: room.code, seat: player.seat, token: msg.token }); } catch (e) {}
    broadcastState();
    if (room.started) scheduleNextStep();
  }
}

function onGuestDisconnect(conn) {
  const seat = conn._seat;
  if (seat === undefined || !room) return;
  if (conns[seat] === conn) {
    room.players[seat].connected = false;
    delete conns[seat];
    broadcastState();
    if (room.started) scheduleNextStep();
  }
}

function attachHostPeerHandlers() {
  peer.on('connection', (conn) => {
    conn.on('data', (msg) => {
      if (conn._seat === undefined) handleHandshake(conn, msg);
      else handleGuestMessage(conn._seat, conn, msg);
    });
    conn.on('close', () => onGuestDisconnect(conn));
    conn.on('error', () => onGuestDisconnect(conn));
  });
  peer.on('disconnected', () => {
    try { peer.reconnect(); } catch (e) {}
  });
}

function initRoomObject(code, name, targetScore) {
  room = {
    code,
    players: [emptyPlayer(0), emptyPlayer(1), emptyPlayer(2), emptyPlayer(3)],
    game: new DominoGame(TARGET_SCORES.includes(targetScore) ? targetScore : 101),
    targetScore: TARGET_SCORES.includes(targetScore) ? targetScore : 101,
    started: false,
    botTimer: null
  };
  myToken = makeToken();
  room.players[0] = {
    seat: 0,
    name: (name || 'أنا').slice(0, 16),
    avatar: AVATARS[0],
    isBot: false,
    connected: true,
    token: myToken
  };
  mySeat = 0;
  isHost = true;
  roomCode = code;
}

function tryCreateRoom(name, targetScore) {
  createAttempts = 0;
  attemptCreate(name, targetScore);
}

function attemptCreate(name, targetScore) {
  const code = makeRoomCode();
  const p = new Peer(PEER_PREFIX + code, PEER_CONFIG);
  let settled = false;
  p.on('open', () => {
    settled = true;
    peer = p;
    initRoomObject(code, name, targetScore);
    attachHostPeerHandlers();
    hasJoined = true;
    saveSession();
    resetLobbyButtons();
    showScreen('game');
    broadcastState();
  });
  p.on('error', (err) => {
    if (settled) return;
    if (err && err.type === 'unavailable-id' && createAttempts < 6) {
      createAttempts++;
      try { p.destroy(); } catch (e) {}
      attemptCreate(name, targetScore);
    } else {
      try { p.destroy(); } catch (e) {}
      resetLobbyButtons();
      showLobbyError('تعذر إنشاء الغرفة. تحقق من اتصال الإنترنت وحاول مرة أخرى.');
    }
  });
}

function tryRestoreHost(session) {
  let raw;
  try { raw = localStorage.getItem('domino_host_room'); } catch (e) { raw = null; }
  if (!raw) return false;
  let saved;
  try { saved = JSON.parse(raw); } catch (e) { return false; }
  if (!saved || saved.code !== session.code) return false;

  room = {
    code: saved.code,
    targetScore: saved.targetScore,
    started: saved.started,
    players: saved.players.map(p => ({ ...p, connected: p.seat === 0 })),
    game: Object.assign(new DominoGame(), saved.gameState),
    botTimer: null
  };
  mySeat = 0;
  isHost = true;
  roomCode = saved.code;
  myToken = room.players[0].token;

  const p = new Peer(PEER_PREFIX + saved.code, PEER_CONFIG);
  let settled = false;
  p.on('open', () => {
    settled = true;
    peer = p;
    attachHostPeerHandlers();
    hasJoined = true;
    showScreen('game');
    broadcastState();
    if (room.started) scheduleNextStep();
  });
  p.on('error', () => {
    if (settled) return;
    clearSession();
    showScreen('lobby');
  });
  return true;
}

// ===========================================================
// ===================== منطق الضيف (Guest) =================
// ===========================================================

function connectToHost(onOpen) {
  hostConn = peer.connect(PEER_PREFIX + roomCode, { reliable: true });
  hostConn.on('open', () => {
    reconnectAttempts = 0;
    setConnBanner(false);
    if (onOpen) onOpen();
  });
  hostConn.on('data', handleHostMessage);
  hostConn.on('close', onHostConnLost);
  hostConn.on('error', () => {
    if (!hasJoined) {
      resetLobbyButtons();
      showLobbyError('لم يتم العثور على الغرفة. تحقق من الرمز.');
    } else {
      onHostConnLost();
    }
  });
}

function handleHostMessage(msg) {
  switch (msg.type) {
    case 'joined':
      hasJoined = true;
      mySeat = msg.seat;
      myToken = msg.token;
      roomCode = msg.code;
      lobbyError.classList.add('hidden');
      resetLobbyButtons();
      saveSession();
      showScreen('game');
      break;
    case 'state':
      lastState = msg;
      mySeat = msg.yourSeat;
      render(msg);
      break;
    case 'errorMsg':
      if (!hasJoined) {
        clearSession();
        resetLobbyButtons();
        showLobbyError(msg.msg);
      } else {
        showToast(msg.msg);
      }
      break;
  }
}

function tryJoinRoom(code, name) {
  roomCode = code;
  isHost = false;
  peer = new Peer(undefined, PEER_CONFIG);
  peer.on('open', () => {
    connectToHost(() => { try { hostConn.send({ type: 'join', name }); } catch (e) {} });
  });
  peer.on('error', (err) => {
    resetLobbyButtons();
    if (err && err.type === 'peer-unavailable') {
      showLobbyError('لم يتم العثور على الغرفة. تحقق من الرمز.');
    } else {
      showLobbyError('تعذر الاتصال. تحقق من اتصال الإنترنت.');
    }
  });
}

function tryRestoreGuest(session) {
  roomCode = session.code;
  myToken = session.token;
  isHost = false;
  showScreen('game');
  setConnBanner(true);
  peer = new Peer(undefined, PEER_CONFIG);
  peer.on('open', () => {
    connectToHost(() => { try { hostConn.send({ type: 'rejoin', token: myToken }); } catch (e) {} });
  });
  peer.on('error', () => {
    attemptReconnect();
  });
}

function onHostConnLost() {
  if (!hasJoined) return;
  setConnBanner(true);
  attemptReconnect();
}

function attemptReconnect() {
  reconnectAttempts++;
  if (reconnectAttempts > 10) {
    showSessionEnded('تعذر الاتصال بالغرفة. قد يكون مالك الغرفة غادر اللعبة.');
    return;
  }
  clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(() => {
    try {
      if (!peer || peer.destroyed) {
        peer = new Peer(undefined, PEER_CONFIG);
        peer.on('open', () => connectToHost(() => { try { hostConn.send({ type: 'rejoin', token: myToken }); } catch (e) {} }));
        peer.on('error', () => attemptReconnect());
      } else {
        connectToHost(() => { try { hostConn.send({ type: 'rejoin', token: myToken }); } catch (e) {} });
      }
    } catch (e) {
      attemptReconnect();
    }
  }, Math.min(1500 * reconnectAttempts, 6000));
}

// ===== إرسال حركة موحّد (يعمل عند المضيف أو الضيف بنفس الطريقة) =====
function sendAction(action) {
  if (isHost) {
    applyAction(0, action);
  } else if (hostConn && hostConn.open) {
    try { hostConn.send(action); } catch (e) {}
  }
}

// ===== شاشة البداية =====
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const tab = btn.dataset.tab;
    createPanel.classList.toggle('hidden', tab !== 'create');
    joinPanel.classList.toggle('hidden', tab !== 'join');
    lobbyError.classList.add('hidden');
  });
});

targetChips.querySelectorAll('.chip').forEach(chip => {
  chip.addEventListener('click', () => {
    targetChips.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
  });
});

createBtn.addEventListener('click', () => {
  const name = nameInput.value.trim() || 'أنا';
  localStorage.setItem('domino_name', name);
  const targetScore = parseInt(targetChips.querySelector('.chip.active').dataset.value, 10);
  lobbyError.classList.add('hidden');
  createBtn.disabled = true;
  createBtn.querySelector('span').textContent = 'جاري الإنشاء...';
  tryCreateRoom(name, targetScore);
});

joinBtn.addEventListener('click', () => {
  const name = nameInput.value.trim() || 'أنا';
  const code = codeInput.value.trim().toUpperCase();
  if (code.length !== 5) {
    showLobbyError('رمز الغرفة يجب أن يكون 5 رموز');
    return;
  }
  localStorage.setItem('domino_name', name);
  lobbyError.classList.add('hidden');
  joinBtn.disabled = true;
  joinBtn.querySelector('span').textContent = 'جاري الاتصال...';
  tryJoinRoom(code, name);
});

// تعبئة الاسم المحفوظ سابقاً
const savedName = localStorage.getItem('domino_name');
if (savedName) nameInput.value = savedName;

codeInput.addEventListener('input', () => {
  codeInput.value = codeInput.value.toUpperCase();
});

// ===== أزرار شاشة اللعب =====
leaveBtn.addEventListener('click', () => {
  clearSession();
  location.reload();
});

backToLobbyBtn.addEventListener('click', () => {
  clearSession();
  location.reload();
});

connLostBtn.addEventListener('click', () => {
  clearSession();
  location.reload();
});

playAgainBtn.addEventListener('click', () => {
  if (isHost) hostPlayAgain();
});

passBtn.addEventListener('click', () => {
  sendAction({ type: 'pass' });
});

startBtn.addEventListener('click', () => {
  if (isHost) hostStartGame();
});

roomCodeDisplay.addEventListener('click', () => {
  if (!roomCode) return;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(roomCode).catch(() => {});
  }
  showToast('تم نسخ رمز الغرفة');
});

dropLeft.addEventListener('click', () => {
  if (selectedTileIndex !== null) sendPlay(selectedTileIndex, 'left');
});
dropRight.addEventListener('click', () => {
  if (selectedTileIndex !== null) sendPlay(selectedTileIndex, 'right');
});

// ===== إرسال الحركات =====
function sendPlay(index, side) {
  sendAction({ type: 'playTile', tileIndex: index, side: side === 'first' ? null : side });
  selectedTileIndex = null;
  showDropZones(false);
}

function handleTileClick(index, move) {
  if (move.sides.includes('first') || move.sides.length === 1) {
    sendPlay(index, move.sides[0]);
    return;
  }
  // القطعة تطابق الطرفين - اطلب من اللاعب تحديد الجهة
  selectedTileIndex = (selectedTileIndex === index) ? null : index;
  renderHand(lastState.game);
  showDropZones(selectedTileIndex !== null);
}

function showDropZones(show) {
  dropLeft.classList.toggle('hidden', !show);
  dropRight.classList.toggle('hidden', !show);
}

// ===== الرسم =====
function render(data) {
  const { room: roomData, game, yourSeat } = data;
  const teamMe = yourSeat % 2;
  const teamOpp = 1 - teamMe;
  const started = roomData.started;
  const inProgress = started && !game.roundOver && !game.gameOver;

  // الشريط العلوي
  roomCodeDisplay.textContent = roomData.code;
  scoreA.textContent = game.teamScores[teamMe];
  scoreB.textContent = game.teamScores[teamOpp];
  roundInfo.textContent = `جولة ${game.round || 1} · هدف ${game.targetScore}`;

  // تعيين المقاعد حول الطاولة (الأسفل أنا، يمين/أعلى/يسار بترتيب الدور)
  const seatMap = {
    bottom: yourSeat,
    right: (yourSeat + 1) % 4,
    top: (yourSeat + 2) % 4,
    left: (yourSeat + 3) % 4
  };

  ['top', 'left', 'right'].forEach(pos => {
    const seat = seatMap[pos];
    const player = roomData.players[seat];
    const seatEl = document.getElementById('seat' + cap(pos));
    document.getElementById('avatar' + cap(pos)).textContent = player.avatar;
    const nameEl = document.getElementById('name' + cap(pos));
    nameEl.textContent = player.name + (player.isBot ? ' 🤖' : '');
    nameEl.classList.toggle('discon', !player.isBot && !player.connected);

    const miniHand = document.getElementById('miniHand' + cap(pos));
    miniHand.innerHTML = '';
    const count = (game.handCounts && game.handCounts[seat]) || 0;
    for (let i = 0; i < count; i++) {
      const t = document.createElement('div');
      t.className = 'mini-tile';
      miniHand.appendChild(t);
    }

    seatEl.classList.toggle('active', inProgress && game.currentTurn === seat);
  });

  // مقعدي
  document.getElementById('avatarBottom').textContent = roomData.players[yourSeat].avatar;
  document.getElementById('nameBottom').textContent = roomData.players[yourSeat].name;
  document.querySelector('.my-row').classList.toggle('active', inProgress && game.currentTurn === yourSeat);

  // اللوح واليد
  renderBoard(game.board);
  renderHand(game);

  // زر البدء (لصاحب الغرفة فقط، قبل البدء)
  startBtn.classList.toggle('hidden', !(yourSeat === 0 && !started));

  // زر التمرير
  const myTurn = inProgress && game.currentTurn === yourSeat;
  const hasMoves = game.validMoves && game.validMoves.length > 0;
  passBtn.classList.toggle('hidden', !(myTurn && !hasMoves));

  // تلميح بدء اللعب
  emptyHint.classList.toggle('hidden', started);

  // تتبع آخر حركة لإظهار تنبيه عند تمرير لاعب آخر
  if (game.lastAction) {
    const key = JSON.stringify(game.lastAction) + '|' + game.round;
    if (key !== lastActionKey) {
      lastActionKey = key;
      if (game.lastAction.seat !== yourSeat && game.lastAction.type === 'pass') {
        const name = roomData.players[game.lastAction.seat].name;
        showToast(`${name} مرّر`);
      }
    }
  }

  // النوافذ المنبثقة
  if (game.roundOver && !game.gameOver) {
    showRoundModal(game.roundResult, teamMe);
  } else {
    roundModal.classList.add('hidden');
  }

  if (game.gameOver) {
    showGameOverModal(game, teamMe);
  } else {
    gameOverModal.classList.add('hidden');
  }

  if (!myTurn || !hasMoves) showDropZones(false);
}

function renderBoard(board) {
  boardEl.innerHTML = '';
  board.forEach(t => {
    const orientation = t.a === t.b ? 'vertical' : 'horizontal';
    boardEl.appendChild(createTileElement(t.a, t.b, { orientation }));
  });
  requestAnimationFrame(() => {
    const max = boardEl.scrollWidth - boardScroll.clientWidth;
    boardScroll.scrollLeft = Math.max(0, max / 2);
  });
}

function renderHand(game) {
  handEl.innerHTML = '';
  const started = lastState && lastState.room.started;
  const myTurn = started && !game.roundOver && !game.gameOver && game.currentTurn === mySeat;
  const moves = game.validMoves || [];

  (game.hand || []).forEach((tile, i) => {
    const move = moves.find(m => m.tileIndex === i);
    const playable = myTurn && !!move;
    let extra = 'in-hand';
    if (playable) extra += ' playable';
    if (selectedTileIndex === i) extra += ' selected';
    const el = createTileElement(tile[0], tile[1], { orientation: 'horizontal', extraClass: extra });
    if (playable) {
      el.addEventListener('click', () => handleTileClick(i, move));
    }
    handEl.appendChild(el);
  });
}

// ===== نوافذ النتائج =====
function showRoundModal(result, teamMe) {
  let html = '';
  if (result.reason === 'domino') {
    const won = result.winningTeam === teamMe;
    html = `
      <div class="modal-title">${won ? 'فوز بالجولة! 🎉' : 'خسارة الجولة'}</div>
      <div class="modal-detail">أنهى أحد اللاعبين قطعه بالكامل</div>
      <div class="modal-points ${won ? 'team-a' : 'team-b'}">+${result.pointsAwarded}</div>
      <div class="modal-detail">${won ? 'لكم' : 'للخصم'}</div>
    `;
  } else {
    if (result.winningTeam === null) {
      html = `
        <div class="modal-title">الطاولة مسدودة</div>
        <div class="modal-detail">تعادل في النقاط - لا أحد يسجل</div>
      `;
    } else {
      const won = result.winningTeam === teamMe;
      html = `
        <div class="modal-title">الطاولة مسدودة</div>
        <div class="modal-detail">${won ? 'فريقكم' : 'فريق الخصم'} لديه أقل نقاط في اليد</div>
        <div class="modal-points ${won ? 'team-a' : 'team-b'}">+${result.pointsAwarded}</div>
        <div class="modal-detail">${won ? 'لكم' : 'للخصم'}</div>
      `;
    }
  }
  roundModalContent.innerHTML = html;
  roundModal.classList.remove('hidden');
}

function showGameOverModal(game, teamMe) {
  const won = game.winningTeam === teamMe;
  gameOverContent.innerHTML = `
    <div class="modal-title">${won ? '🏆 فوز اللعبة!' : 'انتهت اللعبة'}</div>
    <div class="modal-detail">${won ? 'تهانينا، لقد فزتم بالمباراة!' : 'حظ أفضل في المرة القادمة'}</div>
    <div class="modal-points ${won ? 'team-a' : 'team-b'}">${game.teamScores[teamMe]} - ${game.teamScores[1 - teamMe]}</div>
    <div class="modal-detail">النتيجة النهائية</div>
  `;
  gameOverModal.classList.remove('hidden');
  playAgainBtn.classList.toggle('hidden', mySeat !== 0);
}

// ===== بدء التشغيل =====
(function init() {
  let raw = null;
  try { raw = localStorage.getItem('domino_session'); } catch (e) {}
  if (raw) {
    try {
      const session = JSON.parse(raw);
      if (session && session.code && session.token) {
        if (session.role === 'host') {
          if (tryRestoreHost(session)) return;
          clearSession();
        } else {
          tryRestoreGuest(session);
          return;
        }
      }
    } catch (e) {
      clearSession();
    }
  }
  showScreen('lobby');
})();
