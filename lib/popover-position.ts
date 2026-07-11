export interface RectLike {
  top: number
  right: number
  bottom: number
  left: number
}

export function getVerticalCollisionOffset(
  popover: RectLike,
  obstacle: RectLike,
  gap = 8,
): number {
  const overlapsHorizontally = popover.left < obstacle.right && popover.right > obstacle.left
  const overlapsVertically = popover.top < obstacle.bottom && popover.bottom > obstacle.top

  if (!overlapsHorizontally || !overlapsVertically) return 0
  return obstacle.bottom - popover.top + gap
}
