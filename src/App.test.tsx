import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { createGame, submitRound } from './domain/game'
import { saveGame, STORAGE_KEY } from './persistence/storage'

beforeEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

afterEach(cleanup)

async function createTwoPlayerGame(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'New Game' }))
  await user.type(screen.getByLabelText('Player 1'), 'Ada')
  await user.type(screen.getByLabelText('Player 2'), 'Bert')
  await user.click(screen.getByRole('button', { name: 'Start game' }))
}

describe('scorekeeper flows', () => {
  it('creates a game, reviews a valid round, and commits it', async () => {
    const user = userEvent.setup()
    render(<App />)
    await createTwoPlayerGame(user)

    await user.selectOptions(screen.getByLabelText('Player who called win'), 'Ada')
    await user.type(screen.getByLabelText('Ada hand value'), '-1')
    await user.type(screen.getByLabelText('Bert hand value'), '2')
    await user.click(screen.getByRole('button', { name: 'Review round' }))

    expect(screen.getByRole('heading', { name: 'Confirm round' }).parentElement).toHaveTextContent('Ada called win')
    expect(screen.getByRole('table', { name: 'Round summary' })).toHaveTextContent('Bert')
    await user.click(screen.getByRole('button', { name: 'Confirm round' }))

    expect(screen.getByText('ROUND 2')).toBeInTheDocument()
    const scoreboard = within(screen.getByRole('table', { name: 'Scoreboard' }))
    expect(scoreboard.getByRole('row', { name: /Ada/ })).toHaveTextContent('Ada0Active')
    expect(scoreboard.getByRole('row', { name: /Bert/ })).toHaveTextContent(/Bert.*2.*Active/)
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).game.rounds).toHaveLength(1)
  })

  it('rejects missing hand values without changing the last committed save', async () => {
    const user = userEvent.setup()
    render(<App />)
    await createTwoPlayerGame(user)
    const committed = localStorage.getItem(STORAGE_KEY)

    await user.selectOptions(screen.getByLabelText('Player who called win'), 'Ada')
    await user.click(screen.getByRole('button', { name: 'Review round' }))

    expect(screen.getByRole('alert')).toHaveTextContent('safe whole number for Ada')
    expect(localStorage.getItem(STORAGE_KEY)).toBe(committed)
    expect(screen.getByText('ROUND 1')).toBeInTheDocument()
  })

  it('recovers after remount and undoes the committed round', async () => {
    const user = userEvent.setup()
    const firstRender = render(<App />)
    await createTwoPlayerGame(user)
    await user.selectOptions(screen.getByLabelText('Player who called win'), 'Ada')
    await user.type(screen.getByLabelText('Ada hand value'), '1')
    await user.type(screen.getByLabelText('Bert hand value'), '2')
    await user.click(screen.getByRole('button', { name: 'Review round' }))
    await user.click(screen.getByRole('button', { name: 'Confirm round' }))
    firstRender.unmount()

    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Resume Game' }))
    expect(screen.getByText('ROUND 2')).toBeInTheDocument()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    await user.click(screen.getByRole('button', { name: 'Undo Last Round' }))

    expect(screen.getByText('ROUND 1')).toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).game.rounds).toHaveLength(0)
    expect(within(screen.getByRole('table', { name: 'Scoreboard' })).getByRole('row', { name: /Bert/ })).toHaveTextContent(/Bert.*0.*Active/)
  })

  it('shows results, plays again with the same names, and respects quit cancellation', async () => {
    const initial = createGame([
      { id: 'ada', name: 'Ada' },
      { id: 'bert', name: 'Bert' },
    ], () => 0)
    const game = submitRound({
      ...initial,
      players: initial.players.map((player) => ({
        ...player,
        score: player.id === 'bert' ? 75 : player.score,
      })),
    }, {
      callerId: 'bert',
      hands: { ada: 1, bert: 6 },
    })
    saveGame(game)
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Resume Game' }))
    expect(screen.getByRole('heading', { name: 'Ada wins' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Player scores after each round' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Play Again' }))
    expect(screen.getByText('ROUND 1')).toBeInTheDocument()
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!)
    expect(saved.game.rounds).toHaveLength(0)
    expect(saved.game.players.map((player: { name: string; score: number }) => [player.name, player.score])).toEqual([
      ['Ada', 0],
      ['Bert', 0],
    ])

    vi.spyOn(window, 'confirm').mockReturnValue(false)
    await user.click(screen.getByRole('button', { name: 'Quit Game' }))
    expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull()
    expect(screen.getByText('ROUND 1')).toBeInTheDocument()

    vi.mocked(window.confirm).mockReturnValue(true)
    await user.click(screen.getByRole('button', { name: 'Quit Game' }))
    await waitFor(() => expect(localStorage.getItem(STORAGE_KEY)).toBeNull())
    expect(screen.getByRole('button', { name: 'New Game' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Resume Game' })).not.toBeInTheDocument()
  })

  it('can undo the terminal round after restoring the finished game', async () => {
    const initial = createGame([
      { id: 'ada', name: 'Ada' },
      { id: 'bert', name: 'Bert' },
    ], () => 0)
    const finished = submitRound({
      ...initial,
      players: initial.players.map((player) => ({
        ...player,
        score: player.id === 'bert' ? 75 : player.score,
      })),
    }, {
      callerId: 'bert',
      hands: { ada: 1, bert: 6 },
    })
    saveGame(finished)
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Resume Game' }))
    expect(screen.getByRole('heading', { name: 'Ada wins' })).toBeInTheDocument()

    vi.spyOn(window, 'confirm').mockReturnValue(true)
    await user.click(screen.getByRole('button', { name: 'Undo Last Round' }))
    expect(screen.getByRole('heading', { name: 'Scoreboard' })).toBeInTheDocument()
    expect(screen.getByText('ROUND 1')).toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).game.rounds).toHaveLength(0)
  })
})