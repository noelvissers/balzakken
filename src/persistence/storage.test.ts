import { describe, expect, it } from 'vitest'
import { createGame, submitRound } from '../domain/game'
import {
  clearSavedGame,
  loadSavedGame,
  saveGame,
  STORAGE_KEY,
  type StorageLike,
} from './storage'

class MemoryStorage implements StorageLike {
  values = new Map<string, string>()

  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value)
  }

  removeItem(key: string): void {
    this.values.delete(key)
  }
}

const roster = [
  { id: 'a', name: 'Ada' },
  { id: 'b', name: 'Bert' },
  { id: 'c', name: 'Cam' },
]

function completedGame() {
  return submitRound(createGame(roster, () => 0), {
    callerId: 'a',
    hands: { a: 1, b: 3, c: 4 },
  }, () => 0.75)
}

describe('local game persistence', () => {
  it('round-trips the full game state and its undo snapshot', () => {
    const storage = new MemoryStorage()
    const game = completedGame()
    expect(saveGame(game, storage).ok).toBe(true)
    expect(storage.values.has(STORAGE_KEY)).toBe(true)
    expect(loadSavedGame(storage)).toEqual({ game, warning: null })
  })

  it('restores committed state as it would after a refresh', () => {
    const storage = new MemoryStorage()
    saveGame(completedGame(), storage)
    const refreshed = loadSavedGame(storage).game
    expect(refreshed?.roundNumber).toBe(2)
    expect(refreshed?.dealerId).toBe('c')
    expect(refreshed?.rounds).toHaveLength(1)
  })

  it('restores six players and silently ignores oversized saves without deleting them', () => {
    const storage = new MemoryStorage()
    const players = Array.from({ length: 6 }, (_, index) => ({ id: `p${index}`, name: `Player ${index}` }))
    const game = createGame(players, () => 0)
    saveGame(game, storage)
    expect(loadSavedGame(storage)).toEqual({ game, warning: null })

    game.players.push({ id: 'extra', name: 'Extra', score: 0 })
    saveGame(game, storage)
    const saved = storage.getItem(STORAGE_KEY)
    expect(loadSavedGame(storage)).toEqual({ game: null, warning: null })
    expect(storage.getItem(STORAGE_KEY)).toBe(saved)
  })

  it('does not reroll or recalculate a finished game on restore', () => {
    const game = submitRound(createGame(roster.slice(0, 2), () => 0), {
      callerId: 'b',
      hands: { a: 1, b: 5 },
    })
    const storage = new MemoryStorage()
    saveGame(game, storage)
    expect(loadSavedGame(storage).game).toEqual(game)
  })

  it('handles absent, malformed, and unsupported data safely', () => {
    const storage = new MemoryStorage()
    expect(loadSavedGame(storage)).toEqual({ game: null, warning: null })
    storage.values.set(STORAGE_KEY, '{bad json')
    expect(loadSavedGame(storage).warning).toBeTypeOf('string')
    storage.values.set(STORAGE_KEY, JSON.stringify({ version: 22, game: completedGame() }))
    expect(loadSavedGame(storage).warning).toBeTypeOf('string')
  })

  it('rejects invalid game data and inconsistent history', () => {
    const storage = new MemoryStorage()
    storage.values.set(STORAGE_KEY, JSON.stringify({ version: 1, game: { players: [], rounds: [] } }))
    expect(loadSavedGame(storage).warning).toBeTypeOf('string')

    const corrupt = structuredClone(completedGame())
    corrupt.players[0].score += 1
    storage.values.set(STORAGE_KEY, JSON.stringify({ version: 1, game: corrupt }))
    expect(loadSavedGame(storage).warning).toBeTypeOf('string')
  })

  it('reports read, write, and clear failures without throwing', () => {
    const failingStorage: StorageLike = {
      getItem: () => { throw new Error('blocked') },
      setItem: () => { throw new Error('quota') },
      removeItem: () => { throw new Error('blocked') },
    }
    expect(loadSavedGame(failingStorage).warning).toBeTypeOf('string')
    expect(saveGame(completedGame(), failingStorage)).toMatchObject({ ok: false })
    expect(clearSavedGame(failingStorage)).toMatchObject({ ok: false })
  })

  it('removes the single active-game key when clearing', () => {
    const storage = new MemoryStorage()
    saveGame(completedGame(), storage)
    expect(clearSavedGame(storage)).toEqual({ ok: true, warning: null })
    expect(storage.values.size).toBe(0)
  })
})