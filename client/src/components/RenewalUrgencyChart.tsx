import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { RenewalUrgencyData } from "../pages/RiskPage";

type Props = {
  data: RenewalUrgencyData[];
};

function RenewalUrgencyChart({ data }: Props) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart
        data={data}
        margin={{ top: 10, right: 15, bottom: 5, left: 5 }}
      >
        <CartesianGrid
          strokeDasharray="4 4"
          vertical={false}
          stroke="#e2e8f0"
        />

        <XAxis
          dataKey="range"
          axisLine={false}
          tickLine={false}
          tick={{ fontSize: 12, fill: "#64748b" }}
        />

        <YAxis
          allowDecimals={false}
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
          fill="#3b82f6"
          maxBarSize={110}
          radius={[6, 6, 0, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

export default RenewalUrgencyChart;