import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { RiskDriverData } from "../pages/RiskPage";

type Props = {
  data: RiskDriverData[];
};

function RiskDriversChart({ data }: Props) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{
          top: 5,
          right: 20,
          bottom: 5,
          left: 30,
        }}
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
          tick={{
            fontSize: 12,
            fill: "#64748b",
          }}
        />

        <YAxis
          type="category"
          dataKey="driver"
          width={110}
          axisLine={false}
          tickLine={false}
          tick={{
            fontSize: 12,
            fill: "#64748b",
          }}
        />

        <Tooltip
          formatter={(value) => [
            Number(value).toLocaleString(),
            "Risk Points",
          ]}
          cursor={{
            fill: "rgba(148, 163, 184, 0.08)",
          }}
        />

        <Bar
          dataKey="points"
          fill="#6366f1"
          barSize={28}
          radius={[0, 6, 6, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

export default RiskDriversChart;