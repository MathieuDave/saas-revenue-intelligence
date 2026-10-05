import './KpiCard.css'

type KpiCardProps = {
  title: string
  value: string
  accent?: 'green' | 'blue' | 'purple' | 'orange'
}

function KpiCard({
  title,
  value,
  accent = 'blue',
}: KpiCardProps) {
  return (
    <div className={`kpi-card kpi-card--${accent}`}>
      <h3>{title}</h3>
      <p>{value}</p>
    </div>
  )
}

export default KpiCard