import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

import type { RiskLevelData } from "../pages/RiskPage";

type Props = {
  data: RiskLevelData[];
};

const colors: Record<string, string> = {
  Critical: "#ef4444",
  High: "#f97316",
  Moderate: "#f59e0b",
  Low: "#10b981",
};

const riskOrder = [
  "Critical",
  "High",
  "Moderate",
  "Low",
];

function formatMoney(value: number) {
  if (value >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(2)}M`;
  }

  if (value >= 1_000) {
    return `$${(value / 1_000).toFixed(0)}K`;
  }

  return `$${value.toLocaleString()}`;
}

function ArrByRiskChart({ data }: Props) {
  const sortedData = [...data].sort(
    (a, b) =>
      riskOrder.indexOf(a.riskLevel) -
      riskOrder.indexOf(b.riskLevel)
  );

  const totalArr = sortedData.reduce(
    (total, item) => total + item.arr,
    0
  );

  const chartData = sortedData.map((item) => ({
    name: item.riskLevel,
    value: item.arr,
  }));

  return (
    <div
      style={{
        width: "100%",
        height: "300px",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          flex: 1,
          minHeight: 0,
        }}
      >
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={65}
              outerRadius={100}
              paddingAngle={2}
              stroke="none"
            >
              {chartData.map((entry) => (
                <Cell
                  key={entry.name}
                  fill={colors[entry.name] ?? "#64748b"}
                />
              ))}
            </Pie>

            <Tooltip
              formatter={(value, name) => {
                const numericValue = Number(value);

                const percentage =
                  totalArr > 0
                    ? (numericValue / totalArr) * 100
                    : 0;

                return [
                  `${formatMoney(
                    numericValue
                  )} (${percentage.toFixed(2)}%)`,
                  name,
                ];
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "16px",
          paddingTop: "8px",
          fontSize: "13px",
        }}
      >
        {riskOrder.map((level) => (
          <div
            key={level}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              color: "#475569",
            }}
          >
            <span
              style={{
                width: "9px",
                height: "9px",
                borderRadius: "50%",
                backgroundColor: colors[level],
                display: "inline-block",
              }}
            />

            <span>{level}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default ArrByRiskChart;