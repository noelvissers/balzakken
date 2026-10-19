import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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
  it('synchronizes the sticky player strip with history and exposes one accessible scoreboard', async () => {
    const user = userEvent.setup()
    const { container } = render(<App />)
    await createTwoPlayerGame(user)
    const heading = container.querySelector<HTMLDivElement>('.scoreboard-heading')!
    const history = container.querySelector<HTMLDivElement>('.scoreboard-history')!

    expect(heading).toHaveAttribute('aria-hidden', 'true')
    expect(screen.getAllByRole('table')).toHaveLength(1)
    expect(within(screen.getByRole('table', { name: 'Scoreboard' })).getAllByRole('columnheader')).toHaveLength(2)
    history.scrollLeft = 120
    fireEvent.scroll(history)
    expect(heading.scrollLeft).toBe(120)
    heading.scrollLeft = 40
    fireEvent.scroll(heading)
    expect(history.scrollLeft).toBe(40)
  })

  it('uses matching compact player controls and fixed setup navigation without a player box', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'New Game' }))

    expect(screen.queryByRole('group', { name: 'Players' })).not.toBeInTheDocument()
    expect(screen.queryByText('Players', { exact: true })).not.toBeInTheDocument()
    const start = screen.getByRole('button', { name: 'Start game' })
    expect(start).toHaveClass('next-round-button')
    expect(start).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Back' })).toHaveClass('undo-button')
    const add = screen.getByRole('button', { name: 'Add player' })
    expect(add).toHaveClass('player-control')
    expect(add.textContent).toBe('')
    for (const remove of screen.getAllByRole('button', { name: /Remove/ })) {
      expect(remove).toHaveClass('player-control')
      expect(remove).toBeDisabled()
    }

    await user.type(screen.getByLabelText('Player 1'), 'Ada')
    await user.type(screen.getByLabelText('Player 2'), 'Bert')
    expect(start).toBeEnabled()
    await user.click(add)
    expect(screen.getAllByRole('textbox')).toHaveLength(3)
    expect(start).toBeDisabled()
    await user.type(screen.getByLabelText('Player 3'), 'Cody')
    expect(start).toBeEnabled()
    const remove = screen.getByRole('button', { name: 'Remove Cody' })
    expect(remove).toHaveClass('player-control')
    expect(remove.textContent).toBe('')
    await user.click(remove)
    expect(screen.getAllByRole('textbox')).toHaveLength(2)
    expect(screen.getByLabelText('Player 1')).toHaveValue('Ada')
    expect(screen.getByLabelText('Player 2')).toHaveValue('Bert')
    expect(start).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Remove Ada' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Back' }))
    expect(screen.getByRole('button', { name: 'New Game' })).toBeInTheDocument()
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('keeps the round and quit action in the header without a scoreboard heading', async () => {
    const user = userEvent.setup()
    const { container } = render(<App />)
    await createTwoPlayerGame(user)

    const header = within(container.querySelector('header')!)
    expect(header.getByText('ROUND 1')).toBeInTheDocument()
    expect(header.getByRole('button', { name: 'Quit Game' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Scoreboard' })).not.toBeInTheDocument()
  })

  it('commits a valid round immediately with Next round and no confirmation screen', async () => {
    const user = userEvent.setup()
    render(<App />)
    await createTwoPlayerGame(user)

    await user.click(screen.getByRole('button', { name: 'Ada calls WIN' }))
    await user.type(screen.getByLabelText('Ada hand value'), '-1')
    await user.type(screen.getByLabelText('Bert hand value'), '2')
    await user.click(screen.getByRole('button', { name: 'Next round' }))

    expect(screen.queryByRole('heading', { name: 'Confirm round' })).not.toBeInTheDocument()
    expect(screen.queryByRole('table', { name: 'Round summary' })).not.toBeInTheDocument()

    expect(screen.getByText('ROUND 2')).toBeInTheDocument()
    const scoreboard = within(screen.getByRole('table', { name: 'Scoreboard' }))
    expect(scoreboard.getByRole('columnheader', { name: /Ada/ })).toHaveTextContent('Total score: 0')
    expect(scoreboard.getByRole('columnheader', { name: /Bert/ })).toHaveTextContent('Total score: 2')
    const cells = within(scoreboard.getByRole('row', { name: 'Round 1' })).getAllByRole('cell')
    expect(cells[0]).toHaveTextContent('Running total: 0🃏 -1')
    expect(cells[1]).toHaveTextContent('Running total: 2🃏 +2')
    expect(screen.queryByLabelText('Ada hand value')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ada calls WIN' })).toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).game.rounds).toHaveLength(1)
  })

  it('enters signed values with the keypad and advances focus through the hand fields', async () => {
    const user = userEvent.setup()
    render(<App />)
    await createTwoPlayerGame(user)
    await user.click(screen.getByRole('button', { name: 'Ada calls WIN' }))

    const ada = screen.getByLabelText('Ada hand value')
    expect(ada).toHaveAttribute('inputmode', 'none')
    await user.click(screen.getByRole('button', { name: 'Enter digit 4' }))
    await user.click(screen.getByRole('button', { name: 'Toggle negative sign' }))
    await user.click(screen.getByRole('button', { name: 'Toggle negative sign' }))
    await user.click(screen.getByRole('button', { name: 'Toggle negative sign' }))
    await user.click(screen.getByRole('button', { name: 'Enter digit 1' }))
    await user.click(screen.getByRole('button', { name: 'Delete last digit' }))
    expect(ada).toHaveValue('-4')

    await user.click(screen.getByRole('button', { name: 'Next hand value' }))
    const bert = screen.getByLabelText('Bert hand value')
    expect(document.activeElement).toBe(bert)
    await user.click(screen.getByRole('button', { name: 'Enter digit 2' }))
    await user.click(screen.getByRole('button', { name: 'Enter and submit round' }))

    expect(screen.getByText('ROUND 2')).toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).game.rounds[0].hands).toEqual({
      [JSON.parse(localStorage.getItem(STORAGE_KEY)!).game.players[0].id]: -4,
      [JSON.parse(localStorage.getItem(STORAGE_KEY)!).game.players[1].id]: 2,
    })
  })

  it('skips eliminated players and validates when Enter submits from the final field', async () => {
    const initial = createGame([
      { id: 'ada', name: 'Ada' }, { id: 'bert', name: 'Bert' }, { id: 'cody', name: 'Cody' },
    ], () => 0)
    const first = submitRound({
      ...initial,
      players: initial.players.map((player) => ({ ...player, score: player.id === 'bert' ? 75 : 0 })),
    }, { callerId: 'bert', hands: { ada: 1, bert: 6, cody: 2 } }, () => 0)
    saveGame(submitRound(first, { callerId: 'ada', hands: { ada: 1, cody: 2 } }, () => 0))
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Resume Game' }))
    await user.click(screen.getByRole('button', { name: 'Ada calls WIN' }))

    expect(screen.queryByLabelText('Bert hand value')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Next hand value' }))
    const cody = screen.getByLabelText('Cody hand value')
    expect(document.activeElement).toBe(cody)
    await user.click(screen.getByRole('button', { name: 'Enter digit 3' }))
    await user.click(screen.getByRole('button', { name: 'Enter and submit round' }))
    expect(screen.getByRole('alert')).toHaveTextContent('safe whole number for Ada')
    expect(screen.getByText('ROUND 3')).toBeInTheDocument()

    await user.click(screen.getByLabelText('Ada hand value'))
    await user.click(screen.getByRole('button', { name: 'Enter digit 1' }))
    await user.click(screen.getByRole('button', { name: 'Toggle negative sign' }))
    await user.click(screen.getByRole('button', { name: 'Next hand value' }))
    await user.click(screen.getByRole('button', { name: 'Enter and submit round' }))

    expect(screen.getByText('ROUND 4')).toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).game.rounds.at(-1).hands).toEqual({ ada: -1, cody: 3 })
  })

  it('rejects missing hand values without changing the last committed save', async () => {
    const user = userEvent.setup()
    render(<App />)
    await createTwoPlayerGame(user)
    const committed = localStorage.getItem(STORAGE_KEY)

    await user.click(screen.getByRole('button', { name: 'Ada calls WIN' }))
    await user.click(screen.getByRole('button', { name: 'Next round' }))

    expect(screen.getByRole('alert')).toHaveTextContent('safe whole number for Ada')
    expect(localStorage.getItem(STORAGE_KEY)).toBe(committed)
    expect(screen.getByText('ROUND 1')).toBeInTheDocument()
  })

  it('instantly undoes a restored round with its caller and editable values, then saves corrections', async () => {
    const user = userEvent.setup()
    const firstRender = render(<App />)
    await createTwoPlayerGame(user)
    const initialGame = JSON.parse(localStorage.getItem(STORAGE_KEY)!).game
    await user.click(screen.getByRole('button', { name: 'Ada calls WIN' }))
    await user.type(screen.getByLabelText('Ada hand value'), '1')
    await user.type(screen.getByLabelText('Bert hand value'), '2')
    await user.click(screen.getByRole('button', { name: 'Next round' }))
    firstRender.unmount()

    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Resume Game' }))
    expect(screen.getByText('ROUND 2')).toBeInTheDocument()
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    await user.click(screen.getByRole('button', { name: 'Undo Last Round' }))

    expect(window.confirm).not.toHaveBeenCalled()
    expect(screen.getByText('ROUND 1')).toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).game).toEqual(initialGame)
    expect(screen.getByLabelText('Ada hand value')).toHaveValue('1')
    expect(screen.getByLabelText('Bert hand value')).toHaveValue('2')
    expect(within(screen.getByRole('columnheader', { name: /Ada/ })).getByText('WIN')).toBeInTheDocument()
    expect(within(screen.getByRole('table', { name: 'Scoreboard' })).getByRole('columnheader', { name: /Bert/ })).toHaveTextContent('Total score: 0')
    await user.clear(screen.getByLabelText('Bert hand value'))
    await user.type(screen.getByLabelText('Bert hand value'), '4')
    await user.click(screen.getByRole('button', { name: 'Next round' }))
    const corrected = JSON.parse(localStorage.getItem(STORAGE_KEY)!).game
    expect(corrected.rounds).toHaveLength(1)
    expect(corrected.rounds[0]).toMatchObject({ callerId: initialGame.players[0].id, hands: { [initialGame.players[0].id]: 1, [initialGame.players[1].id]: 4 } })
    expect(corrected.players[1].score).toBe(4)
    expect(screen.getByText('ROUND 2')).toBeInTheDocument()
    expect(window.confirm).not.toHaveBeenCalled()
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
    expect(within(screen.getByRole('columnheader', { name: /Ada/ })).getByText('Winner')).toHaveClass('status-winner')
    expect(within(screen.getByRole('columnheader', { name: /Bert/ })).getByText('Game over')).toBeInTheDocument()
    expect(within(screen.getByRole('table', { name: 'Scoreboard' })).getAllByText('Winner')).toHaveLength(1)
    expect(screen.queryByText(/game complete/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Ada wins' })).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Game results' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Player scores after each round' })).toBeInTheDocument()

    const playAgain = screen.getByRole('button', { name: 'Play Again' })
    expect(playAgain).toHaveClass('next-round-button')
    await user.click(playAgain)
    expect(screen.getByText('ROUND 1')).toBeInTheDocument()
    expect(screen.queryByText('Winner')).not.toBeInTheDocument()
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
    expect(within(screen.getByRole('columnheader', { name: /Ada/ })).getByText('Winner')).toBeInTheDocument()

    vi.spyOn(window, 'confirm').mockReturnValue(false)
    await user.click(screen.getByRole('button', { name: 'Undo Last Round' }))
    expect(window.confirm).not.toHaveBeenCalled()
    expect(screen.getByRole('table', { name: 'Scoreboard' })).toBeInTheDocument()
    expect(screen.queryByText('Winner')).not.toBeInTheDocument()
    expect(screen.getByText('ROUND 1')).toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).game.rounds).toHaveLength(0)
    expect(screen.getByLabelText('Ada hand value')).toHaveValue('1')
    expect(screen.getByLabelText('Bert hand value')).toHaveValue('6')
    expect(within(screen.getByRole('columnheader', { name: /Bert/ })).getByText('WIN')).toBeInTheDocument()
    await user.clear(screen.getByLabelText('Bert hand value'))
    await user.type(screen.getByLabelText('Bert hand value'), '0')
    await user.click(screen.getByRole('button', { name: 'Next round' }))
    expect(screen.getByText('ROUND 2')).toBeInTheDocument()
    expect(screen.queryByText('Winner')).not.toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).game.players[1].score).toBe(50)
  })

  it('undoes caller selection while retaining hand values in the same grid row', async () => {
    saveGame(createGame([{ id: 'ada', name: 'Ada' }, { id: 'bert', name: 'Bert' }], () => 0))
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Resume Game' }))
    const committed = localStorage.getItem(STORAGE_KEY)
    expect(screen.queryByRole('button', { name: /Undo|Change win caller|Back to hand values/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument()
    const entry = screen.getByRole('row', { name: 'Round 1 entry' })
    const cells = within(entry).getAllByRole('cell')
    expect(within(cells[0]).getByRole('button', { name: 'Ada calls WIN' })).toHaveTextContent('WIN')
    expect(within(cells[1]).getByRole('button', { name: 'Bert calls WIN' })).toHaveTextContent('WIN')

    await user.click(screen.getByRole('button', { name: 'Ada calls WIN' }))
    const ada = within(screen.getByRole('columnheader', { name: /Ada/ }))
    expect(ada.getByText('Dealer')).toBeInTheDocument()
    expect(ada.getByText('WIN')).toBeInTheDocument()
    expect(within(cells[0]).getByLabelText('Ada hand value')).toBeInTheDocument()
    expect(within(cells[1]).getByLabelText('Bert hand value')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Ada hand value'), '1')
    await user.type(screen.getByLabelText('Bert hand value'), '4')

    await user.click(screen.getByRole('button', { name: 'Change win caller' }))
    expect(ada.queryByText('WIN')).not.toBeInTheDocument()
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Undo|Change win caller|Back to hand values/ })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Bert calls WIN' }))
    expect(screen.getByLabelText('Ada hand value')).toHaveValue('1')
    expect(screen.getByLabelText('Bert hand value')).toHaveValue('4')
    expect(within(screen.getByRole('columnheader', { name: /Bert/ })).getByText('WIN')).toBeInTheDocument()
    expect(localStorage.getItem(STORAGE_KEY)).toBe(committed)
    await user.click(screen.getByRole('button', { name: 'Next round' }))
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).game.rounds[0]).toMatchObject({ callerId: 'bert', hands: { ada: 1, bert: 4 } })
  })

  it.each([
    { name: 'low caller penalty', before: [0, 0], hands: { ada: 4, bert: 3 }, totals: [25, 3], adjustments: ['penalty', null] },
    { name: 'high caller penalty with suppressed opponent score', before: [0, 0], hands: { ada: 6, bert: 50 }, totals: [25, 0], adjustments: ['penalty', null] },
    { name: 'negative hand reaching 50', before: [51, 0], hands: { ada: -1, bert: 2 }, totals: [25, 2], adjustments: ['reduction', null] },
    { name: 'opponent reaching 50', before: [0, 48], hands: { ada: -1, bert: 2 }, totals: [0, 25], adjustments: [null, 'reduction'] },
    { name: 'opponent reaching 75', before: [0, 73], hands: { ada: 1, bert: 2 }, totals: [1, 50], adjustments: [null, 'reduction'] },
    { name: 'opponent reaching 100', before: [0, 98], hands: { ada: 1, bert: 2 }, totals: [1, 75], adjustments: [null, 'reduction'] },
    { name: 'ordinary negative hand', before: [10, 0], hands: { ada: -1, bert: 2 }, totals: [9, 2], adjustments: [null, null] },
    { name: 'zero clamping without a reduction', before: [0, 0], hands: { ada: -1, bert: 2 }, totals: [0, 2], adjustments: [null, null] },
    { name: 'zero hand without a sign', before: [0, 0], hands: { ada: 0, bert: 5 }, totals: [0, 5], adjustments: [null, null] },
  ])('shows hand values, totals and correct annotations for $name', async ({ before, hands, totals, adjustments }) => {
    const initial = createGame([{ id: 'ada', name: 'Ada' }, { id: 'bert', name: 'Bert' }], () => 0)
    saveGame(submitRound({
      ...initial,
      players: initial.players.map((player, index) => ({ ...player, score: before[index] })),
    }, { callerId: 'ada', hands }, () => 0))
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Resume Game' }))

    const cells = within(screen.getByRole('row', { name: 'Round 1' })).getAllByRole('cell')
    const headers = within(screen.getByRole('table', { name: 'Scoreboard' })).getAllByRole('columnheader')
    for (const [index, cell] of cells.entries()) {
      const hand = index === 0 ? hands.ada : hands.bert
      const total = cell.querySelector<HTMLSpanElement>('.round-total')!
      expect(cell.firstElementChild).toBe(total)
      expect(cell.querySelector('.round-hand')).toHaveTextContent(`${hand <= 5 ? '🃏' : '🎴'} ${hand > 0 ? '+' : ''}${hand}`)
      expect(cell.querySelector('.round-hand')).not.toHaveTextContent(/[()]/)
      expect(total).toHaveTextContent(`Running total: ${totals[index]}`)
      expect(headers[index]).toHaveTextContent(`Total score: ${totals[index]}`)
      const adjustment = adjustments[index]
      if (adjustment) {
        expect(cell).toHaveClass(`score-${adjustment}`)
        expect(within(total).getByLabelText(adjustment === 'penalty' ? 'Penalty: +25' : 'Reduction: -25')).toHaveTextContent(adjustment === 'penalty' ? '(+25)' : '(-25)')
      } else {
        expect(cell).not.toHaveClass('score-penalty', 'score-reduction')
        expect(cell).not.toHaveTextContent(/[()]/)
      }
    }
  })

  it('keeps eliminated players aligned in history without WIN or hand controls', async () => {
    const initial = createGame([
      { id: 'ada', name: 'Ada' }, { id: 'bert', name: 'Bert' }, { id: 'cody', name: 'Cody' },
    ], () => 0)
    const first = submitRound({
      ...initial,
      players: initial.players.map((player) => ({ ...player, score: player.id === 'bert' ? 75 : 0 })),
    }, { callerId: 'bert', hands: { ada: 1, bert: 6, cody: 2 } }, () => 0)
    saveGame(submitRound(first, { callerId: 'ada', hands: { ada: 1, cody: 2 } }, () => 0))
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Resume Game' }))

    const table = within(screen.getByRole('table', { name: 'Scoreboard' }))
    expect(table.getAllByRole('columnheader').map((header) => header.querySelector('.player-name')?.textContent)).toEqual(['Ada', 'Bert', 'Cody'])
    expect(table.getByRole('columnheader', { name: /Bert/ })).toHaveTextContent('Game over')
    const history = within(table.getByRole('row', { name: 'Round 2' })).getAllByRole('cell')
    expect(history).toHaveLength(3)
    expect(within(history[1]).getByLabelText('Did not play')).toHaveTextContent('-')
    expect(history[1]).toHaveTextContent('Running total: 100')
    expect(screen.queryByRole('button', { name: 'Bert calls WIN' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Ada calls WIN' }))
    expect(screen.getAllByRole('textbox', { name: /hand value/ })).toHaveLength(2)
    expect(screen.queryByLabelText('Bert hand value')).not.toBeInTheDocument()
    expect(within(table.getByRole('row', { name: 'Round 3 entry' })).getAllByRole('cell')).toHaveLength(3)
  })
})