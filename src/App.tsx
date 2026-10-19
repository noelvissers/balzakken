import { useLayoutEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { ArrowLeft, ArrowRight, Minus, Plus } from 'lucide-react'
import {
  activePlayers,
  createGame,
  MAX_PLAYERS,
  submitRound,
  undoLastRound,
  type GameState,
  type NewRoundInput,
} from './domain/game'
import { clearSavedGame, loadSavedGame, saveGame } from './persistence/storage'
import './App.css'

type Screen = 'welcome' | 'setup' | 'game'
type DraftPlayer = { id: string; name: string }
let idSequence = 0

function isValidHandValue(value: string): boolean {
  return /^-?\d+$/.test(value) && Number.isSafeInteger(Number(value))
}

function makeId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `player-${Date.now()}-${idSequence++}`
}

function newDraft(): DraftPlayer[] {
  return [{ id: makeId(), name: '' }, { id: makeId(), name: '' }]
}

function App() {
  const [initialLoad] = useState(loadSavedGame)
  const [game, setGame] = useState<GameState | null>(initialLoad.game)
  const [screen, setScreen] = useState<Screen>('welcome')
  const [draftPlayers, setDraftPlayers] = useState<DraftPlayer[]>(newDraft)
  const [storageWarning, setStorageWarning] = useState(initialLoad.warning)
  const [callerId, setCallerId] = useState('')
  const [handValues, setHandValues] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState('')
  const submissionLock = useRef(false)

  function commit(nextGame: GameState) {
    setGame(nextGame)
    setStorageWarning(saveGame(nextGame).warning)
  }

  function startNewGame(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const names = draftPlayers.map((player) => ({ id: player.id, name: player.name.trim() }))
    if (names.length < 2 || names.some((player) => !player.name)) {
      setFormError('Add at least two players and enter a name for each one.')
      return
    }
    try {
      const nextGame = createGame(names)
      setFormError('')
      setCallerId('')
      setHandValues({})
      commit(nextGame)
      setScreen('game')
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'The game could not be started.')
    }
  }

  function nextRound(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!game || submissionLock.current) return
    const participants = activePlayers(game)
    const hands: Record<string, number> = {}
    for (const player of participants) {
      const value = handValues[player.id] ?? ''
      if (!isValidHandValue(value)) {
        setFormError(`Enter a safe whole number for ${player.name}.`)
        return
      }
      hands[player.id] = Number(value)
    }
    if (!callerId) {
      setFormError('Select the player who called win.')
      return
    }

    try {
      submissionLock.current = true
      const input: NewRoundInput = { callerId, hands }
      commit(submitRound(game, input))
      setHandValues({})
      setCallerId('')
      setFormError('')
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'The round could not be calculated.')
    } finally {
      submissionLock.current = false
    }
  }

  function undoRound() {
    const round = game?.rounds.at(-1)
    if (!game || !round) return
    const previousGame = undoLastRound(game)
    commit(previousGame)
    setHandValues(Object.fromEntries(Object.entries(round.hands).map(([id, value]) => [id, String(value)])))
    setCallerId(round.callerId)
    setFormError('')
  }

  function undoAction() {
    if (callerId) {
      setCallerId('')
      setFormError('')
    } else {
      undoRound()
    }
  }

  function quitGame() {
    if (!game) return
    if (game.status === 'active' && !window.confirm('Quit this game and remove its saved progress?')) return
    const cleared = clearSavedGame()
    setStorageWarning(cleared.warning)
    setGame(null)
    setScreen('welcome')
  }

  function playAgain() {
    if (!game) return
    const rematch = createGame(game.players.map(({ name }) => ({ id: makeId(), name })))
    commit(rematch)
    setCallerId('')
    setHandValues({})
  }

  if (screen === 'welcome') {
    return (
      <main className="app-shell">
        <Header />
        {storageWarning && <p role="alert" className="notice">{storageWarning}</p>}
        <section className="welcome-panel" aria-labelledby="welcome-title">
          <p className="eyebrow">OFFLINE SCOREKEEPER</p>
          <h1 id="welcome-title">Card Game Scorekeeper</h1>
          <p className="intro">Keep every hand, score, and dealer change in one place.</p>
          <div className="welcome-actions">
            <button className="button button-primary" onClick={() => {
              setDraftPlayers(newDraft())
              setFormError('')
              setScreen('setup')
            }}>New Game</button>
            {game && <button className="button" onClick={() => setScreen('game')}>Resume Game</button>}
          </div>
        </section>
      </main>
    )
  }

  if (screen === 'setup') {
    return (
      <main className="app-shell game-shell">
        <Header />
        <section className="page-content" aria-labelledby="setup-title">
          <h1 id="setup-title">New game</h1>
          <form onSubmit={startNewGame}>
            <div className="player-editor">
              {draftPlayers.map((player, index) => (
                <div className="player-edit-row" key={player.id}>
                  <label htmlFor={`player-${player.id}`}>Player {index + 1}</label>
                  <input
                    id={`player-${player.id}`}
                    value={player.name}
                    maxLength={40}
                    autoComplete="off"
                    onChange={(event) => setDraftPlayers((players) => players.map((entry) =>
                      entry.id === player.id ? { ...entry, name: event.target.value } : entry,
                    ))}
                  />
                  <button
                    className="button player-control"
                    type="button"
                    aria-label={`Remove ${player.name || `player ${index + 1}`}`}
                    title={`Remove ${player.name || `player ${index + 1}`}`}
                    disabled={draftPlayers.length <= 2}
                    onClick={() => setDraftPlayers((players) => players.filter((entry) => entry.id !== player.id))}
                  ><Minus size={20} aria-hidden="true" /></button>
                </div>
              ))}
              <div className="player-add-row">
                <button className="button player-control" type="button" aria-label="Add player" title="Add player" disabled={draftPlayers.length >= MAX_PLAYERS} onClick={() => setDraftPlayers((players) => players.length < MAX_PLAYERS ? [...players, { id: makeId(), name: '' }] : players)}>
                  <Plus size={20} aria-hidden="true" />
                </button>
              </div>
            </div>
            {formError && <p className="form-error" role="alert">{formError}</p>}
            <button className="button button-primary next-round-button" type="submit" disabled={draftPlayers.length < 2 || draftPlayers.some((player) => !player.name.trim())}>
              Start game<ArrowRight size={20} aria-hidden="true" />
            </button>
          </form>
        </section>
        <button className="button undo-button" type="button" aria-label="Back" title="Back" onClick={() => setScreen('welcome')}>
          <ArrowLeft size={22} aria-hidden="true" />
        </button>
      </main>
    )
  }

  if (!game) {
    return (
      <main className="app-shell">
        <Header />
        <section className="page-content">
          <p role="alert">No active game is available.</p>
          <button className="button" onClick={() => setScreen('welcome')}>Return home</button>
        </section>
      </main>
    )
  }

  const players = game.players
  const handPlayers = players.filter((player) => player.score < 100)
  const canSubmitRound = Boolean(callerId) && handPlayers.every((player) => isValidHandValue(handValues[player.id] ?? ''))
  const currentRound = game.roundNumber
  const undoLabel = callerId ? 'Change win caller' : 'Undo Last Round'
  const canUndo = Boolean(callerId || game.rounds.length)

  return (
    <main className="app-shell game-shell">
      <Header title={game.status === 'active' ? `ROUND ${currentRound}` : undefined} onQuit={quitGame} />
      {storageWarning && <p role="alert" className="notice">{storageWarning}</p>}
      {game.status === 'finished' ? (
        <section className="page-content results" aria-label="Game results">
          <Scoreboard game={game} />
          <section className="chart-section" aria-labelledby="chart-title">
            <h2 id="chart-title">Score progression</h2>
            <ScoreChart game={game} />
          </section>
          <button className="button button-primary next-round-button" onClick={playAgain}>Play Again</button>
        </section>
      ) : (
        <section className="page-content" aria-label="Game">
          <form onSubmit={nextRound} className="round-form" noValidate>
            <Scoreboard game={game} callerId={callerId} entry={
              <tr aria-label={`Round ${currentRound} entry`}>
                {players.map((player) => (
                  <td key={player.id}>
                    {player.score >= 100 ? null : callerId ? (
                      <div className="hand-input">
                        <label className="sr-only" htmlFor={`hand-${player.id}`}>Hand for {player.name}</label>
                        <input
                          id={`hand-${player.id}`}
                          aria-label={`${player.name} hand value`}
                          type="text"
                          value={handValues[player.id] ?? ''}
                          onChange={(event) => setHandValues((values) => ({ ...values, [player.id]: event.target.value }))}
                        />
                      </div>
                    ) : (
                      <button className="button button-primary win-button" type="button" aria-label={`${player.name} calls WIN`} title={`${player.name} calls WIN`} onClick={() => {
                        setCallerId(player.id)
                        setFormError('')
                      }}>🃏</button>
                    )}
                  </td>
                ))}
              </tr>
            } />
            {formError && <p role="alert" className="form-error">{formError}</p>}
            {callerId && <button className="button button-primary next-round-button" type="submit" disabled={!canSubmitRound}>Next round<ArrowRight size={20} aria-hidden="true" /></button>}
          </form>
        </section>
      )}
      {canUndo && (
        <button className="button undo-button" type="button" onClick={undoAction} aria-label={undoLabel} title={undoLabel}>
          <ArrowLeft size={22} aria-hidden="true" />
        </button>
      )}
    </main>
  )
}

function Header({ title, onQuit }: { title?: string; onQuit?: () => void }) {
  return (
    <header className="app-header">
      <span className="header-brand"><span className="mark" aria-hidden="true">♠</span><span>Table Score</span></span>
      {title && <span className="header-title">{title}</span>}
      {onQuit && <button className="button button-subtle header-quit" onClick={onQuit}>Quit</button>}
    </header>
  )
}

function roundAdjustment(round: GameState['rounds'][number], playerId: string): 'penalty' | 'reduction' | undefined {
  const callerHand = round.hands[round.callerId]
  const callerPenalized = callerHand > 5 || Object.entries(round.hands).some(([id, hand]) => id !== round.callerId && hand <= callerHand)
  if (playerId === round.callerId && callerPenalized) return 'penalty'
  if (callerHand > 5) return undefined
  const before = round.before.players.find((player) => player.id === playerId)
  if (before && Math.max(0, before.score + round.hands[playerId]) - round.scoresAfter[playerId] === 25) return 'reduction'
  return undefined
}

function FittedPlayerName({ name }: { name: string }) {
  const containerRef = useRef<HTMLSpanElement>(null)
  const textRef = useRef<HTMLSpanElement>(null)

  useLayoutEffect(() => {
    const container = containerRef.current!
    const text = textRef.current!
    let disposed = false
    function fit() {
      if (disposed) return
      text.style.fontSize = ''
      const available = container.getBoundingClientRect().width
      const natural = text.getBoundingClientRect().width
      if (available <= 0 || natural <= available) return
      const baseSize = Number.parseFloat(getComputedStyle(container).fontSize) || 16
      text.style.fontSize = `${Math.floor(baseSize * Math.max(0, available - 0.5) / natural * 100) / 100}px`
    }
    fit()
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(fit)
    observer?.observe(container)
    window.addEventListener('resize', fit)
    document.fonts?.addEventListener('loadingdone', fit)
    void document.fonts?.ready.then(fit)
    return () => {
      disposed = true
      observer?.disconnect()
      window.removeEventListener('resize', fit)
      document.fonts?.removeEventListener('loadingdone', fit)
    }
  }, [name])

  return <span className="player-name" ref={containerRef}><span className="player-name-text" ref={textRef}>{name}</span></span>
}

function Scoreboard({ game, callerId, entry }: { game: GameState; callerId?: string; entry?: ReactNode }) {
  const { players, dealerId, rounds } = game
  const playerTiles = (visible: boolean) => players.map((player) => (
    <th scope="col" key={player.id} className={player.score >= 100 ? 'is-eliminated' : undefined}>
      {visible ? <FittedPlayerName name={player.name} /> : <span className="player-name">{player.name}</span>}
      <span className="player-tags">
        {player.id === dealerId && <span className="dealer-tag">Dealer</span>}
        {player.id === callerId && <span className="win-tag">WIN</span>}
        {game.status === 'finished' && player.id === game.winnerId && <span className="status-winner">Winner</span>}
      </span>
      <span className="player-total">{player.score >= 100 ? <span role="img" aria-label="Eliminated">💀</span> : <><span className="sr-only">Total score: </span>{player.score}</>}</span>
    </th>
  ))
  return (
    <div className="scoreboard-region">
      <div className="scoreboard-heading" aria-hidden="true">
        <table className="scoreboard">
          <thead><tr>{playerTiles(true)}</tr></thead>
        </table>
      </div>
      <div className="table-wrap scoreboard-history">
        <table aria-label="Scoreboard" className="scoreboard">
          <thead className="sr-only"><tr>{playerTiles(false)}</tr></thead>
          <tbody>
            {rounds.map((round) => (
              <tr key={round.roundNumber} aria-label={`Round ${round.roundNumber}`}>
                {players.map((player) => {
                  const hasHand = Object.hasOwn(round.hands, player.id)
                  if (round.eliminatedIds.includes(player.id)) {
                    return (
                      <td key={player.id}>
                        <span className="round-total"><span className="sr-only">Running total: </span>{round.scoresAfter[player.id] > 100 ? '100+' : '100'}</span>
                        <span className="round-hand"><span role="img" aria-label="Eliminated">💀</span></span>
                      </td>
                    )
                  }
                  if (!hasHand) return <td key={player.id} />
                  const adjustment = roundAdjustment(round, player.id)
                  const handEmoji = adjustment === 'penalty' ? '🤡' : adjustment === 'reduction' ? '🍀' : player.id === round.callerId ? '🃏' : '🎴'
                  return (
                    <td key={player.id} className={adjustment ? `score-${adjustment}` : undefined}>
                      <span className="round-total">
                        <span className="sr-only">Running total: </span>{round.scoresAfter[player.id]}
                        {adjustment && <sup aria-label={adjustment === 'penalty' ? 'Penalty: +25' : 'Reduction: -25'}>{adjustment === 'penalty' ? ' +25' : ' -25'}</sup>}
                      </span>
                      <span className="round-hand">
                        <span role="img" aria-label="Hand value">{handEmoji}</span>{`${round.hands[player.id] > 0 ? '+' : ''}${round.hands[player.id]}`}
                      </span>
                    </td>
                  )
                })}
              </tr>
            ))}
            {entry}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ScoreChart({ game }: { game: GameState }) {
  const first = game.rounds[0]?.before.players ?? game.players
  const x = (index: number) => 56 + index * (374 / Math.max(1, game.rounds.length))
  const y = (score: number) => 202 - (Math.min(100, score) / 100) * 170
  const series = first.map((player, index) => {
    const elimination = game.rounds.findIndex((round) => round.eliminatedIds.includes(player.id))
    const rounds = elimination < 0 ? game.rounds : game.rounds.slice(0, elimination + 1)
    const scores = [player.score, ...rounds.map((round) => round.scoresAfter[player.id])]
    const endX = x(scores.length - 1)
    const endY = y(scores[scores.length - 1])
    return {
      player,
      color: ['#187c68', '#c45b35', '#3f6ea8', '#9b7627', '#7658a5', '#4b7d3c'][index % 6],
      scores,
      eliminated: elimination >= 0,
      endX,
      endY,
      labelY: endY,
    }
  })
  const labels = [...series].sort((left, right) => left.endY - right.endY)
  labels.forEach((line, index) => {
    line.labelY = Math.max(line.endY, index === 0 ? 32 : labels[index - 1].labelY + 22)
  })
  for (let index = labels.length - 1; index >= 0; index--) {
    labels[index].labelY = Math.min(labels[index].labelY, index === labels.length - 1 ? 202 : labels[index + 1].labelY - 22)
  }

  return (
    <div className="chart-wrap">
      <svg viewBox="0 0 600 246" role="img" aria-label="Player scores after each round">
        {[0, 50, 100].map((tick) => (
          <g key={tick}>
            <line x1="50" x2="430" y1={y(tick)} y2={y(tick)} className="chart-grid" />
            <text x="40" y={y(tick) + 4} textAnchor="end" className="chart-label">{tick}</text>
          </g>
        ))}
        {Array.from({ length: game.rounds.length + 1 }, (_, index) => (
          <text key={index} x={x(index)} y="226" textAnchor="middle" className="chart-label">{index === 0 ? 'Start' : `R${index}`}</text>
        ))}
        {series.map((line) => (
          <polyline
            key={line.player.id}
            points={line.scores.map((score, index) => `${x(index)},${y(score)}`).join(' ')}
            fill="none"
            stroke={line.color}
            strokeWidth="3"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}
        {series.map((line) => (
          <g key={line.player.id} data-player-id={line.player.id}>
            <path
              d={`M${line.endX + 8},${line.endY} L${line.endX + 14},${line.labelY} H${line.endX + 18}`}
              fill="none"
              stroke={line.color}
              strokeWidth="1"
            />
            {line.eliminated ? (
              <text x={line.endX} y={line.endY} textAnchor="middle" dominantBaseline="central" className="chart-skull" role="img" aria-label={`${line.player.name} eliminated`}>💀</text>
            ) : line.player.id === game.winnerId ? (
              <text x={line.endX} y={line.endY} textAnchor="middle" dominantBaseline="central" className="chart-trophy" role="img" aria-label={`${line.player.name} winner`}>🏆</text>
            ) : (
              <circle cx={line.endX} cy={line.endY} r="4" fill={line.color} />
            )}
            <ChartName name={line.player.name} x={line.endX + 20} y={line.labelY} color={line.color} />
          </g>
        ))}
      </svg>
    </div>
  )
}

function ChartName({ name, x, y, color }: { name: string; x: number; y: number; color: string }) {
  const textRef = useRef<SVGTextElement>(null)

  useLayoutEffect(() => {
    const text = textRef.current
    if (!text || typeof text.getComputedTextLength !== 'function') return
    text.style.fontSize = ''
    const natural = text.getComputedTextLength()
    const available = 592 - x
    if (natural > available) {
      text.style.fontSize = `${14 * available / natural}px`
    }
  }, [name, x])

  return (
    <text ref={textRef} x={x} y={y} dominantBaseline="central" fill={color} className="chart-name">
      <title>{name}</title>
      {name}
    </text>
  )
}

export default App
