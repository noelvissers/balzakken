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
          <p className="eyebrow">Digitaal scoreboard voor</p>
          <h1 id="welcome-title">BALZAKKEN!</h1>
          <p className="intro">Bottom text.</p>
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
      <Header title={game.status === 'active' ? `Ronde ${currentRound}` : undefined} onQuit={quitGame} />
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
              <tr className="scoreboard-entry-row" aria-label={`Round ${currentRound} entry`}>
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
                    <FittedText className="player-name">{player.name}</FittedText>
                  </td>
                ))}
              </tr>
            } />
            {formError && <p role="alert" className="form-error">{formError}</p>}
            {callerId && <button className="button button-primary next-round-button" type="submit" disabled={!canSubmitRound}>Volgende ronde<ArrowRight size={20} aria-hidden="true" /></button>}
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
      <span className="header-brand"><span className="mark" aria-hidden="true">♠</span><span>BALZAKKEN!</span></span>
      {title && <span className="header-title">{title}</span>}
      {onQuit && <button className="button button-subtle header-quit" onClick={onQuit}>Stop</button>}
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

function FittedText({ children, className }: { children: ReactNode; className: string }) {
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
  }, [children])

  return <span className={className} ref={containerRef}><span className={`${className}-text`} ref={textRef}>{children}</span></span>
}

function Scoreboard({ game, callerId, entry }: { game: GameState; callerId?: string; entry?: ReactNode }) {
  const { players, dealerId, rounds } = game
  const playerTiles = (visible: boolean) => players.map((player) => {
    const isWinner = game.status === 'finished' && player.id === game.winnerId
    return (
      <th scope="col" key={player.id} className={player.score >= 100 ? 'is-eliminated' : undefined}>
        {visible ? <FittedText className="player-name">{player.name}</FittedText> : <span className="player-name">{player.name}</span>}
        <span className="player-tags">
          {player.id === dealerId && <span className="dealer-tag">Dealer</span>}
          {player.id === callerId && <span className="win-tag">BALZAK!</span>}
          {isWinner && <span className="status-winner">Winner</span>}
        </span>
        {isWinner ? (
          <span className="player-total" role="img" aria-label="Winner">👑</span>
        ) : visible ? (
          <FittedText className="player-total">{player.score >= 100 ? <span role="img" aria-label="Eliminated">💀</span> : player.score}</FittedText>
        ) : (
          <span className="player-total">{player.score >= 100 ? <span role="img" aria-label="Eliminated">💀</span> : <><span className="sr-only">Total score: </span>{player.score}</>}</span>
        )}
      </th>
    )
  })
  return (
    <div className="scoreboard-region">
      <div className="scoreboard-heading" aria-hidden="true">
        <table className="scoreboard">
          <thead><tr>{playerTiles(true)}</tr></thead>
        </table>
        <svg className="scoreboard-frame" viewBox="0 0 1000 200" preserveAspectRatio="none" aria-hidden="true">
          <path className="scoreboard-frame-main" d="M 0 200 C -3 183 3 166 0 149 S -2 119 1 101 S -3 67 0 49 S 2 27 0 12 Q 0 0 12 0 C 44 -3 77 3 110 0 S 175 -2 210 1 S 277 -3 310 0 S 375 2 410 -1 S 477 3 510 0 S 575 -2 610 1 S 677 -3 710 0 S 775 2 810 -1 S 877 3 910 0 S 965 -2 988 0 Q 1000 0 1000 12 C 997 29 1003 47 1000 65 S 998 98 1001 116 S 997 149 1000 167 S 1002 188 1000 200" />
          <path className="scoreboard-frame-main" d="M 0 200 C 35 198 65 202 100 200 S 165 198 200 200 S 265 202 300 200 S 365 198 400 200 S 465 202 500 200 S 565 198 600 200 S 665 202 700 200 S 765 198 800 200 S 865 202 900 200 S 965 198 1000 200" />
        </svg>
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
                        <FittedText className="round-total"><span className="sr-only">Running total: </span>{round.scoresAfter[player.id] > 100 ? '100+' : '100'}</FittedText>
                        <span className="round-hand"><span role="img" aria-label="Eliminated">💀</span></span>
                      </td>
                    )
                  }
                  if (!hasHand) return <td key={player.id} />
                  const adjustment = roundAdjustment(round, player.id)
                  const handEmoji = adjustment === 'penalty' ? '🤡' : adjustment === 'reduction' ? '🍀' : player.id === round.callerId ? '🃏' : '🎴'
                  return (
                    <td key={player.id} className={adjustment ? `score-${adjustment}` : undefined}>
                      <FittedText className="round-total">
                        <span className="sr-only">Running total: </span>{round.scoresAfter[player.id]}
                        {adjustment && <sup aria-label={adjustment === 'penalty' ? 'Penalty: +25' : 'Reduction: -25'}>{adjustment === 'penalty' ? ' +25' : ' -25'}</sup>}
                      </FittedText>
                      <FittedText className="round-hand">
                        <span role="img" aria-label="Hand value">{handEmoji}</span>{`${round.hands[player.id] > 0 ? '+' : ''}${round.hands[player.id]}`}
                      </FittedText>
                    </td>
                  )
                })}
              </tr>
            ))}
            {entry}
          </tbody>
        </table>
        <svg className="scoreboard-frame scoreboard-history-frame" viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true">
          <path className="scoreboard-frame-main" d="M 0 0 C -3 35 3 67 0 100 S -2 166 1 200 S -3 266 0 300 S 2 366 -1 400 S 3 466 0 500 S -2 566 1 600 S -3 666 0 700 S 2 766 -1 800 S 3 866 0 900 S -2 949 0 975 Q 0 1000 24 1000 C 55 997 78 1003 110 1000 S 176 998 210 1001 S 276 997 310 1000 S 376 1002 410 999 S 476 1003 510 1000 S 576 998 610 1001 S 676 997 710 1000 S 776 1002 810 999 S 876 1003 910 1000 S 953 998 976 1000 Q 1000 1000 1000 975 C 997 949 1003 924 1000 900 S 998 834 1001 800 S 997 734 1000 700 S 1002 634 999 600 S 1003 534 1000 500 S 998 434 1001 400 S 997 334 1000 300 S 1002 234 999 200 S 1003 134 1000 100 S 998 35 1000 0" />
        </svg>
      </div>
    </div>
  )
}

function ScoreChart({ game }: { game: GameState }) {
  const first = game.rounds[0]?.before.players ?? game.players
  const x = (index: number) => 56 + index * (444 / Math.max(1, game.rounds.length))
  const y = (score: number) => 202 - (Math.min(100, score) / 100) * 170
  const series = first.map((player, index) => {
    const elimination = game.rounds.findIndex((round) => round.eliminatedIds.includes(player.id))
    const rounds = elimination < 0 ? game.rounds : game.rounds.slice(0, elimination + 1)
    const scores = [player.score, ...rounds.map((round) => round.scoresAfter[player.id])]
    const endX = x(scores.length - 1)
    const endY = y(scores[scores.length - 1])
    return {
      player,
      color: ['#ff206e', '#49416d', '#41ead4', '#533745', '#ffbf81'][index % 5],
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
            <line x1="50" x2="500" y1={y(tick)} y2={y(tick)} className="chart-grid" />
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
              <text x={line.endX} y={line.endY} textAnchor="middle" dominantBaseline="central" className="chart-trophy" role="img" aria-label={`${line.player.name} winner`}>👑</text>
            ) : (
              <circle cx={line.endX} cy={line.endY} r="4" fill={line.color} />
            )}
            <ChartName name={line.player.name} x={line.endX + 20} y={line.labelY} />
          </g>
        ))}
      </svg>
    </div>
  )
}

function ChartName({ name, x, y }: { name: string; x: number; y: number }) {
  const textRef = useRef<SVGTextElement>(null)

  useLayoutEffect(() => {
    const text = textRef.current
    if (!text || typeof text.getComputedTextLength !== 'function') return
    function fit() {
      const currentText = textRef.current
      if (!currentText) return
      currentText.style.fontSize = ''
      const natural = currentText.getComputedTextLength()
      const available = 592 - x
      const baseSize = Number.parseFloat(getComputedStyle(currentText).fontSize) || 16
      if (available > 0 && natural > available) {
        currentText.style.fontSize = `${Math.floor(baseSize * available / natural * 100) / 100}px`
      }
    }
    fit()
    void document.fonts?.ready.then(fit)
  }, [name, x])

  return (
    <text ref={textRef} x={x} y={y} dominantBaseline="central" fill="#000" className="chart-name">
      <title>{name}</title>
      {name}
    </text>
  )
}

export default App
