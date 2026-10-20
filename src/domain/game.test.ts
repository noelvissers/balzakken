import { describe, expect, it } from 'vitest'
import {
  activePlayers,
  applyScoreChange,
  createGame,
  submitRound,
  undoLastRound,
  type GameState,
} from './game'

const roster = [
  { id: 'a', name: 'Ada' },
  { id: 'b', name: 'Bert' },
  { id: 'c', name: 'Cam' },
]

function gameWithScores(scores: number[], names = roster): GameState {
  const game = createGame(names, () => 0)
  return {
    ...game,
    players: game.players.map((player, index) => ({ ...player, score: scores[index] })),
  }
}

describe('createGame', () => {
  it('starts at zero and chooses a deterministic first dealer', () => {
    const game = createGame(roster, () => 0.75)
    expect(game.players.map((player) => player.score)).toEqual([0, 0, 0])
    expect(game.dealerId).toBe('c')
    expect(game.roundNumber).toBe(1)
    expect(game.rounds).toEqual([])
  })

  it('rejects fewer than two players and duplicate IDs', () => {
    expect(() => createGame(roster.slice(0, 1))).toThrow()
    expect(() => createGame([{ id: 'x', name: 'One' }, { id: 'x', name: 'Two' }])).toThrow()
  })

  it('allows six players but rejects seven', () => {
    const players = Array.from({ length: 7 }, (_, index) => ({ id: `p${index}`, name: `Player ${index}` }))
    expect(createGame(players.slice(0, 6)).players).toHaveLength(6)
    expect(() => createGame(players)).toThrow()
  })

  it('rejects blank names but allows duplicate display names', () => {
    expect(() => createGame([{ id: 'a', name: '  ' }, { id: 'b', name: 'Bert' }])).toThrow()
    expect(createGame([{ id: 'a', name: 'Sam' }, { id: 'b', name: 'Sam' }]).players.map((player) => player.name)).toEqual(['Sam', 'Sam'])
  })

  it('rejects an invalid random source', () => {
    expect(() => createGame(roster, () => 1)).toThrow()
  })
})

describe('round scoring', () => {
  it('gives the caller a special penalty above 5 and gives everyone else zero', () => {
    const game = submitRound(gameWithScores([0, 10, 20]), {
      callerId: 'a',
      hands: { a: 6, b: 2, c: 3 },
    })
    expect(game.rounds[0].scoreChanges).toEqual({ a: 25, b: 0, c: 0 })
    expect(game.players.map((player) => player.score)).toEqual([25, 10, 20])
  })

  it('penalizes a caller on 5 when tied with another player', () => {
    const game = submitRound(gameWithScores([0, 0, 0]), {
      callerId: 'a',
      hands: { a: 5, b: 5, c: 7 },
    })
    expect(game.rounds[0].scoreChanges).toEqual({ a: 25, b: 5, c: 7 })
  })

  it('scores everyone normally when the caller is the unique low hand of 5', () => {
    const game = submitRound(gameWithScores([0, 0, 0]), {
      callerId: 'a',
      hands: { a: 5, b: 6, c: 9 },
    })
    expect(game.rounds[0].scoreChanges).toEqual({ a: 5, b: 6, c: 9 })
  })

  it('supports negative hand values and clamps scores at zero', () => {
    const game = submitRound(gameWithScores([2, 4, 0]), {
      callerId: 'a',
      hands: { a: -3, b: -2, c: 1 },
    })
    expect(game.players.map((player) => player.score)).toEqual([0, 2, 1])
  })

  it.each([
    [48, 25],
    [73, 50],
    [98, 75],
  ])('deducts 25 when normal scoring lands exactly on a threshold from %i', (score, expected) => {
    const game = submitRound(gameWithScores([score, 0, 0]), {
      callerId: 'a',
      hands: { a: 2, b: 3, c: 4 },
    })
    expect(game.players[0].score).toBe(expected)
  })

  it('does not deduct when normal scoring crosses a threshold without landing on it', () => {
    const game = submitRound(gameWithScores([49, 0, 0]), {
      callerId: 'a',
      hands: { a: 2, b: 3, c: 4 },
    })
    expect(game.players[0].score).toBe(51)
  })

  it('does not apply the normal threshold deduction to a +25 penalty at 75', () => {
    const game = submitRound(gameWithScores([75, 0, 0]), {
      callerId: 'a',
      hands: { a: 6, b: 7, c: 8 },
    })
    expect(game.players[0].score).toBe(100)
    expect(game.rounds[0].eliminatedIds).toContain('a')
  })

  it('does not apply threshold logic to a +25 penalty at 100', () => {
    expect(applyScoreChange(100, 0, 'penalty')).toBe(125)
  })

  it('allows normal scoring to cross 100 and eliminates at 100 or higher', () => {
    const game = submitRound(gameWithScores([99, 0, 0]), {
      callerId: 'a',
      hands: { a: 2, b: 3, c: 4 },
    })
    expect(game.players[0].score).toBe(101)
    expect(game.rounds[0].eliminatedIds).toEqual(['a'])
    expect(activePlayers(game).map((player) => player.id)).toEqual(['b', 'c'])
  })

  it('retains eliminated players without including them in later rounds', () => {
    const game = submitRound(gameWithScores([100, 0, 0]), {
      callerId: 'b',
      hands: { b: 1, c: 2 },
    })
    expect(game.players[0].score).toBe(100)
    expect(game.rounds[0].hands).not.toHaveProperty('a')
  })

  it('rejects missing, fractional, unsafe, or ineligible hand submissions without mutation', () => {
    const game = gameWithScores([0, 0, 0])
    const before = structuredClone(game)
    expect(() => submitRound(game, { callerId: 'a', hands: { a: 1, b: 2 } })).toThrow()
    expect(() => submitRound(game, { callerId: 'a', hands: { a: 1.5, b: 2, c: 3 } })).toThrow()
    expect(() => submitRound(game, { callerId: 'a', hands: { a: Number.MAX_SAFE_INTEGER + 1, b: 2, c: 3 } })).toThrow()
    expect(() => submitRound(game, { callerId: 'gone', hands: { a: 1, b: 2, c: 3 } })).toThrow()
    expect(game).toEqual(before)
  })

  it('rejects score arithmetic outside the safe integer range without mutating the game', () => {
    const game = gameWithScores([0, 1, 0])
    const before = structuredClone(game)
    expect(() => submitRound(game, {
      callerId: 'a',
      hands: { a: 5, b: Number.MAX_SAFE_INTEGER, c: 6 },
    })).toThrow()
    expect(game).toEqual(before)
  })
})

describe('dealer selection and undo', () => {
  it('chooses uniformly among tied highest hands using the injected random source', () => {
    const game = submitRound(gameWithScores([0, 0, 0]), {
      callerId: 'a',
      hands: { a: 1, b: 9, c: 9 },
    }, () => 0.75)
    expect(game.dealerId).toBe('c')
  })

  it('excludes a player eliminated that round when choosing the next dealer', () => {
    const game = submitRound(gameWithScores([99, 0, 0]), {
      callerId: 'a',
      hands: { a: 2, b: 9, c: 9 },
    }, () => 0.75)
    expect(game.rounds[0].eliminatedIds).toEqual(['a'])
    expect(game.dealerId).toBe('c')
  })

  it('undoes a round that eliminated a player and restores the complete prior state', () => {
    const initial = gameWithScores([0, 75])
    const twoPlayerGame = { ...initial, players: initial.players.slice(0, 2) }
    const completed = submitRound(twoPlayerGame, {
      callerId: 'b',
      hands: { a: 1, b: 5 },
    })
    expect(completed.status).toBe('finished')
    expect(completed.winnerId).toBe('a')
    expect(undoLastRound(completed)).toEqual(twoPlayerGame)
  })

  it('undoes the round that ended the game', () => {
    const initial = gameWithScores([0, 75])
    const twoPlayerGame = { ...initial, players: initial.players.slice(0, 2) }
    const completed = submitRound(twoPlayerGame, {
      callerId: 'b',
      hands: { a: 1, b: 5 },
    })
    const restored = undoLastRound(completed)
    expect(restored.status).toBe('active')
    expect(restored.roundNumber).toBe(1)
    expect(restored.dealerId).toBe(twoPlayerGame.dealerId)
    expect(restored.players.map((player) => player.score)).toEqual([0, 75])
  })

  it('ends with no winner when every player is eliminated in one round', () => {
    const game = submitRound(gameWithScores([99, 99, 99]), {
      callerId: 'a',
      hands: { a: 2, b: 3, c: 4 },
    })
    expect(game.status).toBe('finished')
    expect(game.winnerId).toBeNull()
    expect(game.dealerId).toBeNull()
  })
})