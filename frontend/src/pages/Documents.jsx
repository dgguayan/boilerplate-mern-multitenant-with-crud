import { DocumentCard } from "@/components/document-viewer/DocumentCard"
import { documents } from "@/data/documents"

export default function Documents() {
  return (
    <div className="flex w-full min-w-0 flex-col p-4">
      <div className="mb-4">
        <h1 className="text-2xl font-semibold tracking-tight">Documents</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">Preview documents in the browser or download the PDF.</p>
      </div>

      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" role="list">
        {documents.map((document) => (
          <li key={document.id}>
            <DocumentCard document={document} headingLevel={2} />
          </li>
        ))}
      </ul>
    </div>
  )
}
