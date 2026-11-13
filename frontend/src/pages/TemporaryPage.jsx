import { Construction } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export default function TemporaryPage({ title, description }) {
  return (
    <div className="flex flex-1 items-start justify-center p-4 sm:p-6">
      <Card className="mt-[8vh] w-full max-w-xl shadow-none">
        <CardHeader>
          <div className="mb-3 flex size-10 items-center justify-center rounded-lg border bg-muted/50">
            <Construction className="size-5 text-muted-foreground" />
          </div>
          <div className="flex items-center gap-2">
            <CardTitle>{title}</CardTitle>
            <Badge variant="secondary">Temporary</Badge>
          </div>
          <CardDescription>{description || `The ${title.toLowerCase()} page is ready for its feature implementation.`}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="dashboard-placeholder h-36 rounded-lg border" />
        </CardContent>
      </Card>
    </div>
  )
}
