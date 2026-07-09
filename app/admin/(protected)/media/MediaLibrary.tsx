'use client'

import { useState, useEffect, useCallback, useRef, DragEvent } from 'react'
import { Upload, Copy, Trash2, Search, Image, Film, FileText, X, Check } from 'lucide-react'
import { useToast } from '@/components/Toast'
import { Modal } from '@/components/Modal'

interface MediaItem {
  id: number
  key: string
  url: string
  filename: string
  original_name: string
  file_type: string
  category: string
  size: number
  created_at: number
}

interface MediaResponse {
  items: MediaItem[]
  total: number
  page: number
  pageSize: number
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(ts: number): string {
  return new Date(ts * 1000).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', year: 'numeric' })
}

function MediaCard({
  item,
  onDelete,
  onCopy,
  copiedKey,
}: {
  item: MediaItem
  onDelete: (item: MediaItem) => void
  onCopy: (item: MediaItem) => void
  copiedKey: string | null
}) {
  const isImage = item.category === 'image'
  const isVideo = item.category === 'video'
  const isCopied = copiedKey === item.key

  return (
    <div className="group relative rounded-xl border border-[var(--editor-line)] bg-[var(--editor-panel)] overflow-hidden hover:border-[var(--editor-accent)]/40 transition-colors">
      {/* Thumbnail */}
      <div className="aspect-video bg-[var(--editor-soft)] flex items-center justify-center overflow-hidden">
        {isImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`${item.url}?w=400&q=75&format=webp`}
            alt={item.original_name}
            className="w-full h-full object-cover"
            loading="lazy"
            onError={(e) => {
              // fallback if image transform fails
              ;(e.target as HTMLImageElement).src = item.url
            }}
          />
        ) : isVideo ? (
          <Film className="w-10 h-10 text-[var(--editor-muted)]" />
        ) : (
          <FileText className="w-10 h-10 text-[var(--editor-muted)]" />
        )}
      </div>

      {/* Info */}
      <div className="p-3">
        <p className="text-xs text-[var(--editor-ink)] font-medium truncate" title={item.original_name}>
          {item.original_name}
        </p>
        <p className="text-xs text-[var(--editor-muted)] mt-0.5">
          {formatBytes(item.size)} · {formatDate(item.created_at)}
        </p>
      </div>

      {/* Actions overlay */}
      <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={() => onCopy(item)}
          className="p-1.5 rounded-lg bg-[var(--editor-panel)]/90 backdrop-blur border border-[var(--editor-line)] hover:bg-[var(--editor-soft)] transition-colors"
          title="复制 URL"
        >
          {isCopied ? (
            <Check className="w-3.5 h-3.5 text-green-500" />
          ) : (
            <Copy className="w-3.5 h-3.5 text-[var(--editor-muted)]" />
          )}
        </button>
        <button
          onClick={() => onDelete(item)}
          className="p-1.5 rounded-lg bg-[var(--editor-panel)]/90 backdrop-blur border border-[var(--editor-line)] hover:bg-[var(--editor-soft)] transition-colors"
          title="删除"
        >
          <Trash2 className="w-3.5 h-3.5 text-rose-500" />
        </button>
      </div>
    </div>
  )
}

export function MediaLibrary() {
  const toast = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [items, setItems] = useState<MediaItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(24)
  const [q, setQ] = useState('')
  const [draftQ, setDraftQ] = useState('')
  const [category, setCategory] = useState('all')
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<MediaItem | null>(null)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  const fetchMedia = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page) })
      if (q) params.set('q', q)
      if (category !== 'all') params.set('category', category)
      const res = await fetch(`/api/admin/media?${params}`)
      if (!res.ok) throw new Error('fetch failed')
      const data: MediaResponse = await res.json()
      setItems(data.items)
      setTotal(data.total)
      setPageSize(data.pageSize)
    } catch {
      toast.error('加载失败')
    } finally {
      setLoading(false)
    }
  }, [page, q, category, toast])

  useEffect(() => {
    fetchMedia()
  }, [fetchMedia])

  async function uploadFiles(files: FileList | File[]) {
    const arr = Array.from(files)
    if (arr.length === 0) return
    setUploading(true)
    let succeeded = 0
    for (const file of arr) {
      const fd = new FormData()
      fd.append('file', file)
      try {
        const res = await fetch('/api/uploads', { method: 'POST', body: fd })
        const data = await res.json()
        if (data.success) succeeded++
        else toast.error(`上传失败: ${file.name}`)
      } catch {
        toast.error(`上传失败: ${file.name}`)
      }
    }
    setUploading(false)
    if (succeeded > 0) {
      toast.success(`上传成功 ${succeeded} 个文件`)
      setPage(1)
      fetchMedia()
    }
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files) uploadFiles(e.target.files)
    e.target.value = ''
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragOver(false)
    if (e.dataTransfer.files) uploadFiles(e.dataTransfer.files)
  }

  function handleDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragOver(true)
  }

  function handleCopy(item: MediaItem) {
    const url = `${window.location.origin}${item.url}`
    navigator.clipboard.writeText(url).then(() => {
      setCopiedKey(item.key)
      toast.success('URL 已复制')
      setTimeout(() => setCopiedKey(null), 2000)
    })
  }

  async function handleDelete() {
    if (!deleteTarget) return
    const encodedKey = encodeURIComponent(deleteTarget.key)
    try {
      const res = await fetch(`/api/admin/media/${encodedKey}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      toast.success('已删除')
      setItems(prev => prev.filter(i => i.key !== deleteTarget.key))
      setTotal(prev => prev - 1)
    } catch {
      toast.error('删除失败')
    } finally {
      setDeleteTarget(null)
    }
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    setQ(draftQ)
    setPage(1)
  }

  const totalPages = Math.ceil(total / pageSize)
  const isEmpty = !loading && items.length === 0

  return (
    <div
      className="space-y-6"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={() => setDragOver(false)}
    >
      {/* Drag overlay */}
      {dragOver && (
        <div className="fixed inset-0 z-50 bg-[var(--editor-accent)]/10 border-4 border-dashed border-[var(--editor-accent)] flex items-center justify-center pointer-events-none">
          <div className="text-[var(--editor-accent)] text-xl font-medium">松开以上传文件</div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <h1
          className="text-2xl font-medium text-[var(--editor-ink)]"
          style={{ fontFamily: 'Georgia, "Noto Serif SC", serif' }}
        >
          媒体库
          {total > 0 && (
            <span className="ml-2 text-base text-[var(--editor-muted)] font-normal">{total}</span>
          )}
        </h1>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--editor-accent)] text-white rounded-lg text-sm font-medium hover:brightness-105 transition-all disabled:opacity-60"
        >
          <Upload className="w-4 h-4" />
          {uploading ? '上传中…' : '上传文件'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,video/*"
          className="hidden"
          onChange={handleFileInput}
        />
      </div>

      {/* Search + filter */}
      <div className="flex gap-3 flex-wrap">
        <form onSubmit={handleSearch} className="flex gap-2 flex-1 min-w-0">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--editor-muted)]" />
            <input
              type="text"
              placeholder="搜索文件名…"
              value={draftQ}
              onChange={e => setDraftQ(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-[var(--editor-line)] bg-[var(--background)] text-sm focus:outline-none focus:border-[var(--editor-accent)] focus:ring-2 focus:ring-[var(--editor-accent)]/20"
            />
            {draftQ && (
              <button
                type="button"
                onClick={() => { setDraftQ(''); setQ(''); setPage(1) }}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-[var(--editor-muted)] hover:text-[var(--editor-ink)]"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <button type="submit" className="px-3 py-2 rounded-lg border border-[var(--editor-line)] bg-[var(--editor-panel)] text-sm text-[var(--editor-muted)] hover:text-[var(--editor-ink)] hover:bg-[var(--editor-soft)] transition-colors">
            搜索
          </button>
        </form>

        <div className="flex rounded-lg border border-[var(--editor-line)] overflow-hidden text-sm">
          {(['all', 'image', 'video'] as const).map(cat => (
            <button
              key={cat}
              onClick={() => { setCategory(cat); setPage(1) }}
              className={`px-3 py-2 flex items-center gap-1.5 transition-colors ${
                category === cat
                  ? 'bg-[var(--editor-accent)] text-white'
                  : 'bg-[var(--editor-panel)] text-[var(--editor-muted)] hover:bg-[var(--editor-soft)] hover:text-[var(--editor-ink)]'
              }`}
            >
              {cat === 'all' && '全部'}
              {cat === 'image' && <><Image className="w-3.5 h-3.5" />图片</>}
              {cat === 'video' && <><Film className="w-3.5 h-3.5" />视频</>}
            </button>
          ))}
        </div>
      </div>

      {/* Empty state / drop zone */}
      {isEmpty ? (
        <div
          onClick={() => fileInputRef.current?.click()}
          className="flex flex-col items-center justify-center gap-4 py-20 border-2 border-dashed border-[var(--editor-line)] rounded-2xl cursor-pointer hover:border-[var(--editor-accent)]/50 hover:bg-[var(--editor-soft)]/50 transition-colors"
        >
          <Upload className="w-10 h-10 text-[var(--editor-muted)]" />
          <div className="text-center">
            <p className="text-[var(--editor-ink)] font-medium">
              {q || category !== 'all' ? '没有符合条件的文件' : '还没有上传任何文件'}
            </p>
            <p className="text-sm text-[var(--editor-muted)] mt-1">
              {q || category !== 'all' ? '换个关键词或筛选条件试试' : '点击或拖拽文件到此处上传'}
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {items.map(item => (
              <MediaCard
                key={item.key}
                item={item}
                onDelete={setDeleteTarget}
                onCopy={handleCopy}
                copiedKey={copiedKey}
              />
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="px-3 py-1.5 rounded-lg border border-[var(--editor-line)] text-sm text-[var(--editor-muted)] hover:bg-[var(--editor-soft)] disabled:opacity-40 transition-colors"
              >
                上一页
              </button>
              <span className="text-sm text-[var(--editor-muted)]">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="px-3 py-1.5 rounded-lg border border-[var(--editor-line)] text-sm text-[var(--editor-muted)] hover:bg-[var(--editor-soft)] disabled:opacity-40 transition-colors"
              >
                下一页
              </button>
            </div>
          )}
        </>
      )}

      {/* Loading overlay */}
      {loading && (
        <div className="text-center py-12 text-[var(--editor-muted)] text-sm">加载中…</div>
      )}

      {/* Delete confirm */}
      <Modal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="删除文件"
        description={`确定要删除「${deleteTarget?.original_name}」吗？此操作不可恢复，文章中引用此文件的链接将失效。`}
        confirmText="删除"
        type="danger"
      />
    </div>
  )
}
