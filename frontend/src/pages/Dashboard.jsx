import { Card } from "@/components/ui/card"

function PlaceholderPanel({ label, className = "" }) {
  return (
    <Card
      aria-label={label}
      className={`dashboard-placeholder min-h-56 shadow-none ${className}`}
    />
  )
}

export default function Dashboard() {
  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 p-4 md:grid-cols-3 md:grid-rows-[298px_minmax(420px,1fr)]">
      <PlaceholderPanel label="Dashboard summary panel one" />
      <PlaceholderPanel label="Dashboard summary panel two" />
      <PlaceholderPanel label="Dashboard summary panel three" />
      <PlaceholderPanel
        label="Dashboard main content panel"
        className="min-h-[420px] md:col-span-3 md:min-h-0"
      />
    </div>
  )
}
