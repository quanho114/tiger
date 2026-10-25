import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SwipeCartRow } from '@/features/ordering/checkout/SwipeCartRow'

function Fixture({ remove }: { remove: () => void }) {
  const [open, setOpen] = useState(false)
  return <SwipeCartRow name="Gà" open={open} onOpenChange={setOpen} onRemove={remove}><span>Gà</span></SwipeCartRow>
}

describe('SwipeCartRow', () => {
  afterEach(() => vi.unstubAllGlobals())
  it('reveals a quarter width on horizontal swipe, ignores vertical scroll, and cancels safely', () => {
    class TestPointerEvent extends MouseEvent {
      pointerId = 1
      isPrimary = true
    }
    vi.stubGlobal('PointerEvent', TestPointerEvent)
    const remove = vi.fn()
    render(<Fixture remove={remove} />)
    const row = screen.getByRole('group', { name: 'Món Gà' })
    vi.spyOn(row, 'getBoundingClientRect').mockReturnValue({ width: 320 } as DOMRect)
    Object.defineProperty(row, 'setPointerCapture', { value: vi.fn(), configurable: true })
    fireEvent.pointerDown(row, { clientX: 200, clientY: 50, button: 0 })
    fireEvent.pointerMove(row, { clientX: 195, clientY: 100 })
    fireEvent.pointerUp(row)
    expect(screen.queryByRole('button', { name: /Xóa món/ })).not.toBeInTheDocument()
    fireEvent.pointerDown(row, { clientX: 200, clientY: 50, button: 0 })
    fireEvent.pointerMove(row, { clientX: 100, clientY: 51 })
    fireEvent.pointerCancel(row)
    expect(screen.queryByRole('button', { name: /Xóa món/ })).not.toBeInTheDocument()
    fireEvent.pointerDown(row, { clientX: 200, clientY: 50, button: 0 })
    fireEvent.pointerMove(row, { clientX: 100, clientY: 51 })
    expect(row.style.getPropertyValue('--swipe-progress')).toBe('1')
    expect(row.style.getPropertyValue('--swipe-duration')).toBe('0ms')
    fireEvent.lostPointerCapture(screen.getByText('Gà'))
    fireEvent.pointerMove(row, { clientX: 110, clientY: 51 })
    expect(row.style.getPropertyValue('--swipe-progress')).toBe('1')
    fireEvent.pointerUp(row)
    expect(screen.getByRole('button', { name: /Xóa món/ })).toBeVisible()
    expect(row.style.getPropertyValue('--swipe-progress')).toBe('1')
    expect(row.lastElementChild).not.toHaveAttribute('style')
    expect(remove).not.toHaveBeenCalled()
  })
  it('closes on an outside press without removing the item', () => {
    const remove = vi.fn()
    render(<><Fixture remove={remove} /><button>Khoảng ngoài</button></>)
    const row = screen.getByRole('group', { name: 'Món Gà' })
    fireEvent.keyDown(row, { key: 'ArrowLeft' })
    fireEvent.pointerDown(screen.getByText('Khoảng ngoài'))
    expect(screen.queryByRole('button', { name: /Xóa món/ })).not.toBeInTheDocument()
    expect(remove).not.toHaveBeenCalled()
    expect(row.style.getPropertyValue('--swipe-progress')).toBe('0')
  })
  it('offers keyboard reveal, cancel and explicit deletion without deleting on reveal', () => {
    const remove = vi.fn()
    render(<Fixture remove={remove} />)
    const row = screen.getByRole('group', { name: 'Món Gà' })
    expect(screen.queryByRole('button', { name: /Xóa món/ })).not.toBeInTheDocument()
    fireEvent.keyDown(row, { key: 'ArrowLeft' })
    expect(remove).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /Xóa món/ })).toHaveAttribute('tabindex', '0')
    fireEvent.keyDown(row, { key: 'Escape' })
    expect(screen.queryByRole('button', { name: /Xóa món/ })).not.toBeInTheDocument()
    fireEvent.keyDown(row, { key: 'Delete' })
    fireEvent.click(screen.getByRole('button', { name: /Xóa món/ }))
    expect(remove).toHaveBeenCalledTimes(1)
  })
})
