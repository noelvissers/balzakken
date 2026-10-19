import { useRef, useState, type FormEvent } from 'react'
import {
  activePlayers,
  createGame,
  submitRound,
  undoLastRound,
  type GameState,
  type NewRoundInput,
  type Player,
} from './domain/game'
import { clearSavedGame, loadSavedGame, saveGame } from './persistence/storage'
import './App.css'

type Screen = 'welcome' | 'setup' | 'game'
type DraftPlayer = { id: string; name: string }
let idSequence = 0

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
  const [preview, setPreview] = useState<GameState | null>(null)
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
      setPreview(null)
      commit(nextGame)
      setScreen('game')
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'The game could not be started.')
    }
  }

  function previewRound(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!game || submissionLock.current) return
    const participants = activePlayers(game)
    const hands: Record<string, number> = {}
    for (const player of participants) {
      const value = handValues[player.id] ?? ''
      if (!/^-?\d+$/.test(value) || !Number.isSafeInteger(Number(value))) {
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
      const input: NewRoundInput = { callerId, hands }
      setPreview(submitRound(game, input))
      setFormError('')
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'The round could not be calculated.')
    }
  }

  function confirmRound() {
    if (!preview || submissionLock.current) return
    submissionLock.current = true
    commit(preview)
    setPreview(null)
    setHandValues({})
    setCallerId('')
    submissionLock.current = false
  }

  function cancelPreview() {
    setPreview(null)
    setFormError('')
  }

  function undoRound() {
    if (!game || game.rounds.length === 0) return
    if (!window.confirm('Undo the most recent round? The scores and dealer will be restored.')) return
    commit(undoLastRound(game))
    setPreview(null)
    setHandValues({})
    setCallerId('')
  }

  function quitGame() {
    if (!game) return
    if (game.status === 'active' && !window.confirm('Quit this game and remove its saved progress?')) return
    const cleared = clearSavedGame()
    setStorageWarning(cleared.warning)
    setGame(null)
    setPreview(null)
    setScreen('welcome')
  }

  function playAgain() {
    if (!game) return
    const rematch = createGame(game.players.map(({ name }) => ({ id: makeId(), name })))
    commit(rematch)
    setCallerId('')
    setHandValues({})
    setPreview(null)
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
      <main className="app-shell">
        <Header />
        <section className="page-content" aria-labelledby="setup-title">
          <button className="text-button" onClick={() => setScreen('welcome')}>Back</button>
          <h1 id="setup-title">New game</h1>
          <form onSubmit={startNewGame}>
            <fieldset className="player-editor">
              <legend>Players</legend>
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
                    className="button button-subtle"
                    type="button"
                    aria-label={`Remove ${player.name || `player ${index + 1}`}`}
                    disabled={draftPlayers.length <= 2}
                    onClick={() => setDraftPlayers((players) => players.filter((entry) => entry.id !== player.id))}
                  >Remove</button>
                </div>
              ))}
              <button className="button" type="button" onClick={() => setDraftPlayers((players) => [...players, { id: makeId(), name: '' }])}>
                Add player
              </button>
            </fieldset>
            {formError && <p className="form-error" role="alert">{formError}</p>}
            <button className="button button-primary" type="submit" disabled={draftPlayers.length < 2 || draftPlayers.some((player) => !player.name.trim())}>
              Start game
            </button>
          </form>
        </section>
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
  const participants = activePlayers(game)
  const latestRound = preview?.rounds.at(-1) ?? null
  const currentRound = game.roundNumber

  return (
    <main className="app-shell">
      <Header />
      {storageWarning && <p role="alert" className="notice">{storageWarning}</p>}
      {game.status === 'finished' ? (
        <section className="page-content results" aria-labelledby="results-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">GAME COMPLETE</p>
              <h1 id="results-title">{game.winnerId ? `${players.find((player) => player.id === game.winnerId)?.name} wins` : 'No winner'}</h1>
            </div>
            <button className="button button-subtle" onClick={quitGame}>Quit Game</button>
          </div>
          <Scoreboard players={players} dealerId={null} />
          {game.rounds.length > 0 && <button className="button button-subtle undo-button" onClick={undoRound}>Undo Last Round</button>}
          <section className="chart-section" aria-labelledby="chart-title">
            <h2 id="chart-title">Score progression</h2>
            <ScoreChart game={game} />
          </section>
          <button className="button button-primary" onClick={playAgain}>Play Again</button>
        </section>
      ) : (
        <section className="page-content" aria-labelledby="game-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">ROUND {currentRound}</p>
              <h1 id="game-title">Scoreboard</h1>
            </div>
            <button className="button button-subtle" onClick={quitGame}>Quit Game</button>
          </div>
          <Scoreboard players={players} dealerId={game.dealerId} />
          {game.rounds.length > 0 && <button className="button button-subtle undo-button" onClick={undoRound}>Undo Last Round</button>}
          <section className="round-section" aria-labelledby="round-title">
            <h2 id="round-title">Enter round {currentRound}</h2>
            {preview && latestRound ? (
              <RoundConfirmation
                game={preview}
                round={latestRound}
                players={players}
                onConfirm={confirmRound}
                onCancel={cancelPreview}
              />
            ) : (
              <form onSubmit={previewRound} className="round-form">
                <label htmlFor="caller">Player who called win</label>
                <select id="caller" value={callerId} onChange={(event) => setCallerId(event.target.value)}>
                  <option value="">Select a player</option>
                  {participants.map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}
                </select>
                <div className="hand-grid">
                  {participants.map((player) => (
                    <div className="hand-input" key={player.id}>
                      <label htmlFor={`hand-${player.id}`}>{player.name} hand value</label>
                      <input
                        id={`hand-${player.id}`}
                        type="number"
                        inputMode="numeric"
                        step="1"
                        value={handValues[player.id] ?? ''}
                        onChange={(event) => setHandValues((values) => ({ ...values, [player.id]: event.target.value }))}
                      />
                    </div>
                  ))}
                </div>
                {formError && <p role="alert" className="form-error">{formError}</p>}
                <button className="button button-primary" type="submit">Review round</button>
              </form>
            )}
          </section>
        </section>
      )}
    </main>
  )
}

function Header() {
  return <header className="app-header"><span className="mark" aria-hidden="true">♠</span><span>Table Score</span></header>
}

function Scoreboard({ players, dealerId }: { players: Player[]; dealerId: string | null }) {
  return (
    <div className="table-wrap">
      <table aria-label="Scoreboard">
        <thead><tr><th scope="col">Player</th><th scope="col">Score</th><th scope="col">Status</th></tr></thead>
        <tbody>
          {players.map((player) => {
            const eliminated = player.score >= 100
            return (
              <tr key={player.id} className={eliminated ? 'is-eliminated' : undefined}>
                <th scope="row">
                  {player.name}
                  {player.id === dealerId && <span className="dealer-tag">Dealer</span>}
                </th>
                <td>{player.score}</td>
                <td>{eliminated ? <span className="status-eliminated">Game over</span> : 'Active'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function RoundConfirmation({
  game,
  round,
  players,
  onConfirm,
  onCancel,
}: {
  game: GameState
  round: GameState['rounds'][number]
  players: Player[]
  onConfirm: () => void
  onCancel: () => void
}) {
  const byId = new Map(players.map((player) => [player.id, player.name]))
  return (
    <div className="confirmation" aria-labelledby="confirm-title">
      <h3 id="confirm-title">Confirm round</h3>
      <p><strong>{byId.get(round.callerId)}</strong> called win.</p>
      <div className="table-wrap">
        <table aria-label="Round summary">
          <thead><tr><th scope="col">Player</th><th scope="col">Hand</th><th scope="col">Change</th><th scope="col">New score</th></tr></thead>
          <tbody>
            {Object.keys(round.hands).map((id) => (
              <tr key={id}>
                <th scope="row">{byId.get(id)}</th>
                <td>{round.hands[id]}</td>
                <td>{round.scoreChanges[id] > 0 ? `+${round.scoreChanges[id]}` : round.scoreChanges[id]}</td>
                <td>{round.scoresAfter[id]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {round.eliminatedIds.length > 0 && <p className="elimination-note">Eliminated: {round.eliminatedIds.map((id) => byId.get(id)).join(', ')}</p>}
      {game.status === 'active' && <p>Next dealer: <strong>{byId.get(game.dealerId ?? '')}</strong></p>}
      {game.status === 'finished' && game.winnerId && <p>Winner: <strong>{byId.get(game.winnerId)}</strong></p>}
      <div className="button-row">
        <button className="button button-primary" onClick={onConfirm}>Confirm round</button>
        <button className="button" onClick={onCancel}>Edit values</button>
      </div>
    </div>
  )
}

function ScoreChart({ game }: { game: GameState }) {
  const first = game.rounds[0]?.before.players ?? game.players
  const series = first.map((player, index) => ({
    player,
    color: ['#187c68', '#c45b35', '#3f6ea8', '#9b7627', '#7658a5', '#4b7d3c'][index % 6],
    scores: [player.score, ...game.rounds.map((round) => round.scoresAfter[player.id])],
  }))
  const maximum = Math.max(100, ...series.flatMap((line) => line.scores))
  const x = (index: number) => 56 + index * (520 / Math.max(1, game.rounds.length))
  const y = (score: number) => 202 - (score / maximum) * 170

  return (
    <div className="chart-wrap">
      <svg viewBox="0 0 600 246" role="img" aria-label="Player scores after each round">
        {[0, 50, 100].map((tick) => (
          <g key={tick}>
            <line x1="50" x2="584" y1={y(tick)} y2={y(tick)} className="chart-grid" />
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
      </svg>
      <ul className="chart-legend">
        {series.map((line) => <li key={line.player.id}><span style={{ backgroundColor: line.color }} />{line.player.name}</li>)}
      </ul>
    </div>
  )
}

export default App
