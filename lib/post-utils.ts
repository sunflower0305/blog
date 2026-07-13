export function sanitizePostSlugInput(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/_{2,}/g, '_')
}

export function normalizePostSlug(value: string): string {
  return sanitizePostSlugInput(value)
    .replace(/^[-_]+|[-_]+$/g, '')
}

export function buildAutoDescription(value: string, maxLength = 160): string {
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (!normalized) return ''
  return normalized.slice(0, maxLength)
}

const LOCAL_POST_IMAGE_URL = /(?:https?:\/\/[^\s"'<>()[\]]+)?\/api\/images\/image\/[^\s"'<>()[\]]+/gi
const NON_TRANSFORMABLE_IMAGE = /\.(?:gif|svg)$/i

export function optimizePostImageUrls(value: string, siteUrl: string): string {
  if (!value || !value.includes('/api/images/image/')) return value

  let siteOrigin: string
  try {
    siteOrigin = new URL(siteUrl).origin
  } catch {
    return value
  }

  return value.replace(LOCAL_POST_IMAGE_URL, (input) => {
    const hasEscapedAmpersands = input.includes('&amp;')
    const decodedInput = hasEscapedAmpersands ? input.replaceAll('&amp;', '&') : input
    const isAbsolute = /^https?:\/\//i.test(decodedInput)

    let url: URL
    try {
      url = new URL(decodedInput, siteOrigin)
    } catch {
      return input
    }

    if ((isAbsolute && url.origin !== siteOrigin) || !url.pathname.startsWith('/api/images/image/')) {
      return input
    }
    if (NON_TRANSFORMABLE_IMAGE.test(url.pathname) || url.searchParams.get('__raw') === '1') {
      return input
    }

    let changed = false
    if (!url.searchParams.has('w') && !url.searchParams.has('width')) {
      url.searchParams.set('w', '1600')
      changed = true
    }
    if (!url.searchParams.has('q') && !url.searchParams.has('quality')) {
      url.searchParams.set('q', '85')
      changed = true
    }
    const format = url.searchParams.get('format')
    if (!format || format === 'webp') {
      url.searchParams.set('format', 'auto')
      changed = true
    }

    if (!changed) return input

    const optimized = isAbsolute
      ? url.toString()
      : `${url.pathname}${url.search}${url.hash}`
    return hasEscapedAmpersands ? optimized.replaceAll('&', '&amp;') : optimized
  })
}
