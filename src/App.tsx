import { useLayoutEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { ArrowLeft, ArrowRight, Minus, Plus } from 'lucide-react'
import coconutIcon from './assets/coconut-icon.svg'
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
    if (game.status === 'active' && !window.confirm('Weet je zeker dat je het spel wil stoppen?')) return
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
        <Header title="BALZAKKEN!" />
        {storageWarning && <p role="alert" className="notice">{storageWarning}</p>}
        <section className="welcome-panel" aria-labelledby="welcome-title">
          <p className="eyebrow">Digitaal scorebord voor</p>
          <h1 id="welcome-title">BALZAKKEN!</h1>
          <div className="welcome-actions">
            <button className="button button-primary" onClick={() => {
              setDraftPlayers(newDraft())
              setFormError('')
              setScreen('setup')
            }}>Nieuw Spel</button>
            {game && <button className="button" onClick={() => setScreen('game')}>Resume Game</button>}
          </div>
          <h3><br />Uitleg</h3>
          <p>Het doel van het spel is om een zo laag mogelijke score te halen. Hoe? Door hoge kaarten te lozen. Heb je 5 of minder punten in je hand? Roep dan keihard BALZAK! en zadel je medespelers op met veel punten.<br />Aan het eind van elke ronde worden alle punten opgeschreven. Er begint dan een nieuwe ronde. Heb je 100 punten of meer, is het spel voor jou afgelopen. De rest van de spelers speelt door tot er nog maar één speler over is.<br /><br /></p>
          <p>1. Start het spel door op de knop ‘Nieuw Spel’ te klikken. </p>
          <p>2. Vul de namen van de spelers in (maximaal 6), en klik op de knop ‘Start Spel’.</p>
          <p>3. Speel het spel zoals in de regels beschreven. Degene die moet delen krijgt ‘Dealer’ onder zijn naam.</p>
          <p>4. Als de ronde voorbij is, klik je op de joker bij degene die ‘BALZAK!’ heeft geroepen.</p>
          <p>5. Vul de punten in die iedereen in zijn hand heeft. Valse balzak en andere speciale scores worden automatisch berekend, dit hoef je dus niet zelf te bedenken.</p>
          <p>6. Klik op de knop ‘Volgende ronde’ als de score correct is ingevuld.</p>
          <h3>Regels</h3>
          <h4>1. Begin</h4>
          <p>Schud alle kaarten en geef iedere speler 5 stuks. Houd de kaarten in je hand en zorg dat niemand ze ziet. De overige kaarten vormen de trekstapel. Draai de bovenste kaart om en leg deze ernaast. Dit is de aflegstapel.</p>
          <h4>2. Acties</h4>
          <p>Het scorebord geeft automatisch een willekeurig persoon aan die de dealer is. Daarna loopt het spel met de klok mee. Per beurt voer je 1 van de 3 onderstaande acties uit:<br /><br /></p>
          <p>Actie 1: Weggooien, pakken<br />Gooi een kaart uit je hand op de aflegstapel en pak een gesloten kaart van de trekstapel terug. Let op: éérst weggooien, dan pakken!<br /><br /></p>
          <p>Actie 2: Ruilen<br />Ruil een kaart uit je hand met de bovenste kaart van de aflegstapel.<br /><br /></p>
          <p>Actie 3: BALZAK!<br />Heb je 5 punten of minder in je hand? Dan mag je keihard BALZAK! roepen. De ronde stopt dan direct.<br /><br /></p>
          <p>BELANGRIJK!</p>
          <p>• Kaarten met dezelfde waarde, en 3 of meer opvolgende kaarten (van dezelfde soort) mag je tegelijk weggooien. Je hoeft dan maar één kaart terug te pakken van de trek- of aflegstapel. Zo speel je de rest van de ronde met minder kaarten.</p>
          <p>• Pak je een kaart van de trekstapel die op je aflegstapel kan (dezelfde waarde of aansluitend op de straat), dan mag je deze direct afleggen. Let op: dit mag alleen als de ander zijn beurt nog niet heeft gestart. Je pakt na deze actie wel een nieuwe kaart van de trekstapel.</p>
          <p>• Je mag alleen BALZAK! roepen als je aan de beurt bent.</p>
          <p>• BALZAK! roepen geldt als een beurt. Je mag dus niet eerst actie 1, 2 of 3 spelen en dan BALZAK! roepen.</p>
          <h4>3. Kaarten</h4>
          <p>De kaarten hebben een waarde van -2 tot en met 10. De joker is -2, een boer -1, aas 1, vrouw en koning 10. De overige kaarten hebben de waarde op de kaart.</p>
          <h4>4. BALZAK!</h4>
          <p>Heb je 5 punten of minder in je hand? Dan mag je als beurt BALZAK! roepen. De ronde stopt dan direct, alle punten worden geteld en er wordt bepaald of de BALZAK! goed of vals is. Hierna begint de volgende ronde. Degene met de hoogste hand wordt de nieuwe dealer.<br /><br /></p>
          <p>GOEIE BALZAK!</p>
          <p>Heeft de speler die BALZAK! heeft geroepen 5 punten of minder en heeft niemand anders hetzelfde of minder? Dan is het een goeie BALZAK! Alle spelers noteren de punten die ze op dit moment in hun hand hebben.<br /><br /></p>
          <p>BELANGRIJK!</p>
          <p>• Een hand kan minder dan 0 punten hebben, maar je totaalscore op het scoreformulier kan niet de min in.<br /><br /></p>
          <p>VALSE BALZAK!</p>
          <p>Heeft een andere speler hetzelfde aantal of minder punten? Dan heb je een Valse BALZAK! Bij een Valse BALZAK! krijg je 25 punten. De overige spelers schrijven de punten op die ze op dat moment in hun hand hebben.<br /><br /></p>
          <p>BELANGRIJK!</p>
          <p>• Roept iemand BALZAK! maar heeft ’ie meer dan 5 punten? Dan zit ’ie niet op te letten. Dit kost je 25 punten. De overige spelers schrijven in dit geval allemaal 0 punten op.</p>
          <h4>5. Lekkere (tussen)standjes</h4>
          <p>Heeft een van de spelers na een ronde precies 50, 75 of 100 punten? Dan mogen er 25 punten van de score afgetrokken worden.<br /><br /></p>
          <p>BELANGRIJK!</p>
          <p>• Kom je op 50, 75 of 100 na een valse balzak, worden er geen 25 punten afgetrokken. Sta je op 50 of 75 punten en heb je na de ronde een score van 0 in je hand, mogen er wel 25 punten afgetrokken worden.</p>
        </section>
      </main>
    )
  }

  if (screen === 'setup') {
    return (
      <main className="app-shell game-shell">
        <Header />
        <section className="page-content" aria-labelledby="setup-title">
          <h1 id="setup-title">Nieuw spel</h1>
          <form onSubmit={startNewGame}>
            <div className="player-editor">
              {draftPlayers.map((player, index) => (
                <div className="player-edit-row" key={player.id}>
                  <label htmlFor={`player-${player.id}`}>Speler {index + 1}</label>
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
                    disabled={draftPlayers.length <= 2}
                    onClick={() => setDraftPlayers((players) => players.filter((entry) => entry.id !== player.id))}
                  ><Minus size={20} aria-hidden="true" /></button>
                </div>
              ))}
              <div className="player-add-row">
                <button className="button player-control" type="button" disabled={draftPlayers.length >= MAX_PLAYERS} onClick={() => setDraftPlayers((players) => players.length < MAX_PLAYERS ? [...players, { id: makeId(), name: '' }] : players)}>
                  <Plus size={20} aria-hidden="true" />
                </button>
              </div>
            </div>
            {formError && <p className="form-error" role="alert">{formError}</p>}
            <button className="button button-primary next-round-button" type="submit" disabled={draftPlayers.length < 2 || draftPlayers.some((player) => !player.name.trim())}>
              Start Spel<ArrowRight size={20} aria-hidden="true" />
            </button>
          </form>
        </section>
        <button className="button undo-button" type="button" onClick={() => setScreen('welcome')}>
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
  const undoLabel = 'Ongedaan maken'
  const canUndo = Boolean(callerId || game.rounds.length)

  return (
    <main className="app-shell game-shell">
      <Header title={game.status === 'active' ? `Ronde ${currentRound}` : 'Uitslag'} onQuit={quitGame} />
      {storageWarning && <p role="alert" className="notice">{storageWarning}</p>}
      {game.status === 'finished' ? (
        <section className="page-content results" aria-label="Game results">
          <Scoreboard game={game} />
          <section className="chart-section" aria-labelledby="chart-title">
            <h2 id="chart-title">Score progressie</h2>
            <ScoreChart game={game} />
          </section>
          <button className="button button-primary next-round-button" onClick={playAgain}>Nog een keer!</button>
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
                      <button className="button button-primary win-button" type="button" aria-label={`${player.name} roept BALZAK!`} title={`${player.name} roept BALZAK!`} onClick={() => {
                        setCallerId(player.id)
                        setFormError('')
                      }}><img src={coconutIcon} alt="" aria-hidden="true" /></button>
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
      <span className="header-brand"><img className="mark" src={coconutIcon} alt="BALZAKKEN!" /></span>
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

function HistoryFrame({ rows }: { rows: number }) {
  const segments = Math.max(1, rows) * 2
  const height = Math.max(1, rows) * 100
  const step = (height - 12) / segments
  const left = Array.from({ length: segments }, (_, index) => {
    const y = index * step
    return `C -3 ${y + step / 3} 3 ${y + 2 * step / 3} 0 ${y + step}`
  }).join(' ')
  const right = Array.from({ length: segments }, (_, index) => {
    const y = height - 12 - index * step
    return `C 997 ${y - step / 3} 1003 ${y - 2 * step / 3} 1000 ${Math.max(0, y - step)}`
  }).join(' ')

  return (
    <svg className="scoreboard-frame scoreboard-history-frame" viewBox={`0 0 1000 ${height}`} preserveAspectRatio="none" aria-hidden="true">
      <path className="scoreboard-frame-main" d={`M 0 0 ${left} Q 0 ${height} 12 ${height} c 31 -3 54 3 98 0 s 66 -2 100 1 s 66 -4 100 -1 s 66 2 100 -1 s 66 4 100 1 s 66 -2 100 1 s 66 -4 100 -1 s 66 2 100 -1 s 66 4 100 1 s 43 -2 78 0 Q 1000 ${height} 1000 ${height - 12} ${right}`} />
    </svg>
  )
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
          {isWinner && <span className="status-winner">Winnaar</span>}
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
          <path className="scoreboard-frame-main" d="M 0 200 C -3 183 3 166 0 149 S -2 119 1 101 S -3 67 0 49 S 2 27 0 6 Q 0 0 6 0 C 44 -3 77 3 110 0 S 175 -2 210 1 S 277 -3 310 0 S 375 2 410 -1 S 477 3 510 0 S 575 -2 610 1 S 677 -3 710 0 S 775 2 810 -1 S 877 3 910 0 S 965 -2 994 0 Q 1000 0 1000 6 C 997 29 1003 47 1000 65 S 998 98 1001 116 S 997 149 1000 167 S 1002 188 1000 200" />
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
        <HistoryFrame rows={rounds.length + (entry ? 1 : 0)} />
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
