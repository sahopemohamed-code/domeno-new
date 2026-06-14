// game.js - منطق واجهة اللعبة والاتصال بالخادم

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

// ===== الحالة =====
let socket = null;
let mySeat = null;
let lastState = null;
let selectedTileIndex = null;
let lastActionKey = null;
let hasJoined = false;

// ===== أدوات مساعدة =====
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

// ===== الاتصال بالخادم =====
function getSocket() {
  if (socket) return socket;
  socket = io();

  socket.on('joined', ({ code, seat, token }) => {
    hasJoined = true;
    mySeat = seat;
    lobbyError.classList.add('hidden');
    localStorage.setItem('domino_session', JSON.stringify({
      code, token, name: nameInput.value.trim() || 'أنا'
    }));
    showScreen('game');
  });

  socket.on('state', (data) => {
    lastState = data;
    mySeat = data.yourSeat;
    render(data);
  });

  socket.on('errorMsg', (msg) => {
    if (!hasJoined) {
      localStorage.removeItem('domino_session');
      showLobbyError(msg);
      showScreen('lobby');
    } else {
      showToast(msg);
    }
  });

  return socket;
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
  getSocket().emit('createRoom', { name, targetScore });
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
  getSocket().emit('joinRoom', { code, name });
});

// تعبئة الاسم المحفوظ سابقاً
const savedName = localStorage.getItem('domino_name');
if (savedName) nameInput.value = savedName;

codeInput.addEventListener('input', () => {
  codeInput.value = codeInput.value.toUpperCase();
});

// ===== أزرار شاشة اللعب =====
leaveBtn.addEventListener('click', () => {
  localStorage.removeItem('domino_session');
  location.reload();
});

backToLobbyBtn.addEventListener('click', () => {
  localStorage.removeItem('domino_session');
  location.reload();
});

playAgainBtn.addEventListener('click', () => {
  socket.emit('playAgain');
});

passBtn.addEventListener('click', () => {
  socket.emit('pass');
});

startBtn.addEventListener('click', () => {
  socket.emit('startGame');
});

roomCodeDisplay.addEventListener('click', () => {
  if (!lastState) return;
  const code = lastState.room.code;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(code).catch(() => {});
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
  socket.emit('playTile', { tileIndex: index, side: side === 'first' ? null : side });
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
  const { room, game, yourSeat } = data;
  const teamMe = yourSeat % 2;
  const teamOpp = 1 - teamMe;
  const started = room.started;
  const inProgress = started && !game.roundOver && !game.gameOver;

  // الشريط العلوي
  roomCodeDisplay.textContent = room.code;
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
    const player = room.players[seat];
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
  document.getElementById('avatarBottom').textContent = room.players[yourSeat].avatar;
  document.getElementById('nameBottom').textContent = room.players[yourSeat].name;
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
        const name = room.players[game.lastAction.seat].name;
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
  const saved = localStorage.getItem('domino_session');
  if (saved) {
    try {
      const session = JSON.parse(saved);
      if (session && session.code && session.token) {
        getSocket().emit('rejoin', { code: session.code, token: session.token });
        return;
      }
    } catch (e) {
      localStorage.removeItem('domino_session');
    }
  }
  showScreen('lobby');
})();
