import './KpiCard.css'

type KpiCardProps = {
  title: string
  value: string
}

function KpiCard({ title, value }: KpiCardProps) {
  return (
    <div className="kpi-card">
      <h3>{title}</h3>
      <p>{value}</p>
    </div>
  )
}

export default KpiCard