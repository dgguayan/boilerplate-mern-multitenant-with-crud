import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { Dialog, DropdownMenu } from "radix-ui"
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Download,
  Ellipsis,
  ExternalLink,
  LoaderCircle,
  Maximize,
  Minimize,
  MoveHorizontal,
  PanelLeft,
  Printer,
  RotateCcw,
  Scan,
  Search,
  TriangleAlert,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { formatFileSize, getFileName } from "./utils"
import "./pdf-viewer.css"

// This module is only loaded when a visitor opens a preview, so PDF.js (and its worker)
// never weighs on the initial page load. The legacy build covers the widest browser range.
let pdfjsPromise = null
export function preloadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = Promise.all([
      import("pdfjs-dist/legacy/build/pdf.mjs"),
      import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url"),
    ]).then(([pdfjs, worker]) => {
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default
      return pdfjs
    })
    pdfjsPromise.catch(() => {
      pdfjsPromise = null // allow a retry after a network failure
    })
  }
  return pdfjsPromise
}

const ZOOM_STEPS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5]
const ZOOM_PRESETS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3]
const MIN_SCALE = 0.25
const MAX_SCALE = 5
const AUTO_MAX_SCALE = 1.25
const MAX_CANVAS_PIXELS = 16_777_216 // keeps canvases inside mobile Safari's memory limits
const THUMB_WIDTH = 112

const clamp = (value, min, max) => Math.min(Math.max(value, min), max)
const smoothBehavior = () =>
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"
const isCancelled = (err) =>
  err?.name === "RenderingCancelledException" || err?.name === "AbortException"

function releaseCanvases(host) {
  if (!host) return
  for (const canvas of host.querySelectorAll("canvas")) {
    canvas.width = 0
    canvas.height = 0
    canvas.remove()
  }
}

function getFullscreenElement() {
  return document.fullscreenElement ?? document.webkitFullscreenElement ?? null
}

function describeError(err) {
  switch (err?.name) {
    case "MissingPDFException":
      return "The document could not be found. It may have been moved or deleted."
    case "InvalidPDFException":
      return "This file isn't a valid PDF, or it is damaged."
    case "PasswordException":
      return "This document is password protected and can't be previewed here."
    case "UnexpectedResponseException":
      return "The server didn't return the document. Please try again later."
    default:
      return "Something went wrong while loading the preview."
  }
}

/** The page's index (0-based) at a vertical offset of the pages wrapper. */
function findPageAt(pageEls, y) {
  let low = 0
  let high = pageEls.length - 1
  let found = 0
  while (low <= high) {
    const mid = (low + high) >> 1
    const el = pageEls[mid]
    if (!el) break
    if (el.offsetTop <= y) {
      found = mid
      low = mid + 1
    } else {
      high = mid - 1
    }
  }
  return found
}

/* -------------------------------------------------------------------------- */
/*                                   Dialog                                   */
/* -------------------------------------------------------------------------- */

/**
 * Fullscreen-capable modal PDF viewer.
 * Load it lazily (see DocumentViewer in DocumentCard.jsx) rather than importing it directly.
 */
export default function PdfViewerDialog({ open, onOpenChange, document: doc, returnFocusRef }) {
  const contentRef = useRef(null)
  const escapeHandlerRef = useRef(null)
  const savedScroll = useRef(null)

  useEffect(() => {
    if (open) savedScroll.current = { x: window.scrollX, y: window.scrollY }
  }, [open])

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 duration-200 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
        <Dialog.Content
          ref={contentRef}
          className="pdfv fixed inset-0 z-50 flex flex-col overflow-hidden bg-background text-sm text-foreground outline-none duration-200 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 sm:inset-3 sm:rounded-xl sm:shadow-2xl sm:ring-1 sm:ring-foreground/10 lg:inset-6 [&:fullscreen]:rounded-none"
          onOpenAutoFocus={(event) => {
            // Focus the page area so arrow keys and Page Up/Down work straight away.
            const pages = contentRef.current?.querySelector("[data-pdfv-scroll]")
            if (pages) {
              event.preventDefault()
              pages.focus({ preventScroll: true })
            }
          }}
          onEscapeKeyDown={(event) => escapeHandlerRef.current?.(event)}
          onCloseAutoFocus={(event) => {
            // Return to the button that opened the viewer, at the visitor's original scroll position.
            const trigger = returnFocusRef?.current
            if (trigger) {
              event.preventDefault()
              trigger.focus({ preventScroll: true })
            }
            const saved = savedScroll.current
            if (saved && (window.scrollX !== saved.x || window.scrollY !== saved.y)) {
              window.scrollTo(saved.x, saved.y)
            }
          }}
        >
          <PdfViewer
            document={doc}
            contentRef={contentRef}
            escapeHandlerRef={escapeHandlerRef}
            onClose={() => onOpenChange(false)}
          />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

/* -------------------------------------------------------------------------- */
/*                                   Viewer                                   */
/* -------------------------------------------------------------------------- */

function PdfViewer({ document: doc, contentRef, escapeHandlerRef, onClose }) {
  const scrollRef = useRef(null)
  const wrapRef = useRef(null)
  const searchInputRef = useRef(null)
  const pageRefs = useRef([])
  const textCache = useRef(new Map())
  const zoomAnchor = useRef(null)
  const scaleRef = useRef(1)
  const currentPageRef = useRef(1)
  const renderRangeRef = useRef([1, 1])

  const [status, setStatus] = useState("loading") // loading | ready | error
  const [progress, setProgress] = useState(null)
  const [error, setError] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [pdfjs, setPdfjs] = useState(null)
  const [pdf, setPdf] = useState(null)
  const [pageSizes, setPageSizes] = useState([]) // page sizes at 100% zoom
  const [scale, setScale] = useState(1)
  const [zoomMode, setZoomMode] = useState("auto") // auto | width | page | custom
  const [currentPage, setCurrentPage] = useState(1)
  const [renderRange, setRenderRange] = useState([1, 1])
  const [sidebarOpen, setSidebarOpen] = useState(
    () => window.matchMedia?.("(min-width: 1024px)").matches ?? false
  )
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [search, setSearch] = useState({ term: "", matches: [], active: -1, pending: false })
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [printing, setPrinting] = useState(false)
  const [menuContainer, setMenuContainer] = useState(null)
  useEffect(() => setMenuContainer(contentRef.current), [contentRef])

  const totalPages = pageSizes.length
  const fileName = getFileName(doc)
  const fullscreenSupported = Boolean(document.fullscreenEnabled || document.webkitFullscreenEnabled)
  const ready = status === "ready"

  currentPageRef.current = currentPage
  renderRangeRef.current = renderRange

  /* ------------------------------ Load document ----------------------------- */

  useEffect(() => {
    let cancelled = false
    let loadingTask = null
    setStatus("loading")
    setError(null)
    setProgress(null)
    setPdf(null)
    setPageSizes([])
    textCache.current = new Map()

    preloadPdfjs()
      .then((lib) => {
        if (cancelled) return null
        setPdfjs(lib)
        loadingTask = lib.getDocument({ url: doc.url, isEvalSupported: false, enableXfa: false })
        loadingTask.onProgress = ({ loaded, total }) => {
          if (!cancelled && total) setProgress(Math.min(100, Math.round((loaded / total) * 100)))
        }
        return loadingTask.promise
      })
      .then(async (instance) => {
        if (cancelled || !instance) return
        const first = await instance.getPage(1)
        if (cancelled) return
        const { width, height } = first.getViewport({ scale: 1 })
        const base = { width, height }
        setPageSizes(Array.from({ length: instance.numPages }, () => base))
        setPdf(instance)
        setCurrentPage(1)
        setStatus("ready")

        // Most documents use one page size; mixed-size documents are corrected in the background.
        const sizes = [base]
        for (let n = 2; n <= instance.numPages; n++) {
          const page = await instance.getPage(n)
          if (cancelled) return
          const viewport = page.getViewport({ scale: 1 })
          sizes.push({ width: viewport.width, height: viewport.height })
        }
        if (sizes.some((s) => s.width !== base.width || s.height !== base.height)) setPageSizes(sizes)
      })
      .catch((err) => {
        if (cancelled) return
        console.error("PDF preview failed:", err)
        setError(err)
        setStatus("error")
      })

    return () => {
      cancelled = true
      loadingTask?.destroy()
    }
  }, [doc.url, reloadKey])

  const getTextContent = useCallback(
    (pageNumber) => {
      let promise = textCache.current.get(pageNumber)
      if (!promise) {
        promise = pdf.getPage(pageNumber).then((page) => page.getTextContent())
        promise.catch(() => textCache.current.delete(pageNumber))
        textCache.current.set(pageNumber, promise)
      }
      return promise
    },
    [pdf]
  )

  /* ---------------------------- Scroll & visibility ---------------------------- */

  const updateFromScroll = useCallback(() => {
    const el = scrollRef.current
    const pages = pageRefs.current
    if (!el || !pages.length) return
    const top = el.scrollTop
    const bottom = top + el.clientHeight
    const first = findPageAt(pages, top)
    const last = findPageAt(pages, bottom)
    const current = findPageAt(pages, top + el.clientHeight * 0.35)
    setCurrentPage(current + 1)
    // Render the visible pages plus one on each side; everything else releases its canvas.
    const start = Math.max(1, first)
    const end = Math.min(pages.length, last + 2)
    setRenderRange((range) => (range[0] === start && range[1] === end ? range : [start, end]))
  }, [])

  const scrollFrame = useRef(0)
  const handleScroll = useCallback(() => {
    if (scrollFrame.current) return
    scrollFrame.current = requestAnimationFrame(() => {
      scrollFrame.current = 0
      updateFromScroll()
    })
  }, [updateFromScroll])
  useEffect(() => () => cancelAnimationFrame(scrollFrame.current), [])

  const goToPage = useCallback((pageNumber, behavior) => {
    const el = scrollRef.current
    const pages = pageRefs.current
    if (!el || !pages.length) return
    const target = clamp(Math.round(pageNumber) || 1, 1, pages.length)
    const pageEl = pages[target - 1]
    if (!pageEl) return
    el.scrollTo({ top: pageEl.offsetTop - 8, behavior: behavior ?? smoothBehavior() })
    setCurrentPage(target)
  }, [])

  /* ---------------------------------- Zoom ---------------------------------- */

  const applyScale = useCallback((next, anchor) => {
    const prev = scaleRef.current
    const value = clamp(Math.round(next * 1000) / 1000, MIN_SCALE, MAX_SCALE)
    if (Math.abs(value - prev) < 0.001) return
    const el = scrollRef.current
    const pages = pageRefs.current
    if (el && pages.length) {
      // Remember which point of which page sits under the anchor, so it stays put after zooming.
      const ax = anchor?.x ?? el.clientWidth / 2
      const ay = anchor?.y ?? 0
      const y = el.scrollTop + ay
      const index = findPageAt(pages, y)
      const pageEl = pages[index]
      zoomAnchor.current = {
        index,
        fracY: pageEl ? (y - pageEl.offsetTop) / pageEl.offsetHeight : 0,
        fracX: el.scrollWidth ? (el.scrollLeft + ax) / el.scrollWidth : 0,
        ax,
        ay,
      }
    }
    scaleRef.current = value
    setScale(value)
  }, [])

  useLayoutEffect(() => {
    const anchor = zoomAnchor.current
    const el = scrollRef.current
    if (anchor && el) {
      zoomAnchor.current = null
      const pageEl = pageRefs.current[anchor.index]
      el.scrollTo({
        top: pageEl ? pageEl.offsetTop + anchor.fracY * pageEl.offsetHeight - anchor.ay : el.scrollTop,
        left: anchor.fracX * el.scrollWidth - anchor.ax,
        behavior: "instant",
      })
    }
    updateFromScroll()
  }, [scale, pageSizes, updateFromScroll])

  const computeFitScale = useCallback(
    (mode) => {
      const el = scrollRef.current
      const size = pageSizes[currentPageRef.current - 1] ?? pageSizes[0]
      if (!el || !size) return null
      const style = wrapRef.current ? getComputedStyle(wrapRef.current) : null
      const padX = style ? parseFloat(style.paddingLeft) + parseFloat(style.paddingRight) : 32
      const padY = style ? parseFloat(style.paddingTop) + parseFloat(style.paddingBottom) : 32
      const widthScale = (el.clientWidth - padX) / size.width
      const pageScale = Math.min(widthScale, (el.clientHeight - padY) / size.height)
      if (mode === "width") return widthScale
      if (mode === "page") return pageScale
      return Math.min(widthScale, AUTO_MAX_SCALE)
    },
    [pageSizes]
  )

  useLayoutEffect(() => {
    if (!ready || zoomMode === "custom") return
    const el = scrollRef.current
    if (!el) return
    const fit = () => {
      const value = computeFitScale(zoomMode)
      if (value && value > 0) applyScale(value)
    }
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(el)
    return () => observer.disconnect()
  }, [ready, zoomMode, computeFitScale, applyScale])

  const zoomIn = useCallback(() => {
    setZoomMode("custom")
    applyScale(ZOOM_STEPS.find((step) => step > scaleRef.current + 0.001) ?? MAX_SCALE)
  }, [applyScale])
  const zoomOut = useCallback(() => {
    setZoomMode("custom")
    applyScale([...ZOOM_STEPS].reverse().find((step) => step < scaleRef.current - 0.001) ?? MIN_SCALE)
  }, [applyScale])
  const setZoom = useCallback(
    (value) => {
      if (typeof value === "string") {
        setZoomMode(value)
        if (value === "page") requestAnimationFrame(() => goToPage(currentPageRef.current, "instant"))
      } else {
        setZoomMode("custom")
        applyScale(value)
      }
    },
    [applyScale, goToPage]
  )
  const resetZoom = useCallback(() => setZoom("auto"), [setZoom])

  // Pinch-to-zoom on touch screens, and Ctrl/⌘ + wheel (also trackpad pinch) on desktop.
  useEffect(() => {
    const el = scrollRef.current
    const wrap = wrapRef.current
    if (!ready || !el || !wrap) return
    let pinch = null
    const distance = (touches) =>
      Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY)

    const onTouchStart = (event) => {
      if (event.touches.length !== 2) return
      const rect = el.getBoundingClientRect()
      const x = (event.touches[0].clientX + event.touches[1].clientX) / 2 - rect.left
      const y = (event.touches[0].clientY + event.touches[1].clientY) / 2 - rect.top
      pinch = { start: distance(event.touches), ratio: 1, x, y }
      wrap.style.transformOrigin = `${el.scrollLeft + x - wrap.offsetLeft}px ${el.scrollTop + y}px`
      wrap.style.willChange = "transform"
    }
    const onTouchMove = (event) => {
      if (!pinch || event.touches.length !== 2) return
      event.preventDefault()
      const base = scaleRef.current
      pinch.ratio = clamp(distance(event.touches) / pinch.start, MIN_SCALE / base, MAX_SCALE / base)
      wrap.style.transform = `scale(${pinch.ratio})` // cheap preview; pages re-render on release
    }
    const onTouchEnd = (event) => {
      if (!pinch || event.touches.length >= 2) return
      const { ratio, x, y } = pinch
      pinch = null
      wrap.style.transform = ""
      wrap.style.transformOrigin = ""
      wrap.style.willChange = ""
      if (Math.abs(ratio - 1) > 0.01) {
        setZoomMode("custom")
        applyScale(scaleRef.current * ratio, { x, y })
      }
    }
    const onWheel = (event) => {
      if (!event.ctrlKey && !event.metaKey) return
      event.preventDefault()
      const rect = el.getBoundingClientRect()
      setZoomMode("custom")
      applyScale(scaleRef.current * Math.exp(-clamp(event.deltaY, -50, 50) * 0.01), {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      })
    }

    el.addEventListener("touchstart", onTouchStart, { passive: true })
    el.addEventListener("touchmove", onTouchMove, { passive: false })
    el.addEventListener("touchend", onTouchEnd)
    el.addEventListener("touchcancel", onTouchEnd)
    el.addEventListener("wheel", onWheel, { passive: false })
    return () => {
      el.removeEventListener("touchstart", onTouchStart)
      el.removeEventListener("touchmove", onTouchMove)
      el.removeEventListener("touchend", onTouchEnd)
      el.removeEventListener("touchcancel", onTouchEnd)
      el.removeEventListener("wheel", onWheel)
    }
  }, [ready, applyScale])

  /* --------------------------------- Search --------------------------------- */

  useEffect(() => {
    const term = query.trim().toLocaleLowerCase()
    if (!pdf || !term) {
      setSearch({ term: "", matches: [], active: -1, pending: false })
      return
    }
    let cancelled = false
    setSearch((state) => ({ ...state, pending: true }))
    const timer = setTimeout(async () => {
      const matches = []
      for (let n = 1; n <= pdf.numPages; n++) {
        let content
        try {
          content = await getTextContent(n)
        } catch {
          continue
        }
        if (cancelled) return
        content.items.forEach((item, itemIndex) => {
          const text = item.str?.toLocaleLowerCase()
          if (!text) return
          for (let at = text.indexOf(term); at !== -1; at = text.indexOf(term, at + term.length)) {
            matches.push({ page: n, item: itemIndex })
          }
        })
      }
      if (cancelled) return
      let active = matches.findIndex((match) => match.page >= currentPageRef.current)
      if (active === -1 && matches.length) active = 0
      setSearch({ term, matches, active, pending: false })
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [query, pdf, getTextContent])

  // Jump to a match's page when it isn't rendered yet; the page itself then scrolls to the match.
  const activeMatch = search.matches[search.active]
  useEffect(() => {
    if (!activeMatch) return
    const [start, end] = renderRangeRef.current
    if (activeMatch.page < start || activeMatch.page > end) goToPage(activeMatch.page, "instant")
  }, [activeMatch, goToPage])

  const stepMatch = useCallback((direction) => {
    setSearch((state) => {
      if (!state.matches.length) return state
      const active = (state.active + direction + state.matches.length) % state.matches.length
      return { ...state, active }
    })
  }, [])

  const revealMatch = useCallback((pageIndex, left, top) => {
    const el = scrollRef.current
    const pageEl = pageRefs.current[pageIndex]
    if (!el || !pageEl) return
    const x = pageEl.offsetLeft + left
    const outOfViewX = x < el.scrollLeft || x > el.scrollLeft + el.clientWidth - 40
    el.scrollTo({
      top: pageEl.offsetTop + top - el.clientHeight / 3,
      left: outOfViewX ? x - el.clientWidth / 3 : el.scrollLeft,
      behavior: smoothBehavior(),
    })
  }, [])

  const openSearch = useCallback(() => {
    setSearchOpen(true)
    requestAnimationFrame(() => {
      searchInputRef.current?.focus()
      searchInputRef.current?.select()
    })
  }, [])
  const closeSearch = useCallback(() => {
    setSearchOpen(false)
    setQuery("")
    scrollRef.current?.focus({ preventScroll: true })
  }, [])

  /* --------------------------- Fullscreen & print --------------------------- */

  useEffect(() => {
    const onChange = () => setIsFullscreen(getFullscreenElement() === contentRef.current)
    document.addEventListener("fullscreenchange", onChange)
    document.addEventListener("webkitfullscreenchange", onChange)
    return () => {
      document.removeEventListener("fullscreenchange", onChange)
      document.removeEventListener("webkitfullscreenchange", onChange)
      if (getFullscreenElement() === contentRef.current) {
        ;(document.exitFullscreen ?? document.webkitExitFullscreen)?.call(document)?.catch?.(() => {})
      }
    }
  }, [contentRef])

  const toggleFullscreen = useCallback(async () => {
    const el = contentRef.current
    try {
      if (getFullscreenElement()) await (document.exitFullscreen ?? document.webkitExitFullscreen).call(document)
      else await (el.requestFullscreen ?? el.webkitRequestFullscreen).call(el)
    } catch {
      // Fullscreen can be refused (iframes, permissions); the viewer keeps working without it.
    }
  }, [contentRef])

  const print = useCallback(async () => {
    // Mobile browsers can't print a PDF from a hidden frame; their own PDF view can.
    if (!pdf || window.matchMedia?.("(pointer: coarse)").matches) {
      window.open(doc.url, "_blank", "noopener")
      return
    }
    setPrinting(true)
    try {
      const data = await pdf.getData()
      const blobUrl = URL.createObjectURL(new Blob([data], { type: "application/pdf" }))
      const frame = document.createElement("iframe")
      frame.setAttribute("aria-hidden", "true")
      frame.tabIndex = -1
      Object.assign(frame.style, {
        position: "fixed",
        right: "0",
        bottom: "0",
        width: "1px",
        height: "1px",
        border: "0",
        opacity: "0",
      })
      frame.onload = () => {
        setTimeout(() => {
          try {
            frame.contentWindow.focus()
            frame.contentWindow.print()
          } catch {
            window.open(blobUrl, "_blank", "noopener")
          }
          setPrinting(false)
        }, 250)
        setTimeout(() => {
          frame.remove()
          URL.revokeObjectURL(blobUrl)
        }, 60_000)
      }
      frame.src = blobUrl
      document.body.appendChild(frame)
    } catch {
      setPrinting(false)
      window.open(doc.url, "_blank", "noopener")
    }
  }, [pdf, doc.url])

  /* -------------------------------- Keyboard -------------------------------- */

  escapeHandlerRef.current = (event) => {
    if (searchOpen && searchInputRef.current === document.activeElement) {
      event.preventDefault()
      if (query) setQuery("")
      else closeSearch()
    }
  }

  const handleKeyDown = (event) => {
    if (!ready) return
    const mod = event.ctrlKey || event.metaKey
    if (mod) {
      // Ctrl/⌘ shortcuts act on the document instead of the browser page.
      const shortcuts = { f: openSearch, p: print, "+": zoomIn, "=": zoomIn, "-": zoomOut, 0: resetZoom }
      const action = shortcuts[event.key.toLowerCase()]
      if (action) {
        event.preventDefault()
        action()
      }
      return
    }
    if (event.altKey) return
    if (event.target.closest?.("input, textarea, select, [contenteditable='true'], [role='menu']")) return

    const el = scrollRef.current
    const canPanX = el && el.scrollWidth > el.clientWidth + 1
    switch (event.key) {
      case "PageDown":
      case "n":
        goToPage(currentPageRef.current + 1)
        break
      case "PageUp":
      case "p":
        goToPage(currentPageRef.current - 1)
        break
      case "ArrowRight":
        if (canPanX) return
        goToPage(currentPageRef.current + 1)
        break
      case "ArrowLeft":
        if (canPanX) return
        goToPage(currentPageRef.current - 1)
        break
      case "Home":
        goToPage(1)
        break
      case "End":
        goToPage(totalPages)
        break
      case "+":
      case "=":
        zoomIn()
        break
      case "-":
        zoomOut()
        break
      default:
        return
    }
    event.preventDefault()
  }

  /* --------------------------------- Render --------------------------------- */

  const setPageRef = useCallback((index, el) => {
    pageRefs.current[index] = el
  }, [])
  pageRefs.current.length = totalPages

  const selectThumbnail = useCallback(
    (pageNumber) => {
      goToPage(pageNumber)
      if (!window.matchMedia?.("(min-width: 1024px)").matches) setSidebarOpen(false)
    },
    [goToPage]
  )

  const meta = [doc.fileType ?? "PDF", formatFileSize(doc.size), totalPages ? `${totalPages} pages` : null]
    .filter(Boolean)
    .join(" · ")
  const zoomLabel = `${Math.round(scale * 100)}%`

  const zoomMenu = (
    <ViewerMenu
      container={menuContainer}
      label="Zoom options"
      align="center"
      trigger={
        <Button
          variant="ghost"
          className="h-10 min-w-16 px-2 tabular-nums md:h-8"
          aria-label={`Zoom ${zoomLabel}, zoom options`}
          title="Zoom options"
          disabled={!ready}
        >
          {zoomLabel}
          <ChevronDown className="size-3.5 opacity-60" />
        </Button>
      }
    >
      <MenuItem onSelect={() => setZoom("width")} icon={MoveHorizontal} checked={zoomMode === "width"}>
        Fit to width
      </MenuItem>
      <MenuItem onSelect={() => setZoom("page")} icon={Scan} checked={zoomMode === "page"}>
        Fit to page
      </MenuItem>
      <MenuItem onSelect={resetZoom} icon={RotateCcw} checked={zoomMode === "auto"}>
        Reset zoom
      </MenuItem>
      <DropdownMenu.Separator className="-mx-1 my-1 h-px bg-border" />
      {ZOOM_PRESETS.map((value) => (
        <MenuItem
          key={value}
          onSelect={() => setZoom(value)}
          checked={zoomMode === "custom" && Math.abs(scale - value) < 0.005}
        >
          {Math.round(value * 100)}%
        </MenuItem>
      ))}
    </ViewerMenu>
  )

  const pageNav = (
    <div className="flex items-center gap-0.5">
      <ToolButton
        label="Previous page"
        icon={ChevronLeft}
        onClick={() => goToPage(currentPage - 1)}
        disabled={!ready || currentPage <= 1}
      />
      <PageField current={currentPage} total={totalPages} onSubmit={goToPage} disabled={!ready} />
      <ToolButton
        label="Next page"
        icon={ChevronRight}
        onClick={() => goToPage(currentPage + 1)}
        disabled={!ready || currentPage >= totalPages}
      />
    </div>
  )

  const zoomControls = (
    <div className="flex items-center gap-0.5">
      <ToolButton label="Zoom out" icon={ZoomOut} onClick={zoomOut} disabled={!ready || scale <= MIN_SCALE} />
      {zoomMenu}
      <ToolButton label="Zoom in" icon={ZoomIn} onClick={zoomIn} disabled={!ready || scale >= MAX_SCALE} />
    </div>
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col" onKeyDown={handleKeyDown}>
      {/* Toolbar */}
      <header className="flex h-14 shrink-0 items-center gap-1 border-b px-1.5 md:h-12 md:px-2">
        <ToolButton
          label={sidebarOpen ? "Hide page thumbnails" : "Show page thumbnails"}
          icon={PanelLeft}
          aria-pressed={sidebarOpen}
          aria-controls="pdfv-thumbnails"
          onClick={() => setSidebarOpen((value) => !value)}
          disabled={!ready}
        />
        <div className="min-w-0 flex-1 px-1">
          <Dialog.Title className="truncate text-sm font-medium leading-tight">{doc.title}</Dialog.Title>
          <p className="hidden truncate text-xs text-muted-foreground sm:block">{meta}</p>
          <Dialog.Description className="sr-only">
            {doc.description ? `${doc.description} ` : ""}
            Use Page Up and Page Down to change pages and Escape to close the viewer.
          </Dialog.Description>
        </div>

        <div className="hidden items-center gap-1 md:flex">
          {pageNav}
          <span className="mx-1 h-5 w-px bg-border" aria-hidden="true" />
          {zoomControls}
          <ToolButton
            label="Fit to width"
            icon={MoveHorizontal}
            className="hidden lg:inline-flex"
            aria-pressed={zoomMode === "width"}
            onClick={() => setZoom("width")}
            disabled={!ready}
          />
          <ToolButton
            label="Fit to page"
            icon={Scan}
            className="hidden lg:inline-flex"
            aria-pressed={zoomMode === "page"}
            onClick={() => setZoom("page")}
            disabled={!ready}
          />
          <span className="mx-1 h-5 w-px bg-border" aria-hidden="true" />
        </div>

        <div className="flex items-center gap-0.5">
          <ToolButton
            label="Search in document"
            icon={Search}
            aria-pressed={searchOpen}
            onClick={() => (searchOpen ? closeSearch() : openSearch())}
            disabled={!ready}
          />
          <ToolButton
            label="Print"
            icon={printing ? LoaderCircle : Printer}
            iconClassName={printing ? "animate-spin" : undefined}
            className="hidden md:inline-flex"
            onClick={print}
            disabled={!ready || printing}
          />
          <Button
            asChild
            variant="ghost"
            size="icon"
            className="hidden md:inline-flex"
            aria-label="Download PDF"
            title="Download PDF"
          >
            <a href={doc.url} download={fileName}>
              <Download />
            </a>
          </Button>
          {fullscreenSupported && (
            <ToolButton
              label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
              icon={isFullscreen ? Minimize : Maximize}
              className="hidden md:inline-flex"
              onClick={toggleFullscreen}
            />
          )}
          <ViewerMenu
            container={menuContainer}
            label="More actions"
            trigger={
              <Button
                variant="ghost"
                size="icon"
                className="size-10 md:hidden"
                aria-label="More actions"
                title="More actions"
              >
                <Ellipsis />
              </Button>
            }
          >
            <MenuItem onSelect={print} icon={Printer} disabled={!ready}>
              Print
            </MenuItem>
            <MenuItem asChild icon={Download}>
              <a href={doc.url} download={fileName}>
                Download PDF
              </a>
            </MenuItem>
            <MenuItem asChild icon={ExternalLink}>
              <a href={doc.url} target="_blank" rel="noopener">
                Open in new tab
              </a>
            </MenuItem>
            {fullscreenSupported && (
              <MenuItem onSelect={toggleFullscreen} icon={isFullscreen ? Minimize : Maximize}>
                {isFullscreen ? "Exit fullscreen" : "Fullscreen"}
              </MenuItem>
            )}
          </ViewerMenu>
          <span className="mx-0.5 h-5 w-px bg-border" aria-hidden="true" />
          <ToolButton label="Close viewer" icon={X} onClick={onClose} />
        </div>
      </header>

      {/* Search */}
      {searchOpen && (
        <div role="search" className="flex shrink-0 items-center gap-1 border-b bg-background px-2 py-1.5">
          <label htmlFor="pdfv-search" className="sr-only">
            Search in document
          </label>
          <div className="relative min-w-0 flex-1 md:max-w-sm">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              id="pdfv-search"
              ref={searchInputRef}
              type="search"
              autoComplete="off"
              enterKeyHint="search"
              placeholder="Search in document"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault()
                  stepMatch(event.shiftKey ? -1 : 1)
                }
              }}
              className="h-10 w-full min-w-0 rounded-lg border border-input bg-transparent py-1 pr-2.5 pl-8 text-base outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:h-8 md:text-sm dark:bg-input/30"
            />
          </div>
          <span className="min-w-16 px-1 text-center text-xs whitespace-nowrap text-muted-foreground tabular-nums" aria-live="polite">
            {search.pending
              ? "Searching…"
              : search.term
                ? search.matches.length
                  ? `${search.active + 1} of ${search.matches.length}`
                  : "No results"
                : ""}
          </span>
          <ToolButton
            label="Previous match"
            icon={ChevronUp}
            onClick={() => stepMatch(-1)}
            disabled={!search.matches.length}
          />
          <ToolButton
            label="Next match"
            icon={ChevronDown}
            onClick={() => stepMatch(1)}
            disabled={!search.matches.length}
          />
          <ToolButton label="Close search" icon={X} onClick={closeSearch} />
        </div>
      )}

      {/* Body */}
      <div className="relative flex min-h-0 flex-1">
        {sidebarOpen && ready && (
          <ThumbnailSidebar
            pdf={pdf}
            pageSizes={pageSizes}
            currentPage={currentPage}
            onSelect={selectThumbnail}
            onDismiss={() => setSidebarOpen(false)}
          />
        )}

        <div className="relative min-w-0 flex-1">
          <div
            ref={scrollRef}
            data-pdfv-scroll=""
            tabIndex={0}
            role="region"
            aria-label="Document pages"
            onScroll={handleScroll}
            className="pdfv-scroll absolute inset-0 overflow-auto bg-muted/70 outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-inset dark:bg-muted/30"
          >
            {ready && (
              <div
                ref={wrapRef}
                className="relative mx-auto flex w-max min-w-full flex-col items-center gap-3 p-2 sm:gap-4 sm:p-6"
              >
                {pageSizes.map((size, index) => (
                  <PdfPage
                    key={index}
                    index={index}
                    setPageRef={setPageRef}
                    pdf={pdf}
                    TextLayer={pdfjs.TextLayer}
                    getTextContent={getTextContent}
                    size={size}
                    scale={scale}
                    active={index + 1 >= renderRange[0] && index + 1 <= renderRange[1]}
                    term={search.term}
                    activeItem={activeMatch?.page === index + 1 ? activeMatch.item : -1}
                    activeKey={activeMatch?.page === index + 1 ? `${search.term}:${search.active}` : null}
                    onReveal={revealMatch}
                  />
                ))}
              </div>
            )}
          </div>

          {status === "loading" && (
            <div role="status" className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-muted-foreground">
              <LoaderCircle className="size-6 animate-spin" aria-hidden="true" />
              <span className="text-sm">Loading document{progress ? ` · ${progress}%` : "…"}</span>
            </div>
          )}

          {status === "error" && (
            <div className="absolute inset-0 flex items-center justify-center p-6">
              <div role="alert" className="flex max-w-sm flex-col items-center gap-3 text-center">
                <div className="flex size-10 items-center justify-center rounded-lg border bg-background">
                  <TriangleAlert className="size-5 text-muted-foreground" aria-hidden="true" />
                </div>
                <div>
                  <p className="font-medium">This document can't be previewed</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {describeError(error)} You can still open or download the original file.
                  </p>
                </div>
                <div className="flex flex-wrap justify-center gap-2">
                  <Button variant="outline" onClick={() => setReloadKey((key) => key + 1)}>
                    <RotateCcw data-icon="inline-start" />
                    Try again
                  </Button>
                  <Button asChild variant="outline">
                    <a href={doc.url} target="_blank" rel="noopener">
                      <ExternalLink data-icon="inline-start" />
                      Open original
                    </a>
                  </Button>
                  <Button asChild>
                    <a href={doc.url} download={fileName}>
                      <Download data-icon="inline-start" />
                      Download PDF
                    </a>
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Mobile controls, within thumb reach */}
      <div className="flex shrink-0 items-center justify-between gap-1 border-t px-1.5 pt-1 pb-[max(0.25rem,env(safe-area-inset-bottom))] md:hidden">
        {pageNav}
        {zoomControls}
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*                                    Page                                    */
/* -------------------------------------------------------------------------- */

const PdfPage = memo(function PdfPage({
  index,
  setPageRef,
  pdf,
  TextLayer,
  getTextContent,
  size,
  scale,
  active,
  term,
  activeItem,
  activeKey,
  onReveal,
}) {
  const pageNumber = index + 1
  const canvasHostRef = useRef(null)
  const textRef = useRef(null)
  const textLayerRef = useRef(null)
  const revealedKey = useRef(null)
  const [textVersion, setTextVersion] = useState(0)
  const [state, setState] = useState("idle") // idle | rendered | failed

  // Draw the page while it is near the viewport and release it when it scrolls away.
  useEffect(() => {
    const host = canvasHostRef.current
    const textEl = textRef.current
    if (!active) {
      releaseCanvases(host)
      textLayerRef.current?.cancel()
      textLayerRef.current = null
      textEl?.replaceChildren()
      setTextVersion(0)
      setState("idle")
      return
    }

    let cancelled = false
    let renderTask = null
    const render = async () => {
      const page = await pdf.getPage(pageNumber)
      if (cancelled) return
      const viewport = page.getViewport({ scale })
      const dpr = window.devicePixelRatio || 1
      const outputScale = Math.min(dpr, Math.sqrt(MAX_CANVAS_PIXELS / (viewport.width * viewport.height)))
      const canvas = document.createElement("canvas")
      canvas.width = Math.floor(viewport.width * outputScale)
      canvas.height = Math.floor(viewport.height * outputScale)
      canvas.setAttribute("aria-hidden", "true")
      renderTask = page.render({
        canvasContext: canvas.getContext("2d", { alpha: false }),
        viewport,
        transform: outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined,
      })
      try {
        await renderTask.promise
      } catch (err) {
        canvas.width = canvas.height = 0
        throw err
      }
      if (cancelled) {
        canvas.width = canvas.height = 0
        return
      }
      // Swap canvases only once the new one is ready, so zooming never flashes a blank page.
      releaseCanvases(host)
      host.appendChild(canvas)
      setState("rendered")

      if (textLayerRef.current) {
        textLayerRef.current.update({ viewport })
      } else {
        const content = await getTextContent(pageNumber)
        if (cancelled) return
        textEl.replaceChildren()
        const layer = new TextLayer({ textContentSource: content, container: textEl, viewport })
        textLayerRef.current = layer
        await layer.render()
        if (cancelled) return
      }
      setTextVersion((version) => version + 1)
    }

    // While zooming, wait for the gesture to settle before re-drawing an already visible page.
    const timer = setTimeout(
      () =>
        render().catch((err) => {
          if (cancelled || isCancelled(err)) return
          console.error(`PDF page ${pageNumber} failed to render:`, err)
          setState("failed")
        }),
      host.firstChild ? 120 : 0
    )
    return () => {
      cancelled = true
      clearTimeout(timer)
      renderTask?.cancel()
    }
  }, [active, pdf, pageNumber, scale, TextLayer, getTextContent])

  useEffect(
    () => () => {
      textLayerRef.current?.cancel()
      releaseCanvases(canvasHostRef.current)
    },
    []
  )

  // Highlight search hits on this page.
  useEffect(() => {
    const layer = textLayerRef.current
    if (!layer || !textVersion) return
    const strings = layer.textContentItemsStr
    layer.textDivs.forEach((div, i) => {
      const hit = Boolean(term) && Boolean(strings[i]?.toLocaleLowerCase().includes(term))
      div.classList.toggle("pdfv-hit", hit)
      div.classList.toggle("pdfv-hit-active", hit && i === activeItem)
    })
  }, [term, activeItem, textVersion])

  // Scroll the active hit into view once (not again on every zoom re-render).
  useEffect(() => {
    if (!activeKey || activeKey === revealedKey.current || !textVersion) return
    const div = textLayerRef.current?.textDivs[activeItem]
    if (!div) return
    revealedKey.current = activeKey
    onReveal(index, div.offsetLeft, div.offsetTop)
  }, [activeKey, activeItem, textVersion, index, onReveal])

  const width = Math.floor(size.width * scale)
  const height = Math.floor(size.height * scale)

  return (
    <div
      ref={(el) => setPageRef(index, el)}
      data-page-number={pageNumber}
      role="group"
      aria-label={`Page ${pageNumber}`}
      className="pdfv-page relative shrink-0 overflow-hidden"
      style={{ width, height, "--scale-factor": scale }}
    >
      <div ref={canvasHostRef} className="absolute inset-0" />
      <div ref={textRef} className="textLayer" />
      {state !== "rendered" && (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-neutral-500">
          {state === "failed" ? (
            "This page couldn't be displayed."
          ) : (
            <LoaderCircle className="size-5 animate-spin text-neutral-400" aria-hidden="true" />
          )}
        </div>
      )}
    </div>
  )
})

/* -------------------------------------------------------------------------- */
/*                                 Thumbnails                                 */
/* -------------------------------------------------------------------------- */

function ThumbnailSidebar({ pdf, pageSizes, currentPage, onSelect, onDismiss }) {
  const [root, setRoot] = useState(null)

  // Keep the current page's thumbnail in view without scrolling anything outside the sidebar.
  useEffect(() => {
    if (!root) return
    const item = root.querySelector(`[data-thumb="${currentPage}"]`)
    if (!item) return
    const top = item.offsetTop
    const bottom = top + item.offsetHeight
    if (top < root.scrollTop || bottom > root.scrollTop + root.clientHeight) {
      root.scrollTo({ top: top - root.clientHeight / 2 + item.offsetHeight / 2, behavior: "instant" })
    }
  }, [root, currentPage])

  return (
    <>
      {/* On small screens the sidebar overlays the page; tapping outside closes it. */}
      <div className="absolute inset-0 z-10 bg-black/20 lg:hidden" aria-hidden="true" onClick={onDismiss} />
      <nav
        id="pdfv-thumbnails"
        ref={setRoot}
        aria-label="Page thumbnails"
        className="absolute inset-y-0 left-0 z-20 w-40 shrink-0 overflow-y-auto border-r bg-background shadow-lg lg:static lg:z-auto lg:shadow-none"
      >
        <ol className="relative flex flex-col items-center gap-1 p-2">
          {root &&
            pageSizes.map((size, index) => (
              <Thumbnail
                key={index}
                pdf={pdf}
                pageNumber={index + 1}
                size={size}
                current={currentPage === index + 1}
                onSelect={onSelect}
                root={root}
              />
            ))}
        </ol>
      </nav>
    </>
  )
}

const Thumbnail = memo(function Thumbnail({ pdf, pageNumber, size, current, onSelect, root }) {
  const buttonRef = useRef(null)
  const hostRef = useRef(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), {
      root,
      rootMargin: "400px 0px",
    })
    observer.observe(buttonRef.current)
    return () => observer.disconnect()
  }, [root])

  useEffect(() => {
    const host = hostRef.current
    if (!visible) {
      releaseCanvases(host)
      return
    }
    let cancelled = false
    let task = null
    pdf
      .getPage(pageNumber)
      .then((page) => {
        if (cancelled) return
        const viewport = page.getViewport({ scale: THUMB_WIDTH / page.getViewport({ scale: 1 }).width })
        const outputScale = Math.min(window.devicePixelRatio || 1, 2)
        const canvas = document.createElement("canvas")
        canvas.width = Math.floor(viewport.width * outputScale)
        canvas.height = Math.floor(viewport.height * outputScale)
        canvas.setAttribute("aria-hidden", "true")
        task = page.render({
          canvasContext: canvas.getContext("2d", { alpha: false }),
          viewport,
          transform: outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined,
        })
        return task.promise.then(() => {
          if (cancelled) {
            canvas.width = canvas.height = 0
            return
          }
          releaseCanvases(host)
          host.appendChild(canvas)
        })
      })
      .catch((err) => {
        if (!isCancelled(err)) console.error(`Thumbnail ${pageNumber} failed:`, err)
      })
    return () => {
      cancelled = true
      task?.cancel()
    }
  }, [visible, pdf, pageNumber])

  return (
    <li data-thumb={pageNumber} className="w-full">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => onSelect(pageNumber)}
        aria-label={`Page ${pageNumber}`}
        aria-current={current ? "page" : undefined}
        className="group flex w-full flex-col items-center gap-1 rounded-lg p-1.5 outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <div
          ref={hostRef}
          className={cn(
            "pdfv-page relative overflow-hidden rounded-sm ring-2 ring-offset-1 ring-offset-background transition-shadow",
            current ? "ring-primary" : "ring-transparent"
          )}
          style={{ width: THUMB_WIDTH, height: Math.round((THUMB_WIDTH * size.height) / size.width) }}
        />
        <span className={cn("text-xs tabular-nums", current ? "font-medium text-foreground" : "text-muted-foreground")}>
          {pageNumber}
        </span>
      </button>
    </li>
  )
})

/* -------------------------------------------------------------------------- */
/*                                  Controls                                  */
/* -------------------------------------------------------------------------- */

function ToolButton({ label, icon: Icon, iconClassName, className, ...props }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={label}
      title={label}
      className={cn("size-10 aria-pressed:bg-muted md:size-8", className)}
      {...props}
    >
      <Icon className={iconClassName} />
    </Button>
  )
}

function PageField({ current, total, onSubmit, disabled }) {
  const inputRef = useRef(null)
  const [draft, setDraft] = useState(String(current))

  useEffect(() => {
    if (document.activeElement !== inputRef.current) setDraft(String(current))
  }, [current])

  const commit = () => {
    const value = parseInt(draft, 10)
    if (Number.isFinite(value)) onSubmit(value)
    setDraft(String(Number.isFinite(value) ? clamp(value, 1, total || 1) : current))
  }

  return (
    <form
      className="flex items-center gap-1 px-0.5 text-sm"
      onSubmit={(event) => {
        event.preventDefault()
        commit()
        inputRef.current?.blur()
      }}
    >
      <input
        ref={inputRef}
        inputMode="numeric"
        enterKeyHint="go"
        aria-label={`Page number, ${total} pages in total`}
        value={draft}
        disabled={disabled}
        onFocus={(event) => event.target.select()}
        onChange={(event) => setDraft(event.target.value.replace(/\D/g, ""))}
        onBlur={commit}
        className="h-10 w-11 rounded-lg border border-input bg-transparent text-center text-base tabular-nums outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 md:h-8 md:w-10 md:text-sm dark:bg-input/30"
      />
      <span className="whitespace-nowrap text-muted-foreground tabular-nums" aria-hidden="true">
        / {total || "–"}
      </span>
    </form>
  )
}

// Menus render inside the dialog (not document.body) so they stay visible in fullscreen mode.
function ViewerMenu({ trigger, children, container, label, align = "end" }) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>
      <DropdownMenu.Portal container={container}>
        <DropdownMenu.Content
          aria-label={label}
          align={align}
          sideOffset={4}
          collisionPadding={8}
          className="z-50 max-h-(--radix-dropdown-menu-content-available-height) min-w-44 origin-(--radix-dropdown-menu-content-transform-origin) overflow-y-auto rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95"
        >
          {children}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

function MenuItem({ icon: Icon, checked, asChild, children, ...props }) {
  const itemClass =
    "relative flex cursor-default items-center gap-2 rounded-md px-2 py-2 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50 md:py-1.5 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground"
  if (asChild) {
    // Links (download / open) keep their native behaviour; only the icon is prepended.
    const child = children
    return (
      <DropdownMenu.Item asChild className={itemClass} {...props}>
        <child.type {...child.props}>
          {Icon && <Icon aria-hidden="true" />}
          {child.props.children}
        </child.type>
      </DropdownMenu.Item>
    )
  }
  return (
    <DropdownMenu.Item className={cn(itemClass, checked && "font-medium")} {...props}>
      {Icon ? <Icon aria-hidden="true" /> : <span className="size-4" aria-hidden="true" />}
      <span className="flex-1">{children}</span>
      {checked && (
        <>
          <span className="size-1.5 rounded-full bg-foreground" aria-hidden="true" />
          <span className="sr-only">(selected)</span>
        </>
      )}
    </DropdownMenu.Item>
  )
}
