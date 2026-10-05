import { useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

type RevenueTrendData = {
  month: string;
  mrr: number;
};

function RevenueTrendChart() {
  const [data, setData] = useState<RevenueTrendData[]>([]);

  useEffect(() => {
    fetch("http://localhost:3000/api/revenue-trend")
      .then((response) => {
        if (!response.ok) {
          throw new Error("Unable to fetch revenue trend data");
        }

        return response.json();
      })
      .then((result: RevenueTrendData[]) => {
        setData(result);
      })
      .catch((error) => {
        console.error("Revenue trend error:", error);
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
  }));

  const formatCurrency = (value: number) => {
    if (value >= 1000000) {
      return `$${(value / 1000000).toFixed(2)}M`;
    }

    return `$${Math.round(value / 1000)}K`;
  };

  return (
    <ResponsiveContainer width="100%" height={320}>
      <AreaChart
        data={formattedData}
        margin={{
          top: 10,
          right: 20,
          left: 10,
          bottom: 0,
        }}
      >
        <defs>
          <linearGradient
            id="mrrGradient"
            x1="0"
            y1="0"
            x2="0"
            y2="1"
          >
            <stop
              offset="5%"
              stopColor="#2563eb"
              stopOpacity={0.22}
            />

            <stop
              offset="95%"
              stopColor="#2563eb"
              stopOpacity={0.02}
            />
          </linearGradient>
        </defs>

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
          domain={["dataMin - 50000", "dataMax + 50000"]}
          axisLine={false}
          tickLine={false}
          tick={{
            fontSize: 12,
            fill: "#64748b",
          }}
          tickFormatter={formatCurrency}
          width={75}
        />

        <Tooltip
          cursor={{
            stroke: "#94a3b8",
            strokeDasharray: "4 4",
          }}
          contentStyle={{
            borderRadius: "10px",
            border: "1px solid #e2e8f0",
            boxShadow: "0 4px 12px rgba(15, 23, 42, 0.08)",
          }}
          labelFormatter={(_, payload) =>
            payload?.[0]?.payload?.fullMonth ?? ""
          }
          formatter={(value) => [
            formatCurrency(Number(value)),
            "Monthly Recurring Revenue",
          ]}
        />

        <Area
          type="monotone"
          dataKey="mrr"
          stroke="#2563eb"
          strokeWidth={3}
          fill="url(#mrrGradient)"
          dot={false}
          activeDot={{
            r: 5,
            strokeWidth: 2,
            fill: "#ffffff",
          }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export default RevenueTrendChart;