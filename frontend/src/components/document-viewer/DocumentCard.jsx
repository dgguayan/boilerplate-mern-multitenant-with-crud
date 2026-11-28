import { lazy, Suspense, useRef, useState } from "react"
import { Dialog } from "radix-ui"
import { Download, ExternalLink, Eye, FileText, LoaderCircle } from "lucide-react"

import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { formatFileSize, getFileName, loadViewer } from "./utils"

// The viewer and PDF.js load only when a preview is opened (or hovered, as a prefetch).
const PdfViewerDialog = lazy(() => loadViewer().catch(() => ({ default: ViewerUnavailable })))

/**
 * Modal PDF viewer that downloads nothing until it is first opened.
 * Use it directly with your own trigger, or through <DocumentCard />.
 *
 *   <DocumentViewer document={doc} open={open} onOpenChange={setOpen} returnFocusRef={buttonRef} />
 */
export function DocumentViewer({ document, open, onOpenChange, returnFocusRef }) {
  const [requested, setRequested] = useState(open)
  if (open && !requested) setRequested(true)
  if (!requested) return null

  return (
    <Suspense fallback={open ? <ViewerLoading /> : null}>
      <PdfViewerDialog
        document={document}
        open={open}
        onOpenChange={onOpenChange}
        returnFocusRef={returnFocusRef}
      />
    </Suspense>
  )
}

/**
 * Resource card for a document: thumbnail, title, description, type and size,
 * with "Preview document" (opens the in-page viewer) and a plain "Download PDF" link.
 *
 * `document`: { url, title, description?, fileType?, size?, pages?, thumbnail?, fileName? }
 */
export function DocumentCard({ document, headingLevel = 3, className }) {
  const [open, setOpen] = useState(false)
  const previewRef = useRef(null)
  const Heading = `h${headingLevel}`
  const fileType = document.fileType ?? "PDF"
  const size = formatFileSize(document.size)
  const details = [size, document.pages ? `${document.pages} pages` : null].filter(Boolean).join(" · ")

  return (
    <Card className={cn("h-full gap-0 py-0", className)}>
      <DocumentThumbnail document={document} onOpen={() => setOpen(true)} />

      <CardHeader className="gap-1.5 py-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="secondary">{fileType}</Badge>
          {details && <span>{details}</span>}
        </div>
        <CardTitle>
          <Heading className="text-base leading-snug font-medium">{document.title}</Heading>
        </CardTitle>
        {document.description && <CardDescription>{document.description}</CardDescription>}
      </CardHeader>

      <CardFooter className="mt-auto flex-wrap gap-2">
        <Button
          ref={previewRef}
          aria-haspopup="dialog"
          onClick={() => setOpen(true)}
          onPointerEnter={prefetchViewer}
          onFocus={prefetchViewer}
        >
          <Eye data-icon="inline-start" />
          Preview document
          <span className="sr-only">: {document.title}</span>
        </Button>
        <Button asChild variant="outline">
          <a href={document.url} download={getFileName(document)} type="application/pdf">
            <Download data-icon="inline-start" />
            Download PDF
            <span className="sr-only">
              : {document.title}
              {size ? `, ${size}` : ""}
            </span>
          </a>
        </Button>
      </CardFooter>

      <DocumentViewer document={document} open={open} onOpenChange={setOpen} returnFocusRef={previewRef} />
    </Card>
  )
}

function prefetchViewer() {
  loadViewer().catch(() => {})
}

function DocumentThumbnail({ document, onOpen }) {
  // Clicking the thumbnail is a mouse shortcut; keyboard and screen reader users get the Preview button.
  return (
    <div
      className="relative flex aspect-[16/10] cursor-pointer items-end justify-center overflow-hidden border-b bg-muted/50"
      onClick={onOpen}
      onPointerEnter={prefetchViewer}
      aria-hidden="true"
    >
      {document.thumbnail ? (
        <img
          src={document.thumbnail}
          alt=""
          loading="lazy"
          decoding="async"
          className="size-full object-cover object-top"
        />
      ) : (
        <>
          <FileText className="absolute top-3 left-3 size-4 text-muted-foreground" />
          <div className="flex h-[82%] w-1/2 translate-y-[4%] flex-col gap-[6%] rounded-t-md bg-white p-[7%] shadow-sm ring-1 ring-foreground/10 transition-transform duration-300 group-hover/card:translate-y-0 motion-reduce:transition-none">
            <div className="h-[9%] w-full rounded-[2px] bg-neutral-800" />
            <div className="h-[7%] w-2/3 rounded-[2px] bg-neutral-300" />
            {[100, 92, 96, 70, 100, 84].map((width, i) => (
              <div key={i} className="h-[4%] rounded-[2px] bg-neutral-200" style={{ width: `${width}%` }} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function ViewerLoading() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" role="status">
      <LoaderCircle className="size-6 animate-spin text-white" aria-hidden="true" />
      <span className="sr-only">Opening document preview…</span>
    </div>
  )
}

/** Shown if the viewer code itself can't be downloaded (offline, blocked chunk). */
function ViewerUnavailable({ open, onOpenChange, document }) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 grid w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 gap-3 rounded-xl bg-popover p-5 text-sm text-popover-foreground shadow-lg ring-1 ring-foreground/10">
          <Dialog.Title className="text-base font-medium">Preview unavailable</Dialog.Title>
          <Dialog.Description className="text-muted-foreground">
            The document viewer couldn't be loaded. You can still open or download the original file.
          </Dialog.Description>
          <div className="flex flex-wrap justify-end gap-2">
            <Button asChild variant="outline">
              <a href={document.url} target="_blank" rel="noopener">
                <ExternalLink data-icon="inline-start" />
                Open original
              </a>
            </Button>
            <Button asChild>
              <a href={document.url} download={getFileName(document)}>
                <Download data-icon="inline-start" />
                Download PDF
              </a>
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
