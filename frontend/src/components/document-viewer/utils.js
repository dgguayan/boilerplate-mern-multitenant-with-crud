/** Formats a byte count as a short, human readable size ("8.3 KB"). */
export function formatFileSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return null
  const units = ["B", "KB", "MB", "GB"]
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / 1024 ** exponent
  return `${value >= 10 || exponent === 0 ? Math.round(value) : value.toFixed(1)} ${units[exponent]}`
}

/** File name used for the download attribute, taken from the URL when none is given. */
export function getFileName(document) {
  if (document.fileName) return document.fileName
  try {
    const { pathname } = new URL(document.url, window.location.href)
    return decodeURIComponent(pathname.split("/").pop() || "document.pdf")
  } catch {
    return "document.pdf"
  }
}

/** Loads the viewer chunk (and warms up PDF.js) — called on open, and on hover/focus as a prefetch. */
export function loadViewer() {
  return import("./PdfViewerDialog.jsx").then((module) => {
    module.preloadPdfjs()
    return module
  })
}
