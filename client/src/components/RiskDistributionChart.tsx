import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
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

function RiskDistributionChart({ data }: Props) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 5, right: 20, bottom: 5, left: 15 }}
      >
        <CartesianGrid
          strokeDasharray="4 4"
          horizontal={false}
          stroke="#e2e8f0"
        />

        <XAxis
          type="number"
          axisLine={false}
          tickLine={false}
          tick={{ fontSize: 12, fill: "#64748b" }}
        />

        <YAxis
          type="category"
          dataKey="riskLevel"
          width={75}
          axisLine={false}
          tickLine={false}
          tick={{ fontSize: 12, fill: "#64748b" }}
        />

        <Tooltip
          formatter={(value) => [
            Number(value).toLocaleString(),
            "Accounts",
          ]}
        />

        <Bar
          dataKey="accounts"
          barSize={28}
          radius={[0, 6, 6, 0]}
        >
          {data.map((entry) => (
            <Cell
              key={entry.riskLevel}
              fill={colors[entry.riskLevel] ?? "#64748b"}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export default RiskDistributionChart;