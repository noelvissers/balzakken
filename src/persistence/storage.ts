import { MAX_PLAYERS, type CompletedRound, type GameFrame, type GameState, type Player } from '../domain/game'

export const STORAGE_KEY = 'card-game-active'
const STORAGE_VERSION = 1

export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export interface LoadGameResult {
  game: GameState | null
  warning: string | null
}

export interface StorageResult {
  ok: boolean
  warning: string | null
}

export function loadSavedGame(storage = browserStorage()): LoadGameResult {
  if (!storage) return { game: null, warning: 'Browser storage is unavailable; this game cannot be restored after a refresh.' }

  let serialized: string | null
  try {
    serialized = storage.getItem(STORAGE_KEY)
  } catch {
    return { game: null, warning: 'The saved game could not be read from browser storage.' }
  }
  if (serialized === null) return { game: null, warning: null }

  let payload: unknown
  try {
    payload = JSON.parse(serialized)
  } catch {
    return { game: null, warning: 'The saved game is malformed and could not be restored.' }
  }
  if (!isRecord(payload) || payload.version !== STORAGE_VERSION) {
    return { game: null, warning: 'The saved game uses an unsupported format and could not be restored.' }
  }

  if (isRecord(payload.game) && Array.isArray(payload.game.players) && payload.game.players.length > MAX_PLAYERS) {
    return { game: null, warning: null }
  }

  const game = validateGame(payload.game)
  return game
    ? { game, warning: null }
    : { game: null, warning: 'The saved game is invalid and could not be restored.' }
}

export function saveGame(game: GameState, storage = browserStorage()): StorageResult {
  if (!storage) return { ok: false, warning: 'This game could not be saved because browser storage is unavailable.' }
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify({ version: STORAGE_VERSION, game }))
    return { ok: true, warning: null }
  } catch {
    return { ok: false, warning: 'This game could not be saved. Keep this tab open to avoid losing progress.' }
  }
}

export function clearSavedGame(storage = browserStorage()): StorageResult {
  if (!storage) return { ok: false, warning: 'The saved game could not be cleared from browser storage.' }
  try {
    storage.removeItem(STORAGE_KEY)
    return { ok: true, warning: null }
  } catch {
    return { ok: false, warning: 'The saved game could not be cleared from browser storage.' }
  }
}

function browserStorage(): StorageLike | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage
  } catch {
    return undefined
  }
}

function validateGame(value: unknown): GameState | null {
  if (!isRecord(value) || !Array.isArray(value.players) || !Array.isArray(value.rounds)) return null
  const players = value.players.map(validatePlayer)
  if (players.some((player) => player === null)) return null
  const validPlayers = players as Player[]
  const ids = validPlayers.map((player) => player.id)
  if (new Set(ids).size !== ids.length || validPlayers.length < 2 || validPlayers.length > MAX_PLAYERS) return null

  const frame = validateFrame({
    players: validPlayers,
    dealerId: value.dealerId,
    roundNumber: value.roundNumber,
    status: value.status,
    winnerId: value.winnerId,
  })
  if (!frame) return null

  const rounds: CompletedRound[] = []
  for (let index = 0; index < value.rounds.length; index += 1) {
    const round = validateRound(value.rounds[index], ids, index)
    if (!round) return null
    if (index > 0 && !framesMatch(round.before, frameAfterRound(rounds[index - 1]))) return null
    rounds.push(round)
  }

  if (rounds.length === 0) {
    if (
      frame.roundNumber !== 1 ||
      frame.status !== 'active' ||
      frame.winnerId !== null ||
      frame.players.some((player) => player.score !== 0)
    ) return null
  } else if (!framesMatch(frame, frameAfterRound(rounds.at(-1)!))) {
    return null
  }

  return { ...frame, rounds }
}

function validatePlayer(value: unknown): Player | null {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    !value.id.trim() ||
    typeof value.name !== 'string' ||
    !value.name.trim() ||
    !isNonnegativeSafeInteger(value.score)
  ) return null
  return { id: value.id, name: value.name, score: value.score }
}

function validateFrame(value: unknown): GameFrame | null {
  if (
    !isRecord(value) ||
    !Array.isArray(value.players) ||
    value.players.length < 2 ||
    value.players.length > MAX_PLAYERS ||
    !value.players.every((player) => validatePlayer(player) !== null) ||
    !Number.isSafeInteger(value.roundNumber) ||
    (value.roundNumber as number) < 1 ||
    (value.status !== 'active' && value.status !== 'finished')
  ) return null

  const players = value.players.map((player) => validatePlayer(player)!)
  if (new Set(players.map((player) => player.id)).size !== players.length) return null
  const active = players.filter((player) => player.score < 100)
  if (value.status === 'active') {
    if (
      active.length < 2 ||
      typeof value.dealerId !== 'string' ||
      !active.some((player) => player.id === value.dealerId) ||
      value.winnerId !== null
    ) return null
  } else if (
    value.dealerId !== null ||
    (active.length === 1 ? value.winnerId !== active[0].id : value.winnerId !== null) ||
    active.length > 1
  ) return null

  return {
    players,
    dealerId: value.dealerId as string | null,
    roundNumber: value.roundNumber as number,
    status: value.status,
    winnerId: value.winnerId as string | null,
  }
}

function validateRound(value: unknown, ids: string[], index: number): CompletedRound | null {
  if (
    !isRecord(value) ||
    !isRecord(value.hands) ||
    !isRecord(value.scoreChanges) ||
    !isRecord(value.scoresAfter) ||
    !Array.isArray(value.eliminatedIds)
  ) return null

  const before = validateFrame(value.before)
  if (!before || before.status !== 'active' || before.roundNumber !== index + 1) return null
  const hands = value.hands as Record<string, unknown>
  const rawScoresAfter = value.scoresAfter as Record<string, unknown>
  const rawScoreChanges = value.scoreChanges as Record<string, unknown>
  const beforeIds = before.players.map((player) => player.id)
  if (!sameItems(beforeIds, ids)) return null
  const participants = before.players.filter((player) => player.score < 100).map((player) => player.id)
  if (
    !Number.isSafeInteger(value.roundNumber) ||
    value.roundNumber !== index + 1 ||
    typeof value.callerId !== 'string' ||
    !participants.includes(value.callerId) ||
    !sameItems(Object.keys(hands), participants) ||
    participants.some((id) => !Number.isSafeInteger(hands[id])) ||
    value.dealerBeforeId !== before.dealerId ||
    !sameItems(Object.keys(rawScoresAfter), ids) ||
    !sameItems(Object.keys(rawScoreChanges), ids) ||
    ids.some((id) => !isNonnegativeSafeInteger(rawScoresAfter[id]) || !Number.isSafeInteger(rawScoreChanges[id]))
  ) return null

  const scoresAfter = rawScoresAfter as Record<string, number>
  const scoreChanges = rawScoreChanges as Record<string, number>
  if (before.players.some((player) => scoresAfter[player.id] - player.score !== scoreChanges[player.id])) return null

  const eliminatedIds = before.players
    .filter((player) => player.score < 100 && scoresAfter[player.id] >= 100)
    .map((player) => player.id)
  if (!sameItems(value.eliminatedIds as string[], eliminatedIds)) return null

  const remaining = before.players.filter((player) => scoresAfter[player.id] < 100)
  const finished = remaining.length <= 1
  const dealerAfterId = value.dealerAfterId
  if (finished) {
    if (dealerAfterId !== null) return null
  } else {
    if (typeof dealerAfterId !== 'string') return null
    const eligible = participants.filter((id) => scoresAfter[id] < 100)
    const highest = Math.max(...eligible.map((id) => hands[id] as number))
    if (!eligible.some((id) => id === dealerAfterId && hands[id] === highest)) return null
  }

  return {
    roundNumber: value.roundNumber as number,
    callerId: value.callerId,
    hands: hands as Record<string, number>,
    scoreChanges,
    scoresAfter,
    eliminatedIds,
    dealerBeforeId: value.dealerBeforeId as string,
    dealerAfterId: dealerAfterId as string | null,
    before,
  }
}

function frameAfterRound(round: CompletedRound): GameFrame {
  const players = round.before.players.map((player) => ({
    ...player,
    score: round.scoresAfter[player.id],
  }))
  const active = players.filter((player) => player.score < 100)
  return {
    players,
    dealerId: round.dealerAfterId,
    roundNumber: round.roundNumber + 1,
    status: active.length <= 1 ? 'finished' : 'active',
    winnerId: active.length === 1 ? active[0].id : null,
  }
}

function framesMatch(left: GameFrame, right: GameFrame): boolean {
  return (
    left.dealerId === right.dealerId &&
    left.roundNumber === right.roundNumber &&
    left.status === right.status &&
    left.winnerId === right.winnerId &&
    left.players.length === right.players.length &&
    left.players.every((player, index) =>
      player.id === right.players[index].id &&
      player.name === right.players[index].name &&
      player.score === right.players[index].score,
    )
  )
}

function sameItems(left: string[], right: string[]): boolean {
  return left.length === right.length && right.every((item) => left.includes(item))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonnegativeSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0
}