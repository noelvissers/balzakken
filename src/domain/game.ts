export type GameStatus = 'active' | 'finished'

export const MAX_PLAYERS = 6

export interface Player {
  id: string
  name: string
  score: number
}

export interface GameFrame {
  players: Player[]
  dealerId: string | null
  roundNumber: number
  status: GameStatus
  winnerId: string | null
}

export interface CompletedRound {
  roundNumber: number
  callerId: string
  hands: Record<string, number>
  scoreChanges: Record<string, number>
  scoresAfter: Record<string, number>
  eliminatedIds: string[]
  dealerBeforeId: string
  dealerAfterId: string | null
  before: GameFrame
}

export interface GameState extends GameFrame {
  rounds: CompletedRound[]
}

export type RandomSource = () => number

export interface NewRoundInput {
  callerId: string
  hands: Record<string, number>
}

export type ScoreChange = 'normal' | 'penalty' | 'none'

const THRESHOLDS = new Set([50, 75, 100])

export function applyScoreChange(score: number, value: number, kind: ScoreChange): number {
  if (kind === 'none') return score
  if (kind === 'penalty') {
    const result = score + 25
    if (!Number.isSafeInteger(result)) throw new Error('The resulting score exceeds the safe integer range.')
    return result
  }
  const total = score + value
  if (total >= 0 && !Number.isSafeInteger(total)) {
    throw new Error('The resulting score exceeds the safe integer range.')
  }
  const result = Math.max(0, total)
  return THRESHOLDS.has(result) ? Math.max(0, result - 25) : result
}

export function createGame(
  players: Array<{ id: string; name: string }>,
  random: RandomSource = Math.random,
): GameState {
  if (players.length < 2) throw new Error('At least two players are required.')
  if (players.length > MAX_PLAYERS) throw new Error(`At most ${MAX_PLAYERS} players are allowed.`)
  const ids = players.map((player) => player.id)
  if (new Set(ids).size !== ids.length || ids.some((id) => !id.trim())) {
    throw new Error('Player IDs must be non-empty and unique.')
  }
  if (players.some((player) => !player.name.trim())) {
    throw new Error('Player names must not be empty.')
  }

  return {
    players: players.map(({ id, name }) => ({ id, name: name.trim(), score: 0 })),
    dealerId: choose(ids, random),
    roundNumber: 1,
    status: 'active',
    winnerId: null,
    rounds: [],
  }
}

export function submitRound(
  game: GameState,
  input: NewRoundInput,
  random: RandomSource = Math.random,
): GameState {
  if (game.status !== 'active') throw new Error('The game is finished.')
  const participants = activePlayers(game)
  if (participants.length < 2) {
    throw new Error('At least two active players are required for a round.')
  }

  const participantIds = participants.map((player) => player.id)
  if (!participantIds.includes(input.callerId)) {
    throw new Error('The caller must be an active player.')
  }
  const suppliedIds = Object.keys(input.hands)
  if (
    suppliedIds.length !== participantIds.length ||
    participantIds.some((id) => !Object.hasOwn(input.hands, id))
  ) {
    throw new Error('Enter one hand value for every active player.')
  }
  if (participantIds.some((id) => !Number.isSafeInteger(input.hands[id]))) {
    throw new Error('Hand values must be safe integers.')
  }

  const callerHand = input.hands[input.callerId]
  const callerTooHigh = callerHand > 5
  const otherHands = participantIds
    .filter((id) => id !== input.callerId)
    .map((id) => input.hands[id])
  const tiedOrLowerHand = otherHands.some((hand) => hand <= callerHand)
  // Above 5, only the caller is penalized; a low tie penalizes the caller while others score normally.
  const penaltyMode = callerTooHigh || tiedOrLowerHand
  const changes: Record<string, number> = {}
  const scoresAfter: Record<string, number> = {}

  for (const player of game.players) {
    if (!participantIds.includes(player.id)) {
      changes[player.id] = 0
      scoresAfter[player.id] = player.score
      continue
    }

    const isPenalty = penaltyMode && player.id === input.callerId
    const score = applyScoreChange(
      player.score,
      input.hands[player.id],
      callerTooHigh
        ? isPenalty ? 'penalty' : 'none'
        : isPenalty ? 'penalty' : 'normal',
    )
    scoresAfter[player.id] = score
    const change = score - player.score
    if (!Number.isSafeInteger(change)) throw new Error('The score change exceeds the safe integer range.')
    changes[player.id] = change
  }

  const eliminatedIds = game.players
    .filter((player) => player.score < 100 && scoresAfter[player.id] >= 100)
    .map((player) => player.id)
  const remaining = game.players.filter((player) => scoresAfter[player.id] < 100)
  const status: GameStatus = remaining.length <= 1 ? 'finished' : 'active'
  const winnerId = remaining.length === 1 ? remaining[0].id : null
  const dealerAfterId =
    status === 'active'
      ? chooseNextDealer(participants, input.hands, scoresAfter, random)
      : null

  const round: CompletedRound = {
    roundNumber: game.roundNumber,
    callerId: input.callerId,
    hands: { ...input.hands },
    scoreChanges: changes,
    scoresAfter,
    eliminatedIds,
    dealerBeforeId: game.dealerId!,
    dealerAfterId,
    before: frameOf(game),
  }

  return {
    players: game.players.map((player) => ({ ...player, score: scoresAfter[player.id] })),
    dealerId: dealerAfterId,
    roundNumber: game.roundNumber + 1,
    status,
    winnerId,
    rounds: [...game.rounds, round],
  }
}

export function undoLastRound(game: GameState): GameState {
  const lastRound = game.rounds.at(-1)
  if (!lastRound) throw new Error('There is no completed round to undo.')
  return {
    ...lastRound.before,
    players: lastRound.before.players.map((player) => ({ ...player })),
    rounds: game.rounds.slice(0, -1),
  }
}

export function activePlayers(game: GameState): Player[] {
  return game.players.filter((player) => player.score < 100)
}

export function frameOf(game: GameState): GameFrame {
  return {
    players: game.players.map((player) => ({ ...player })),
    dealerId: game.dealerId,
    roundNumber: game.roundNumber,
    status: game.status,
    winnerId: game.winnerId,
  }
}

function choose<T>(items: T[], random: RandomSource): T {
  const value = random()
  if (!Number.isFinite(value) || value < 0 || value >= 1) {
    throw new Error('Random source must return a number in [0, 1).')
  }
  return items[Math.floor(value * items.length)]
}

function chooseNextDealer(
  participants: Player[],
  hands: Record<string, number>,
  scoresAfter: Record<string, number>,
  random: RandomSource,
): string {
  const eligible = participants.filter((player) => scoresAfter[player.id] < 100)
  const highestHand = Math.max(...eligible.map((player) => hands[player.id]))
  const tied = eligible
    .filter((player) => hands[player.id] === highestHand)
    .map((player) => player.id)
  return choose(tied, random)
}