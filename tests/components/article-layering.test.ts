import { describe, expect, it } from 'vitest'
import { getVerticalCollisionOffset } from '@/lib/popover-position'

describe('article page layer ordering', () => {
  it('moves a header popover below an intersecting editor toolbar', () => {
    const popover = { top: 72, right: 586, bottom: 304, left: 406 }
    const toolbar = { top: 97, right: 586, bottom: 168, left: 182 }

    expect(getVerticalCollisionOffset(popover, toolbar)).toBe(104)
  })

  it('does not move a popover that does not intersect the toolbar', () => {
    const popover = { top: 72, right: 160, bottom: 304, left: 40 }
    const toolbar = { top: 97, right: 586, bottom: 168, left: 182 }

    expect(getVerticalCollisionOffset(popover, toolbar)).toBe(0)
  })
})
