import { useEffect, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

type RevenueMovementData = {
  month: string;
  newMrr: number;
  expansionMrr: number;
  contractionMrr: number;
  churnMrr: number;
};

function RevenueMovementsChart() {
  const [data, setData] = useState<RevenueMovementData[]>([]);

  useEffect(() => {
    fetch("http://localhost:3000/api/revenue-movements")
      .then((response) => {
        if (!response.ok) {
          throw new Error("Unable to fetch revenue movements");
        }

        return response.json();
      })
      .then((result: RevenueMovementData[]) => {
        setData(result);
      })
      .catch((error) => {
        console.error("Revenue movements error:", error);
      });
  }, []);

  const formattedData = data.map((item) => ({
    ...item,

    monthLabel: new Date(item.month).toLocaleDateString("en-US", {
      month: "short",
      year: "2-digit",
      timeZone: "UTC",
    }),

    fullMonth: new Date(item.month).toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }),

    contractionMrr: -item.contractionMrr,
    churnMrr: -item.churnMrr,
  }));

  const formatCurrency = (value: number) => {
    const absoluteValue = Math.abs(value);

    if (absoluteValue >= 1000000) {
      return `$${(absoluteValue / 1000000).toFixed(1)}M`;
    }

    return `$${Math.round(absoluteValue / 1000)}K`;
  };

  return (
    <ResponsiveContainer width="100%" height={340}>
      <BarChart
        data={formattedData}
        margin={{
          top: 10,
          right: 20,
          left: 10,
          bottom: 0,
        }}
        barGap={2}
      >
        <CartesianGrid
          strokeDasharray="4 4"
          vertical={false}
          stroke="#e2e8f0"
        />

        <XAxis
          dataKey="monthLabel"
          axisLine={false}
          tickLine={false}
          tick={{
            fontSize: 12,
            fill: "#64748b",
          }}
          dy={10}
        />

        <YAxis
          axisLine={false}
          tickLine={false}
          tick={{
            fontSize: 12,
            fill: "#64748b",
          }}
          tickFormatter={(value) =>
            `${value < 0 ? "-" : ""}${formatCurrency(value)}`
          }
          width={70}
        />

        <Tooltip
          cursor={{
            fill: "rgba(148, 163, 184, 0.08)",
          }}
          contentStyle={{
            borderRadius: "10px",
            border: "1px solid #e2e8f0",
            boxShadow: "0 4px 12px rgba(15, 23, 42, 0.08)",
          }}
          labelFormatter={(_, payload) =>
            payload?.[0]?.payload?.fullMonth ?? ""
          }
          formatter={(value, name) => {
            const labels: Record<string, string> = {
              newMrr: "New MRR",
              expansionMrr: "Expansion MRR",
              contractionMrr: "Contraction MRR",
              churnMrr: "Churned MRR",
            };

            return [
              `${Number(value) < 0 ? "-" : "+"}${formatCurrency(
                Number(value)
              )}`,
              labels[String(name)] ?? String(name),
            ];
          }}
        />

        <Legend
  verticalAlign="top"
  align="right"
  iconType="circle"
  wrapperStyle={{
    paddingBottom: "20px",
    fontSize: "13px",
  }}
  content={() => (
    <div
      style={{
        display: "flex",
        justifyContent: "flex-end",
        gap: "18px",
        paddingBottom: "20px",
        fontSize: "13px",
      }}
    >
      <span style={{ color: "#22c55e" }}>● New MRR</span>
      <span style={{ color: "#3b82f6" }}>● Expansion MRR</span>
      <span style={{ color: "#f59e0b" }}>● Contraction MRR</span>
      <span style={{ color: "#ef4444" }}>● Churned MRR</span>
    </div>
  )}
/>

        <Bar
          dataKey="newMrr"
          name="New MRR"
          fill="#22c55e"
          radius={[4, 4, 0, 0]}
        />

        <Bar
          dataKey="expansionMrr"
          name="Expansion MRR"
          fill="#3b82f6"
          radius={[4, 4, 0, 0]}
        />

        <Bar
          dataKey="contractionMrr"
          name="Contraction MRR"
          fill="#f59e0b"
          radius={[0, 0, 4, 4]}
        />

        <Bar
          dataKey="churnMrr"
          name="Churned MRR"
          fill="#ef4444"
          radius={[0, 0, 4, 4]}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

export default RevenueMovementsChart;