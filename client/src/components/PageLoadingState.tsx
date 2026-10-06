type Props = {
  title: string;
  description: string;
  message: string;
  kpiCount?: number;
};

function PageLoadingState({
  title,
  description,
  message,
  kpiCount = 4,
}: Props) {
  return (
    <div className="page-loading">
      <header className="app-header">
        <h1>{title}</h1>
        <p>{description}</p>
      </header>

      <div className="loading-status">
        <div className="loading-spinner" />
        <span>{message}</span>
      </div>

     <div
  className="page-loading-kpis"
  style={{
    gridTemplateColumns: `repeat(${kpiCount}, 1fr)`,
  }}
>
        {Array.from({ length: kpiCount }).map((_, index) => (
          <div className="loading-kpi-card" key={index}>
            <div className="skeleton skeleton-label" />
            <div className="skeleton skeleton-value" />
          </div>
        ))}
      </div>

      <div className="page-loading-charts">
        {Array.from({ length: 4 }).map((_, index) => (
          <div className="loading-chart-card" key={index}>
            <div className="skeleton skeleton-chart-title" />
            <div className="skeleton skeleton-chart-subtitle" />
            <div className="skeleton skeleton-chart-area" />
          </div>
        ))}
      </div>

      <div className="loading-table-card">
        <div className="skeleton skeleton-table-title" />
        <div className="skeleton skeleton-table-subtitle" />

        {Array.from({ length: 4 }).map((_, index) => (
          <div
            className="skeleton skeleton-table-row"
            key={index}
          />
        ))}
      </div>
    </div>
  );
}

export default PageLoadingState;