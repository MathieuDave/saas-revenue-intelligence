import './ChartCard.css'
import type { ReactNode } from 'react'

type ChartCardProps = {
  title: string
  description?: string
  children: ReactNode
}

function ChartCard({
  title,
  description,
  children,
}: ChartCardProps) {
  return (
    <section className="chart-card">
      <div className="chart-card-header">
        <h2>{title}</h2>

        {description && (
          <p>{description}</p>
        )}
      </div>

      <div className="chart-card-content">
        {children}
      </div>
    </section>
  )
}

export default ChartCard