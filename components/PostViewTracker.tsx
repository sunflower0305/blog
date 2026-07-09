'use client'

import { useEffect } from 'react'

export function PostViewTracker({ slug }: { slug: string }) {
  useEffect(() => {
    const payload = JSON.stringify({ slug })

    if (navigator.sendBeacon) {
      const blob = new Blob([payload], { type: 'application/json' })
      if (navigator.sendBeacon('/api/posts/views', blob)) {
        return
      }
    }

    fetch('/api/posts/views', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      keepalive: true,
    }).catch(() => {})
  }, [slug])

  return null
}
