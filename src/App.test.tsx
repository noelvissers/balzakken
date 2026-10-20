import '@testing-library/jest-dom/vitest'
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { createGame, submitRound } from './domain/game'
import { saveGame, STORAGE_KEY } from './persistence/storage'

beforeEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

async function createTwoPlayerGame(user: ReturnType<typeof userEvent.setup>) {
  await user.click(document.querySelector<HTMLButtonElement>('.welcome-actions .button-primary')!)
  await user.type(screen.getAllByRole('textbox')[0], 'Ada')
  await user.type(screen.getAllByRole('textbox')[1], 'Bert')
  await user.click(document.querySelector<HTMLButtonElement>('.page-content form .next-round-button')!)
}

function getWinButton(index = 0) {
  return document.querySelectorAll<HTMLButtonElement>('.win-button')[index]
}

function getHandInput(index = 0) {
  return document.querySelectorAll<HTMLInputElement>('.hand-input input')[index]
}

function getRoundAction() {
  return document.querySelector<HTMLButtonElement>('.round-form .next-round-button')!
}

function getUndoButton() {
  return document.querySelector<HTMLButtonElement>('.app-shell > .undo-button')!
}

describe('scorekeeper flows', () => {
  it.each([0, 1, 5, 20])('scales the history frame to %i completed rounds and the entry row', async (roundCount) => {
    let game = createGame([{ id: 'ada', name: 'Ada' }, { id: 'bert', name: 'Bert' }], () => 0)
    for (let index = 0; index < roundCount; index++) {
      game = submitRound(game, { callerId: 'ada', hands: { ada: 0, bert: 1 } }, () => 0)
    }
    saveGame(game)
    const user = userEvent.setup()
    const { container } = render(<App />)
    await user.click(screen.getByRole('button', { name: 'Resume Game' }))
    const frame = container.querySelector('.scoreboard-history-frame')!
    expect(frame).toHaveAttribute('viewBox', `0 0 1000 ${(roundCount + 1) * 100}`)
    expect(frame.querySelector('path')!.getAttribute('d')!.match(/C /g)).toHaveLength((roundCount + 1) * 4)
    if (roundCount > 0) {
      await user.click(getUndoButton())
      expect(frame).toHaveAttribute('viewBox', `0 0 1000 ${roundCount * 100}`)
    }
  })

  it.each(['W'.repeat(40), 'Alexandria Catherine Montgomery Smith'])('fits %s to its column and regrows on resize without measuring hidden names', async (name) => {
    let availableWidth = 80
    const resizeCallbacks: (() => void)[] = []
    const disconnect = vi.fn()
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback: () => void) { resizeCallbacks.push(callback) }
      observe = vi.fn()
      disconnect = disconnect
    })
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const width = this.classList.contains('player-name') ? availableWidth
        : this.classList.contains('player-name-text') ? 320 * (Number.parseFloat(this.style.fontSize) || 16) / 16 : 0
      return new DOMRect(0, 0, width, 24)
    })
    saveGame(createGame([{ id: 'long', name }, { id: 'ada', name: 'Ada' }], () => 0))
    const user = userEvent.setup()
    const { container, unmount } = render(<App />)
    await user.click(screen.getByRole('button', { name: 'Resume Game' }))
    const headingNames = container.querySelectorAll<HTMLElement>('.scoreboard-heading .player-name-text')
    const text = headingNames[0]
    const entryNames = container.querySelectorAll<HTMLElement>('.scoreboard-entry-row .player-name-text')
    expect(Array.from(entryNames, (entryName) => entryName.style.fontSize)).toEqual([
      ...Array.from(headingNames, (headingName) => headingName.style.fontSize),
    ])
    const entryCells = container.querySelectorAll('.scoreboard-entry-row td')
    expect(entryCells[0].lastElementChild).toHaveClass('player-name')
    expect(container.querySelector('.scoreboard-name-row')).toBeNull()
    expect(Number.parseFloat(text.style.fontSize)).toBeCloseTo(3.97)
    expect(resizeCallbacks).toHaveLength(6)
    expect(container.querySelector('.sr-only .player-name-text')).toBeNull()

    availableWidth = 160
    act(() => resizeCallbacks.forEach((callback) => callback()))
    expect(Number.parseFloat(text.style.fontSize)).toBeCloseTo(7.97)
    expect(entryNames[0].style.fontSize).toBe(text.style.fontSize)
    availableWidth = 500
    act(() => window.dispatchEvent(new Event('resize')))
    expect(text.style.fontSize).toBe('')
    availableWidth = 0
    act(() => resizeCallbacks.forEach((callback) => callback()))
    expect(text.style.fontSize).toBe('')
    unmount()
    expect(disconnect).toHaveBeenCalledTimes(6)
  })

  it('shrinks score lines including adjustments and hands, then restores them when space returns', async () => {
    let availableWidth = 40
    const resizeCallbacks: (() => void)[] = []
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback: () => void) { resizeCallbacks.push(callback) }
      observe = vi.fn()
      disconnect = vi.fn()
    })
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const isText = /^(player-total|round-total|round-hand)-text$/.test(this.className)
      const width = isText ? 120 * (Number.parseFloat(this.style.fontSize) || 16) / 16 : availableWidth
      return new DOMRect(0, 0, width, 24)
    })
    const game = createGame([{ id: 'ada', name: 'Ada' }, { id: 'bert', name: 'Bert' }], () => 0)
    saveGame(submitRound(game, { callerId: 'ada', hands: { ada: 6, bert: -123456789 } }, () => 0))
    const user = userEvent.setup()
    const { container } = render(<App />)
    await user.click(screen.getByRole('button', { name: 'Resume Game' }))
    const scores = container.querySelectorAll<HTMLElement>('.player-total-text, .round-total-text, .round-hand-text')
    expect(scores).toHaveLength(6)
    for (const text of scores) expect(Number.parseFloat(text.style.fontSize)).toBeCloseTo(5.26)
    availableWidth = 80
    act(() => resizeCallbacks.forEach((callback) => callback()))
    for (const text of scores) expect(Number.parseFloat(text.style.fontSize)).toBeCloseTo(10.6)
    availableWidth = 200
    act(() => window.dispatchEvent(new Event('resize')))
    for (const text of scores) expect(text.style.fontSize).toBe('')
  })

  it('keeps the sticky player strip and exposes one accessible scoreboard without minimum table widths', async () => {
    const user = userEvent.setup()
    const { container } = render(<App />)
    await createTwoPlayerGame(user)
    const heading = container.querySelector<HTMLDivElement>('.scoreboard-heading')!
    const history = container.querySelector<HTMLDivElement>('.scoreboard-history')!

    expect(heading).toHaveAttribute('aria-hidden', 'true')
    expect(screen.getAllByRole('table')).toHaveLength(1)
    expect(within(screen.getByRole('table', { name: 'Scoreboard' })).getAllByRole('columnheader')).toHaveLength(2)
    expect(heading.querySelector('table')!.style.minWidth).toBe('')
    expect(history.querySelector('table')!.style.minWidth).toBe('')
    for (const header of container.querySelectorAll('.scoreboard th')) {
      expect(Array.from(header.children).map((child) => child.className)).toEqual(['player-name', 'player-tags', 'player-total'])
    }
    const dealer = heading.querySelector('.dealer-tag')!
    const dealerIndex = [...heading.querySelectorAll('th')].findIndex((header) => header.contains(dealer))
    await user.click(getWinButton(dealerIndex))
    expect(dealer.parentElement).toContainElement(heading.querySelector('.win-tag'))
    expect(dealer.parentElement?.nextElementSibling).toHaveClass('player-total')
  })

  it('limits setup to six players and allows adding again after removal', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(document.querySelector<HTMLButtonElement>('.welcome-actions .button-primary')!)
    const add = document.querySelector<HTMLButtonElement>('.player-add-row button')!
    for (let index = 2; index < 6; index += 1) await user.click(add)
    expect(screen.getAllByRole('textbox')).toHaveLength(6)
    expect(add).toBeDisabled()
    await user.click(add)
    expect(screen.getAllByRole('textbox')).toHaveLength(6)
    await user.click(document.querySelectorAll<HTMLButtonElement>('.player-edit-row button')[5])
    expect(add).toBeEnabled()
    await user.click(add)
    for (let index = 1; index <= 6; index += 1) {
      await user.type(screen.getAllByRole('textbox')[index - 1], `Player ${index}`)
    }
    await user.click(document.querySelector<HTMLButtonElement>('.page-content form .next-round-button')!)
    expect(within(screen.getByRole('table', { name: 'Scoreboard' })).getAllByRole('columnheader')).toHaveLength(6)
    expect(document.querySelectorAll('.win-button')).toHaveLength(6)
  })

  it('offers neither resume nor a warning for an oversized saved game', () => {
    const game = createGame(Array.from({ length: 6 }, (_, index) => ({ id: `p${index}`, name: `Player ${index}` })))
    game.players.push({ id: 'extra', name: 'Extra', score: 0 })
    saveGame(game)
    render(<App />)
    expect(document.querySelectorAll('.welcome-actions button')).toHaveLength(1)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('uses matching compact player controls and fixed setup navigation without a player box', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(document.querySelector<HTMLButtonElement>('.welcome-actions .button-primary')!)

    expect(screen.queryByRole('group', { name: 'Players' })).not.toBeInTheDocument()
    const start = document.querySelector<HTMLButtonElement>('.page-content form .next-round-button')!
    expect(start).toHaveClass('next-round-button')
    expect(start).toBeDisabled()
    expect(document.querySelector('.app-shell > .undo-button')).toBeInTheDocument()
    const add = document.querySelector<HTMLButtonElement>('.player-add-row button')!
    expect(add).toHaveClass('player-control')
    for (const remove of document.querySelectorAll('.player-edit-row button')) {
      expect(remove).toHaveClass('player-control')
      expect(remove).toBeDisabled()
    }

    await user.type(screen.getAllByRole('textbox')[0], 'Ada')
    await user.type(screen.getAllByRole('textbox')[1], 'Bert')
    expect(start).toBeEnabled()
    await user.click(add)
    expect(screen.getAllByRole('textbox')).toHaveLength(3)
    expect(start).toBeDisabled()
    await user.type(screen.getAllByRole('textbox')[2], 'Cody')
    expect(start).toBeEnabled()
    const remove = document.querySelectorAll<HTMLButtonElement>('.player-edit-row button')[2]
    expect(remove).toHaveClass('player-control')
    await user.click(remove)
    expect(screen.getAllByRole('textbox')).toHaveLength(2)
    expect(screen.getAllByRole('textbox')[0]).toHaveValue('Ada')
    expect(screen.getAllByRole('textbox')[1]).toHaveValue('Bert')
    expect(start).toBeEnabled()
    expect(document.querySelectorAll<HTMLButtonElement>('.player-edit-row button')[0]).toBeDisabled()
    await user.click(document.querySelector<HTMLButtonElement>('.app-shell > .undo-button')!)
    expect(document.querySelector('.welcome-actions')).toBeInTheDocument()
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('keeps the round and quit action in the header without a scoreboard heading', async () => {
    const user = userEvent.setup()
    const { container } = render(<App />)
    await createTwoPlayerGame(user)

    const header = within(container.querySelector('header')!)
    expect(header.getByRole('button')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Scoreboard' })).not.toBeInTheDocument()
  })

  it('commits a valid round immediately with Next round and no confirmation screen', async () => {
    const user = userEvent.setup()
    render(<App />)
    await createTwoPlayerGame(user)

    await user.click(getWinButton(0))
    await user.type(getHandInput(0), '-1')
    await user.type(getHandInput(1), '2')
    await user.click(getRoundAction())

    expect(screen.queryByRole('heading', { name: 'Confirm round' })).not.toBeInTheDocument()
    expect(screen.queryByRole('table', { name: 'Round summary' })).not.toBeInTheDocument()

    expect(document.querySelectorAll('.hand-input input')).toHaveLength(0)
    expect(getWinButton(0)).toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).game.rounds).toHaveLength(1)
  })

  it('enters signed values with the standard text keyboard', async () => {
    const user = userEvent.setup()
    render(<App />)
    await createTwoPlayerGame(user)
    await user.click(getWinButton(0))

    const ada = getHandInput(0)
    expect(ada).toHaveAttribute('type', 'text')
    expect(ada).not.toHaveAttribute('inputmode')
    expect(screen.queryByRole('group', { name: 'Score keypad' })).not.toBeInTheDocument()
    await user.type(ada, '-4')
    expect(ada).toHaveValue('-4')

    await user.click(getHandInput(1))
    const bert = getHandInput(1)
    expect(document.activeElement).toBe(bert)
    await user.type(bert, '2')
    await user.click(getRoundAction())

    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).game.rounds[0].hands).toEqual({
      [JSON.parse(localStorage.getItem(STORAGE_KEY)!).game.players[0].id]: -4,
      [JSON.parse(localStorage.getItem(STORAGE_KEY)!).game.players[1].id]: 2,
    })
  })

  it('keeps compact hand fields unrestricted by range or character length', async () => {
    const user = userEvent.setup()
    render(<App />)
    await createTwoPlayerGame(user)
    await user.click(getWinButton(0))
    const ada = getHandInput(0)
    expect(ada).not.toHaveAttribute('maxlength')
    expect(ada).not.toHaveAttribute('min')
    expect(ada).not.toHaveAttribute('max')
    expect(ada).not.toHaveAttribute('inputmode')
    await user.type(ada, '-123')
    expect(ada).toHaveValue('-123')
    await user.type(getHandInput(1), '51')
    await user.click(getRoundAction())
    expect(Object.values(JSON.parse(localStorage.getItem(STORAGE_KEY)!).game.rounds[0].hands)).toEqual([-123, 51])
  })

  it('uses standard text inputs and enables the round action only for complete active-player values', async () => {
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
    await user.click(getWinButton(0))

    expect(document.querySelectorAll('.hand-input input')).toHaveLength(2)
    expect(screen.queryByRole('group', { name: 'Score keypad' })).not.toBeInTheDocument()
    expect(getRoundAction()).toBeDisabled()
    await user.click(getRoundAction())
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    await user.type(getHandInput(0), '-1')
    expect(getRoundAction()).toBeDisabled()
    await user.click(getHandInput(1))
    await user.type(getHandInput(1), '3')
    expect(getRoundAction()).toBeEnabled()
    await user.click(getRoundAction())

    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).game.rounds.at(-1).hands).toEqual({ ada: -1, cody: 3 })
  })

  it('disables the round action for missing or invalid values without changing the last committed save', async () => {
    const user = userEvent.setup()
    render(<App />)
    await createTwoPlayerGame(user)
    const committed = localStorage.getItem(STORAGE_KEY)

    await user.click(getWinButton(0))
    const nextRound = getRoundAction()
    expect(nextRound).toBeDisabled()
    await user.click(nextRound)

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(localStorage.getItem(STORAGE_KEY)).toBe(committed)
    const ada = getHandInput(0)
    const bert = getHandInput(1)
    await user.type(ada, '0')
    expect(nextRound).toBeDisabled()
    for (const value of ['-', '1.5', 'abc', '9007199254740992']) {
      await user.type(bert, value)
      expect(nextRound).toBeDisabled()
      await user.clear(bert)
    }
    await user.type(bert, '-2')
    expect(nextRound).toBeEnabled()
    await user.clear(ada)
    expect(nextRound).toBeDisabled()
    await user.type(ada, '0')
    expect(nextRound).toBeEnabled()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(localStorage.getItem(STORAGE_KEY)).toBe(committed)
  })

  it('instantly undoes a restored round with its caller and editable values, then saves corrections', async () => {
    const user = userEvent.setup()
    const firstRender = render(<App />)
    await createTwoPlayerGame(user)
    const initialGame = JSON.parse(localStorage.getItem(STORAGE_KEY)!).game
    await user.click(getWinButton(0))
    await user.type(getHandInput(0), '1')
    await user.type(getHandInput(1), '2')
    await user.click(getRoundAction())
    firstRender.unmount()

    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Resume Game' }))
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    await user.click(getUndoButton())

    expect(window.confirm).not.toHaveBeenCalled()
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).game).toEqual(initialGame)
    expect(getHandInput(0)).toHaveValue('1')
    expect(getHandInput(1)).toHaveValue('2')
    await user.clear(getHandInput(1))
    await user.type(getHandInput(1), '4')
    await user.click(getRoundAction())
    const corrected = JSON.parse(localStorage.getItem(STORAGE_KEY)!).game
    expect(corrected.rounds).toHaveLength(1)
    expect(corrected.rounds[0]).toMatchObject({ callerId: initialGame.players[0].id, hands: { [initialGame.players[0].id]: 1, [initialGame.players[1].id]: 4 } })
    expect(corrected.players[1].score).toBe(4)
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
    expect(screen.getByRole('columnheader', { name: /Ada/ }).querySelector('.status-winner')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Game results' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Player scores after each round' })).toBeInTheDocument()

    const playAgain = document.querySelector<HTMLButtonElement>('.results .next-round-button')!
    expect(playAgain).toHaveClass('next-round-button')
    await user.click(playAgain)
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!)
    expect(saved.game.rounds).toHaveLength(0)
    expect(saved.game.players.map((player: { name: string; score: number }) => [player.name, player.score])).toEqual([
      ['Ada', 0],
      ['Bert', 0],
    ])

    vi.spyOn(window, 'confirm').mockReturnValue(false)
    await user.click(document.querySelector<HTMLButtonElement>('.header-quit')!)
    expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull()
    vi.mocked(window.confirm).mockReturnValue(true)
    await user.click(document.querySelector<HTMLButtonElement>('.header-quit')!)
    await waitFor(() => expect(localStorage.getItem(STORAGE_KEY)).toBeNull())
    expect(document.querySelector('.welcome-actions')).toBeInTheDocument()
    expect(document.querySelectorAll('.welcome-actions button')).toHaveLength(1)
  })

  it('replaces the winner score with a crown and styles the winner tag', async () => {
    const initial = createGame([{ id: 'ada', name: 'Ada' }, { id: 'bert', name: 'Bert' }], () => 0)
    const game = submitRound({
      ...initial,
      players: initial.players.map((player) => ({ ...player, score: player.id === 'bert' ? 75 : 0 })),
    }, { callerId: 'bert', hands: { ada: 1, bert: 6 } })
    saveGame(game)

    render(<App />)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Resume Game' }))

    const winnerCard = screen.getByRole('columnheader', { name: /Ada/ })
    expect(winnerCard.querySelector('.status-winner')).toBeInTheDocument()
  })

  it('caps graph scores at 100 and ends eliminated lines at their last played round', async () => {
    const initial = createGame([
      { id: 'ada', name: 'Ada' }, { id: 'bert', name: 'Bert' }, { id: 'cody', name: 'Cody' },
    ], () => 0)
    const first = submitRound(initial, { callerId: 'ada', hands: { ada: 0, bert: 101, cody: 76 } }, () => 0)
    saveGame(submitRound(first, { callerId: 'cody', hands: { ada: 0, cody: 6 } }, () => 0))
    render(<App />)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Resume Game' }))
    const chart = screen.getByRole('img', { name: 'Player scores after each round' })
    const lines = [...chart.querySelectorAll('polyline')].map((line) => line.getAttribute('points')!.split(' '))
    expect(lines[0]).toEqual(['56,202', '278,202', '500,202'])
    expect(lines[1]).toEqual(['56,202', '278,32'])
    expect(lines[2]).toHaveLength(3)
    expect(Number(lines[2][1].split(',')[1])).toBeCloseTo(72.8)
    expect(lines[2][2]).toBe('500,32')
    for (const [id, endX] of [['bert', '278'], ['cody', '500']]) {
      const marker = chart.querySelector(`[data-player-id="${id}"] .chart-skull`)!
      expect(marker).toHaveAttribute('x', endX)
      expect(marker).toHaveAttribute('y', '32')
    }
    expect(chart.querySelector('[data-player-id="ada"] .chart-skull')).toBeNull()
    const trophy = within(chart).getByRole('img', { name: 'Ada winner' })
    expect(trophy).toHaveAttribute('x', '500')
    expect(trophy).toHaveAttribute('y', '202')
    const names = [...chart.querySelectorAll('.chart-name')]
    const positions = names.map((name) => Number(name.getAttribute('y'))).sort((left, right) => left - right)
    expect(positions.every((position, index) => index === 0 || position - positions[index - 1] >= 22)).toBe(true)
  })

  it.each([false, true])('separates six endpoint names for simultaneous eliminations (no winner: %s)', async (noWinner) => {
    const name = 'Alexandria Catherine Montgomery Smith'
    const initial = createGame(Array.from({ length: 6 }, (_, index) => ({ id: `player-${index}`, name })), () => 0)
    const game = submitRound({
      ...initial,
      players: initial.players.map((player, index) => ({ ...player, score: noWinner ? (index === 0 ? 75 : 98) : 0 })),
    }, {
      callerId: 'player-0',
      hands: Object.fromEntries(initial.players.map((player, index) => [player.id, noWinner ? 5 : (index === 0 ? 0 : 101)])),
    }, () => 0)
    saveGame(game)
    render(<App />)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Resume Game' }))
    const chart = screen.getByRole('img', { name: 'Player scores after each round' })
    expect(chart.querySelectorAll('.chart-skull')).toHaveLength(noWinner ? 6 : 5)
    expect(chart.querySelectorAll('.chart-trophy')).toHaveLength(noWinner ? 0 : 1)
    const positions = [...chart.querySelectorAll('.chart-name')].map((label) => Number(label.getAttribute('y'))).sort((left, right) => left - right)
    expect(positions).toHaveLength(6)
    expect(positions[0]).toBeGreaterThanOrEqual(32)
    expect(positions[5]).toBeLessThanOrEqual(202)
    expect(positions.every((position, index) => index === 0 || position - positions[index - 1] >= 22)).toBe(true)
    for (const player of game.players) {
      const endpoint = chart.querySelector(`[data-player-id="${player.id}"]`)!
      expect(endpoint.querySelector('.chart-skull') !== null).toBe(player.score >= 100)
    }
    expect(game.winnerId).toBe(noWinner ? null : 'player-0')
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
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    await user.click(getUndoButton())
    expect(window.confirm).not.toHaveBeenCalled()
    expect(screen.getByRole('table', { name: 'Scoreboard' })).toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).game.rounds).toHaveLength(0)
    expect(getHandInput(0)).toHaveValue('1')
    expect(getHandInput(1)).toHaveValue('6')
    expect(screen.queryByRole('img', { name: 'Eliminated' })).not.toBeInTheDocument()
    await user.clear(getHandInput(1))
    await user.type(getHandInput(1), '0')
    await user.click(getRoundAction())
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).game.players[1].score).toBe(50)
  })

  it('undoes caller selection while retaining hand values in the same grid row', async () => {
    saveGame(createGame([{ id: 'ada', name: 'Ada' }, { id: 'bert', name: 'Bert' }], () => 0))
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Resume Game' }))
    const committed = localStorage.getItem(STORAGE_KEY)
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument()
    const entry = screen.getByRole('row', { name: 'Round 1 entry' })
    const cells = within(entry).getAllByRole('cell')
    expect(within(cells[0]).getByRole('button')).toHaveAttribute('title')

    await user.click(getWinButton(0))
    expect(within(cells[0]).getByRole('textbox')).toBeInTheDocument()
    expect(within(cells[1]).getByRole('textbox')).toBeInTheDocument()
    expect(cells[0].querySelector('label')).toHaveClass('sr-only')
    await user.type(getHandInput(0), '1')
    await user.type(getHandInput(1), '4')

    await user.click(getUndoButton())
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument()
    await user.click(getWinButton(1))
    expect(getHandInput(0)).toHaveValue('1')
    expect(getHandInput(1)).toHaveValue('4')
    expect(localStorage.getItem(STORAGE_KEY)).toBe(committed)
    await user.click(getRoundAction())
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).game.rounds[0]).toMatchObject({ callerId: 'bert', hands: { ada: 1, bert: 4 } })
  })

  it.each([
    { name: 'low caller penalty', before: [0, 0], hands: { ada: 4, bert: 3 }, adjustments: ['penalty', null] },
    { name: 'tied caller penalty', before: [0, 0], hands: { ada: 5, bert: 5 }, adjustments: ['penalty', null] },
    { name: 'high caller penalty with suppressed opponent score', before: [0, 0], hands: { ada: 6, bert: 50 }, adjustments: ['penalty', null] },
    { name: 'negative hand reaching 50', before: [51, 0], hands: { ada: -1, bert: 2 }, adjustments: ['reduction', null] },
    { name: 'opponent reduction with caller penalty', before: [0, 47], hands: { ada: 4, bert: 3 }, adjustments: ['penalty', 'reduction'] },
    { name: 'opponent reaching 50', before: [0, 48], hands: { ada: -1, bert: 2 }, adjustments: [null, 'reduction'] },
    { name: 'opponent reaching 75', before: [0, 73], hands: { ada: 1, bert: 2 }, adjustments: [null, 'reduction'] },
    { name: 'opponent reaching 100', before: [0, 98], hands: { ada: 1, bert: 2 }, adjustments: [null, 'reduction'] },
    { name: 'ordinary negative hand', before: [10, 0], hands: { ada: -1, bert: 2 }, adjustments: [null, null] },
    { name: 'zero clamping without a reduction', before: [0, 0], hands: { ada: -1, bert: 2 }, adjustments: [null, null] },
    { name: 'zero hand without a sign', before: [0, 0], hands: { ada: 0, bert: 5 }, adjustments: [null, null] },
  ])('applies the expected score adjustments for $name', async ({ before, hands, adjustments }) => {
    const initial = createGame([{ id: 'ada', name: 'Ada' }, { id: 'bert', name: 'Bert' }], () => 0)
    saveGame(submitRound({
      ...initial,
      players: initial.players.map((player, index) => ({ ...player, score: before[index] })),
    }, { callerId: 'ada', hands }, () => 0))
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Resume Game' }))

    const cells = within(screen.getByRole('row', { name: 'Round 1' })).getAllByRole('cell')
    for (const [index, cell] of cells.entries()) {
      const total = cell.querySelector<HTMLSpanElement>('.round-total')!
      expect(cell.firstElementChild).toBe(total)
      const adjustment = adjustments[index]
      if (adjustment) {
        expect(cell).toHaveClass(`score-${adjustment}`)
        const annotation = total.querySelector('sup')
        expect(annotation).not.toBeNull()
        expect(annotation?.tagName).toBe('SUP')
      } else {
        expect(cell).not.toHaveClass('score-penalty', 'score-reduction')
      }
    }
  })

  it('preserves earlier totals when a player exceeds 100 and restores their total on undo', async () => {
    const initial = createGame([
      { id: 'ada', name: 'Ada' }, { id: 'bert', name: 'Bert' }, { id: 'cody', name: 'Cody' },
    ], () => 0)
    const prior = submitRound(initial, { callerId: 'ada', hands: { ada: 0, bert: 76, cody: 2 } }, () => 0)
    saveGame(submitRound(prior, { callerId: 'bert', hands: { ada: 1, bert: 6, cody: 2 } }, () => 0))
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Resume Game' }))
    const eliminated = within(screen.getByRole('row', { name: 'Round 2' })).getAllByRole('cell')[1]
    expect(eliminated.lastElementChild).toHaveClass('round-hand')

    await user.click(getUndoButton())
    expect(getHandInput(1)).toHaveValue('6')
    expect(screen.queryByRole('img', { name: 'Eliminated' })).not.toBeInTheDocument()
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
    expect(table.getAllByRole('columnheader')).toHaveLength(3)
    const elimination = within(table.getByRole('row', { name: 'Round 1' })).getAllByRole('cell')[1]
    expect(elimination.lastElementChild).toHaveClass('round-hand')
    expect(within(elimination).getByRole('img', { name: 'Eliminated' })).toBeInTheDocument()
    const history = within(table.getByRole('row', { name: 'Round 2' })).getAllByRole('cell')
    expect(history).toHaveLength(3)
    expect(history[1]).toBeEmptyDOMElement()
    expect(within(table.getByRole('row', { name: 'Round 3 entry' })).getAllByRole('cell')[1].querySelector('.win-button')).toBeNull()
    await user.click(getWinButton(0))
    expect(document.querySelectorAll('.hand-input input')).toHaveLength(2)
    expect(within(table.getByRole('row', { name: 'Round 3 entry' }).querySelectorAll('td')[1]).queryByRole('textbox')).toBeNull()
    expect(within(table.getByRole('row', { name: 'Round 3 entry' })).getAllByRole('cell')).toHaveLength(3)
  })
})