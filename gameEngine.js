// gameEngine.js - منطق لعبة الدومينو (بلوك دومينو - 4 لاعبين، فريقين)
// المقاعد 0 و2 = الفريق A (شريكين متقابلين) | المقاعد 1 و3 = الفريق B

const TARGET_SCORES = [101, 121, 151, 201];

function createDeck() {
  const deck = [];
  for (let i = 0; i <= 6; i++) {
    for (let j = i; j <= 6; j++) {
      deck.push([i, j]);
    }
  }
  return deck; // 28 قطعة
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function tilePips(tile) {
  return tile[0] + tile[1];
}

class DominoGame {
  constructor(targetScore = 101) {
    this.targetScore = targetScore;
    this.teamScores = [0, 0];
    this.round = 0;
    this.hands = [[], [], [], []];
    this.board = [];
    this.leftEnd = null;
    this.rightEnd = null;
    this.currentTurn = 0;
    this.passCount = 0;
    this.roundOver = false;
    this.gameOver = false;
    this.lastAction = null;
    this.forcedFirstTile = null;
    this.nextStarter = null;
  }

  teamOf(seat) {
    return seat % 2 === 0 ? 0 : 1;
  }

  startNewRound(startingSeat = null) {
    this.round += 1;
    const deck = shuffle(createDeck());
    this.hands = [
      deck.slice(0, 7),
      deck.slice(7, 14),
      deck.slice(14, 21),
      deck.slice(21, 28)
    ];
    this.board = [];
    this.leftEnd = null;
    this.rightEnd = null;
    this.passCount = 0;
    this.roundOver = false;
    this.roundResult = null;
    this.lastAction = null;
    this.forcedFirstTile = null;

    if (startingSeat === null) {
      for (let seat = 0; seat < 4; seat++) {
        const idx = this.hands[seat].findIndex(t => t[0] === 6 && t[1] === 6);
        if (idx !== -1) {
          this.currentTurn = seat;
          this.forcedFirstTile = idx;
          return;
        }
      }
      this.currentTurn = 0;
    } else {
      this.currentTurn = startingSeat;
    }
  }

  getValidMoves(seat) {
    if (this.currentTurn !== seat || this.roundOver) return [];
    const hand = this.hands[seat];
    if (this.board.length === 0) {
      if (this.forcedFirstTile !== null) {
        return [{ tileIndex: this.forcedFirstTile, sides: ['first'] }];
      }
      return hand.map((_, i) => ({ tileIndex: i, sides: ['first'] }));
    }
    const moves = [];
    hand.forEach((tile, i) => {
      const sides = [];
      if (tile[0] === this.leftEnd || tile[1] === this.leftEnd) sides.push('left');
      if (tile[0] === this.rightEnd || tile[1] === this.rightEnd) sides.push('right');
      if (sides.length) moves.push({ tileIndex: i, sides });
    });
    return moves;
  }

  playTile(seat, tileIndex, side) {
    if (this.currentTurn !== seat || this.roundOver) return { ok: false, error: 'ليس دورك الآن' };
    const hand = this.hands[seat];
    const tile = hand[tileIndex];
    if (!tile) return { ok: false, error: 'قطعة غير صالحة' };

    if (this.board.length === 0) {
      if (this.forcedFirstTile !== null && tileIndex !== this.forcedFirstTile) {
        return { ok: false, error: 'يجب أن تبدأ الجولة بقطعة الدبل (6-6)' };
      }
      this.board.push({ a: tile[0], b: tile[1] });
      this.leftEnd = tile[0];
      this.rightEnd = tile[1];
    } else {
      if (side !== 'left' && side !== 'right') return { ok: false, error: 'حدد جهة اللعب' };
      const val = side === 'left' ? this.leftEnd : this.rightEnd;
      if (tile[0] !== val && tile[1] !== val) {
        return { ok: false, error: 'هذه القطعة لا تطابق طرف الطاولة' };
      }
      const other = tile[0] === val ? tile[1] : tile[0];
      if (side === 'left') {
        this.board.unshift({ a: other, b: val });
        this.leftEnd = other;
      } else {
        this.board.push({ a: val, b: other });
        this.rightEnd = other;
      }
    }

    hand.splice(tileIndex, 1);
    this.forcedFirstTile = null;
    this.passCount = 0;
    this.lastAction = { type: 'play', seat, tile };

    if (hand.length === 0) {
      this._endRound(seat, 'domino');
      return { ok: true, roundOver: true, gameOver: this.gameOver };
    }

    this._advanceTurn();
    return { ok: true };
  }

  pass(seat) {
    if (this.currentTurn !== seat || this.roundOver) return { ok: false, error: 'ليس دورك الآن' };
    if (this.getValidMoves(seat).length > 0) {
      return { ok: false, error: 'لديك حركة متاحة، لا يمكنك التمرير' };
    }
    this.lastAction = { type: 'pass', seat };
    this.passCount += 1;
    if (this.passCount >= 4) {
      this._endRound(null, 'blocked');
      return { ok: true, roundOver: true, gameOver: this.gameOver };
    }
    this._advanceTurn();
    return { ok: true };
  }

  _advanceTurn() {
    this.currentTurn = (this.currentTurn + 1) % 4;
  }

  _endRound(winnerSeat, reason) {
    this.roundOver = true;
    let pointsAwarded = 0;
    let winningTeam = null;

    if (reason === 'domino') {
      winningTeam = this.teamOf(winnerSeat);
      const otherTeam = winningTeam === 0 ? 1 : 0;
      for (let s = 0; s < 4; s++) {
        if (this.teamOf(s) === otherTeam) {
          pointsAwarded += this.hands[s].reduce((sum, t) => sum + tilePips(t), 0);
        }
      }
      this.teamScores[winningTeam] += pointsAwarded;
      this.roundResult = { reason, winnerSeat, winningTeam, pointsAwarded };
      this.nextStarter = winnerSeat;
    } else {
      const totals = [0, 0];
      for (let s = 0; s < 4; s++) {
        totals[this.teamOf(s)] += this.hands[s].reduce((sum, t) => sum + tilePips(t), 0);
      }
      if (totals[0] < totals[1]) {
        winningTeam = 0;
        pointsAwarded = totals[1] - totals[0];
      } else if (totals[1] < totals[0]) {
        winningTeam = 1;
        pointsAwarded = totals[0] - totals[1];
      }
      if (winningTeam !== null) this.teamScores[winningTeam] += pointsAwarded;

      let bestSeat = 0, bestPips = Infinity;
      const candidates = winningTeam !== null
        ? [0, 1, 2, 3].filter(s => this.teamOf(s) === winningTeam)
        : [0, 1, 2, 3];
      candidates.forEach(s => {
        const pips = this.hands[s].reduce((sum, t) => sum + tilePips(t), 0);
        if (pips < bestPips) { bestPips = pips; bestSeat = s; }
      });
      this.roundResult = { reason, winningTeam, pointsAwarded, totals };
      this.nextStarter = bestSeat;
    }

    if (this.teamScores[0] >= this.targetScore || this.teamScores[1] >= this.targetScore) {
      this.gameOver = true;
      if (this.teamScores[0] >= this.targetScore && this.teamScores[1] >= this.targetScore) {
        this.winningTeam = this.teamScores[0] > this.teamScores[1] ? 0 : 1;
      } else {
        this.winningTeam = this.teamScores[0] >= this.targetScore ? 0 : 1;
      }
    }
  }

  getStateForSeat(seat) {
    return {
      hand: this.hands[seat],
      handCounts: this.hands.map(h => h.length),
      board: this.board,
      leftEnd: this.leftEnd,
      rightEnd: this.rightEnd,
      currentTurn: this.currentTurn,
      teamScores: this.teamScores,
      targetScore: this.targetScore,
      round: this.round,
      roundOver: this.roundOver,
      roundResult: this.roundResult || null,
      gameOver: this.gameOver,
      winningTeam: this.gameOver ? this.winningTeam : null,
      lastAction: this.lastAction,
      validMoves: this.getValidMoves(seat),
      passCount: this.passCount
    };
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { DominoGame, createDeck, tilePips, TARGET_SCORES };
}
