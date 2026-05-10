import type { ImageAttachment } from '../protocol'

/**
 * Shared between the prompt box and the sidebar composer. Owns the small set
 * of pasted/dropped images for one composer instance, renders them as a row
 * of removable thumbnails, and serializes them to the protocol's
 * ImageAttachment shape on submit.
 *
 * Items live entirely in memory (object URLs revoked on destroy) — we never
 * persist them to localStorage; if the user reloads mid-compose the drafts
 * are gone, which matches the rest of the box.
 */
export interface AttachedImage {
  id: string
  /** Original filename when pasted/dropped, or "screenshot.png" for raw paste. */
  name: string
  mimeType: string
  /** Object URL used purely for the thumbnail preview. */
  objectUrl: string
  /** Loaded base64 (no data: prefix) — used for the wire payload. */
  dataBase64: string
}

const ACCEPTED = /^image\//

export interface AttachmentsControllerOpts {
  thumbsEl: HTMLElement
  onChange?: () => void
}

export class AttachmentsController {
  private readonly thumbsEl: HTMLElement
  private readonly opts: AttachmentsControllerOpts
  private items: AttachedImage[] = []
  private destroyed = false

  constructor(opts: AttachmentsControllerOpts) {
    this.opts = opts
    this.thumbsEl = opts.thumbsEl
    this.render()
  }

  /** Public: how many images are currently attached. */
  count(): number {
    return this.items.length
  }

  /** Public: serialize for the wire. Empty when nothing is attached. */
  toPayload(): ImageAttachment[] {
    return this.items.map((it) => ({
      name: it.name,
      mimeType: it.mimeType,
      dataBase64: it.dataBase64,
    }))
  }

  /** Public: drop everything, clear the thumbs row. Called after submit. */
  clear() {
    for (const it of this.items) URL.revokeObjectURL(it.objectUrl)
    this.items = []
    this.render()
    this.opts.onChange?.()
  }

  destroy() {
    if (this.destroyed) return
    this.destroyed = true
    for (const it of this.items) URL.revokeObjectURL(it.objectUrl)
    this.items = []
  }

  /** Public: feed a FileList from a file input or a drop event. */
  async addFiles(files: FileList | File[]) {
    const arr = Array.from(files)
    for (const f of arr) {
      if (!ACCEPTED.test(f.type)) continue
      await this.addFile(f)
    }
  }

  /**
   * Public: read images out of a clipboard ClipboardEvent. Returns true when
   * at least one image was picked up. The synchronous part is "did we find an
   * image?"; the actual base64 read happens after this call returns. Callers
   * should preventDefault when this returns true, in the same tick, so the
   * textarea doesn't also paste binary garbage from the same event.
   */
  addFromClipboard(e: ClipboardEvent): boolean {
    const items = e.clipboardData?.items
    if (!items) return false
    const files: File[] = []
    for (const it of Array.from(items)) {
      if (it.kind !== 'file') continue
      if (!ACCEPTED.test(it.type)) continue
      const file = it.getAsFile()
      if (file) files.push(file)
    }
    if (files.length === 0) return false
    void this.addFiles(files)
    return true
  }

  private async addFile(file: File) {
    try {
      const dataBase64 = await fileToBase64(file)
      const item: AttachedImage = {
        id: `att-${Math.random().toString(36).slice(2, 10)}`,
        name: file.name || nameFromMime(file.type),
        mimeType: file.type || 'image/png',
        objectUrl: URL.createObjectURL(file),
        dataBase64,
      }
      this.items.push(item)
      this.render()
      this.opts.onChange?.()
    } catch {
      // ignore unreadable files
    }
  }

  private remove(id: string) {
    const idx = this.items.findIndex((it) => it.id === id)
    if (idx === -1) return
    URL.revokeObjectURL(this.items[idx].objectUrl)
    this.items.splice(idx, 1)
    this.render()
    this.opts.onChange?.()
  }

  private render() {
    const root = this.thumbsEl
    root.replaceChildren()
    if (this.items.length === 0) {
      root.classList.add('empty')
      return
    }
    root.classList.remove('empty')
    for (const it of this.items) {
      const cell = document.createElement('div')
      cell.className = 'attachment-thumb'
      cell.title = it.name

      const img = document.createElement('img')
      img.src = it.objectUrl
      img.alt = it.name
      cell.appendChild(img)

      const close = document.createElement('button')
      close.type = 'button'
      close.className = 'attachment-thumb-remove'
      close.setAttribute('aria-label', 'remove image')
      close.textContent = '×'
      close.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()
        this.remove(it.id)
      })
      cell.appendChild(close)

      root.appendChild(cell)
    }
  }
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result
      if (typeof result !== 'string') {
        reject(new Error('expected data url'))
        return
      }
      const idx = result.indexOf('base64,')
      if (idx === -1) {
        reject(new Error('not a base64 data url'))
        return
      }
      resolve(result.slice(idx + 'base64,'.length))
    }
    reader.onerror = () => reject(reader.error || new Error('read failed'))
    reader.readAsDataURL(file)
  })
}

function nameFromMime(mime: string): string {
  if (mime === 'image/png') return 'screenshot.png'
  if (mime === 'image/jpeg' || mime === 'image/jpg') return 'screenshot.jpg'
  if (mime === 'image/webp') return 'screenshot.webp'
  if (mime === 'image/gif') return 'screenshot.gif'
  return 'image'
}

/** Wire up paste, drag-over highlight, drop handling on a target element. */
export function bindClipboardAndDrop(
  el: HTMLElement,
  ctrl: AttachmentsController,
) {
  el.addEventListener('paste', (e) => {
    if (ctrl.addFromClipboard(e as ClipboardEvent)) {
      e.preventDefault()
    }
  })

  // Drag visuals on the wrapping element so users get a hint when hovering
  // a screenshot over the composer area.
  let dragDepth = 0
  el.addEventListener('dragenter', (e) => {
    if (!hasFiles(e.dataTransfer)) return
    e.preventDefault()
    dragDepth += 1
    el.classList.add('drag-over')
  })
  el.addEventListener('dragover', (e) => {
    if (!hasFiles(e.dataTransfer)) return
    e.preventDefault()
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
  })
  el.addEventListener('dragleave', () => {
    dragDepth = Math.max(0, dragDepth - 1)
    if (dragDepth === 0) el.classList.remove('drag-over')
  })
  el.addEventListener('drop', (e) => {
    if (!hasFiles(e.dataTransfer)) return
    e.preventDefault()
    dragDepth = 0
    el.classList.remove('drag-over')
    if (e.dataTransfer?.files) void ctrl.addFiles(e.dataTransfer.files)
  })
}

function hasFiles(dt: DataTransfer | null | undefined): boolean {
  if (!dt) return false
  if (dt.types && Array.from(dt.types).includes('Files')) return true
  return Boolean(dt.files && dt.files.length)
}

const ATTACH_ICON_SVG = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3.5V12.5M3.5 8H12.5"/></svg>`

/**
 * Build a small "+ image" button + hidden <input type=file>. The button label
 * uses an icon to keep visual weight low. Returns the wrapper to insert into
 * the composer's button row.
 */
export function buildAttachButton(ctrl: AttachmentsController): HTMLElement {
  const wrap = document.createElement('span')
  wrap.className = 'attachment-attach'

  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'image/*'
  input.multiple = true
  input.addEventListener('change', () => {
    if (input.files && input.files.length > 0) {
      void ctrl.addFiles(input.files)
    }
    input.value = '' // allow re-selecting the same file
  })
  wrap.appendChild(input)

  const btn = document.createElement('button')
  btn.type = 'button'
  btn.className = 'attachment-attach-button'
  btn.title = 'Attach image (or paste / drop)'
  btn.innerHTML = ATTACH_ICON_SVG
  btn.addEventListener('click', (e) => {
    e.preventDefault()
    e.stopPropagation()
    input.click()
  })
  wrap.appendChild(btn)

  return wrap
}
