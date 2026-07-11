import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('article page layer ordering', () => {
  it('keeps header popovers above the inline editor toolbar', () => {
    const header = readFileSync('components/SiteHeader.tsx', 'utf8')
    const inlineEditor = readFileSync('components/InlineArticleEditor.tsx', 'utf8')

    expect(header).toMatch(/top-0 z-40\b/)
    expect(inlineEditor).toMatch(/data-inline-editor-toolbar[\s\S]*?\bz-30\b/)
  })

  it('anchors category and theme dropdowns eight pixels below their triggers', () => {
    const header = readFileSync('components/SiteHeader.tsx', 'utf8')
    const themeDropdown = readFileSync('components/ThemeDropdown.tsx', 'utf8')

    expect(header).toContain('absolute top-full left-0 mt-2')
    expect(themeDropdown).toContain("top: inlineMenu ? undefined : 'calc(100% + 8px)'")
  })
})
