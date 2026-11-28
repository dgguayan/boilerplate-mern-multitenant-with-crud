/**
 * Documents shown on the Documents page.
 *
 * Each entry feeds a <DocumentCard />:
 *   id          unique key
 *   url         direct link to the PDF (kept as a plain, crawlable <a href>)
 *   title       card and viewer title
 *   description short summary, rendered as HTML text on the card
 *   fileType    label shown on the card (defaults to "PDF")
 *   size        file size in bytes (optional)
 *   pages       page count shown on the card (optional)
 *   thumbnail   preview image URL (optional — a drawn placeholder is used without one)
 *   updatedAt   ISO date (optional)
 *
 * To load these from an API later, return the same shape and pass it to the page.
 */
export const documents = [
  {
    id: "employee-handbook",
    url: "/docs/employee-handbook.pdf",
    title: "Employee Handbook 2026",
    description: "How we work: working hours, time off, device security, benefits and who to contact with questions.",
    fileType: "PDF",
    size: 8532,
    pages: 6,
    updatedAt: "2026-01-12",
  },
  {
    id: "security-overview",
    url: "/docs/security-overview.pdf",
    title: "Platform Security Overview",
    description: "The controls that protect tenant data: authentication, tenant isolation, role-based access and monitoring.",
    fileType: "PDF",
    size: 5227,
    pages: 4,
    updatedAt: "2026-09-03",
  },
  {
    id: "quarterly-report",
    url: "/docs/quarterly-report.pdf",
    title: "Quarterly Product Report – Q3",
    description: "Workspace growth, feature adoption and the focus areas planned for next quarter.",
    fileType: "PDF",
    size: 3788,
    pages: 3,
    updatedAt: "2026-10-15",
  },
]
