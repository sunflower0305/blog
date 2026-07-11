import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('article page layer ordering', () => {
  it('keeps the inline editor toolbar below header popovers', () => {
    const header = readFileSync('components/SiteHeader.tsx', 'utf8')
    const inlineEditor = readFileSync('components/InlineArticleEditor.tsx', 'utf8')

    expect(header).toMatch(/top-0 z-40\b/)
    expect(inlineEditor).toMatch(/fixed top-16[^\n]*\bz-30\b/)
  })
})
