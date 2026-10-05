import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { ExpansionDriverData } from "../pages/ExpansionPage";

type Props = {
  data: ExpansionDriverData[];
};

function ExpansionDriversChart({ data }: Props) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{
          top: 5,
          right: 20,
          bottom: 5,
          left: 45,
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
          width={125}
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
            "Opportunity Points",
          ]}
          cursor={{
            fill: "rgba(148, 163, 184, 0.08)",
          }}
        />

        <Bar
          dataKey="points"
          name="Opportunity Points"
          fill="#8b5cf6"
          barSize={28}
          radius={[0, 6, 6, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

export default ExpansionDriversChart;