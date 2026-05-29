"use client";

import type { ReactNode } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type ChartTone = "brand" | "good" | "amber" | "ruby" | "iris" | "slate";

export type ChartDatum = {
  name: string;
  displayValue?: string;
  sublabel?: string;
  tone?: ChartTone;
  [key: string]: string | number | undefined;
};

export type SeriesConfig = {
  key: string;
  label: string;
  tone?: ChartTone;
};

const CHART_COLORS: Record<ChartTone, string> = {
  brand: "#1f5d84",
  good: "#17785b",
  amber: "#c98220",
  ruby: "#cb3f55",
  iris: "#5d61c8",
  slate: "#5c687a",
};

const GRID_COLOR = "#e5edf4";
const TEXT_SOFT = "#5c687a";
const ANIMATION_DURATION = 460;

function colorFor(tone: ChartTone | undefined, index = 0) {
  if (tone) return CHART_COLORS[tone];
  const fallback: ChartTone[] = ["brand", "iris", "amber", "good", "ruby", "slate"];
  return CHART_COLORS[fallback[index % fallback.length]];
}

function compactNumber(value: number) {
  return new Intl.NumberFormat("en-US", {
    notation: Math.abs(value) >= 1000 ? "compact" : "standard",
    maximumFractionDigits: Math.abs(value) >= 1000 ? 1 : 0,
  }).format(value);
}

function formatTooltipValue(value: unknown, name: unknown) {
  const numericValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numericValue)) return String(value ?? "");
  const key = String(name ?? "").toLowerCase();
  const looksFinancial = ["revenue", "cost", "margin", "cash", "due", "paid", "amount", "ebitda", "invoice"].some((part) =>
    key.includes(part)
  );
  if (!looksFinancial && Math.abs(numericValue) < 1000) return compactNumber(numericValue);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: Math.abs(numericValue) >= 1000000 ? "compact" : "standard",
    maximumFractionDigits: Math.abs(numericValue) >= 1000000 ? 1 : 0,
  }).format(numericValue);
}

function LscTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ color?: string; name?: string; value?: unknown; payload?: ChartDatum }>;
  label?: string | number;
}) {
  if (!active || !payload?.length) return null;

  return (
    <div className="lsc-chart-tooltip">
      <strong>{label}</strong>
      {payload.map((entry) => (
        <span key={`${entry.name}-${String(entry.value)}`}>
          <i style={{ backgroundColor: entry.color }} />
          {entry.name}: {formatTooltipValue(entry.value, entry.name)}
        </span>
      ))}
    </div>
  );
}

function ChartContainer({
  children,
  height,
  minWidth = 180,
}: {
  children: ReactNode;
  height: number;
  minWidth?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height} minWidth={minWidth} minHeight={height}>
      {children}
    </ResponsiveContainer>
  );
}

export function ChartEmptyState({ label = "No derived chart data yet." }: { label?: string }) {
  return (
    <div className="lsc-chart-empty">
      <span>{label}</span>
    </div>
  );
}

export function FinanceTrendChart({
  data,
  series,
  height = 280,
}: {
  data: readonly ChartDatum[];
  series: readonly SeriesConfig[];
  height?: number;
}) {
  if (data.length === 0 || series.length === 0) return <ChartEmptyState />;

  return (
    <div className="lsc-recharts-surface" style={{ height }}>
      <ChartContainer height={height}>
        <ComposedChart data={data} margin={{ top: 8, right: 18, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={GRID_COLOR} vertical={false} />
          <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fill: TEXT_SOFT, fontSize: 11 }} />
          <YAxis tickLine={false} axisLine={false} tick={{ fill: TEXT_SOFT, fontSize: 11 }} tickFormatter={compactNumber} width={42} />
          <Tooltip content={<LscTooltip />} />
          <Legend iconType="circle" wrapperStyle={{ fontSize: 11, color: TEXT_SOFT }} />
          {series.map((item, index) =>
            index === series.length - 1 ? (
              <Line
                key={item.key}
                type="monotone"
                dataKey={item.key}
                name={item.label}
                stroke={colorFor(item.tone, index)}
                strokeWidth={2.6}
                dot={false}
                isAnimationActive
                animationDuration={ANIMATION_DURATION}
              />
            ) : (
              <Area
                key={item.key}
                type="monotone"
                dataKey={item.key}
                name={item.label}
                stroke={colorFor(item.tone, index)}
                fill={colorFor(item.tone, index)}
                fillOpacity={0.12}
                strokeWidth={2}
                isAnimationActive
                animationDuration={ANIMATION_DURATION}
              />
            )
          )}
        </ComposedChart>
      </ChartContainer>
    </div>
  );
}

export function CashMovementChart({ data, height = 260 }: { data: readonly ChartDatum[]; height?: number }) {
  if (data.length === 0) return <ChartEmptyState label="No cash movement loaded." />;

  return (
    <div className="lsc-recharts-surface" style={{ height }}>
      <ChartContainer height={height}>
        <ComposedChart data={data} margin={{ top: 8, right: 18, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={GRID_COLOR} vertical={false} />
          <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fill: TEXT_SOFT, fontSize: 11 }} />
          <YAxis tickLine={false} axisLine={false} tick={{ fill: TEXT_SOFT, fontSize: 11 }} tickFormatter={compactNumber} width={42} />
          <Tooltip content={<LscTooltip />} />
          <Legend iconType="circle" wrapperStyle={{ fontSize: 11, color: TEXT_SOFT }} />
          <Bar dataKey="cashIn" name="Cash in" fill={CHART_COLORS.good} radius={[8, 8, 0, 0]} isAnimationActive animationDuration={ANIMATION_DURATION} />
          <Bar dataKey="cashOut" name="Cash out" fill={CHART_COLORS.ruby} radius={[8, 8, 0, 0]} isAnimationActive animationDuration={ANIMATION_DURATION} />
          <Line type="monotone" dataKey="net" name="Net" stroke={CHART_COLORS.brand} strokeWidth={2.4} dot={false} isAnimationActive animationDuration={ANIMATION_DURATION} />
        </ComposedChart>
      </ChartContainer>
    </div>
  );
}

export function HorizontalComparisonChart({
  data,
  dataKey = "value",
  height = 280,
}: {
  data: readonly ChartDatum[];
  dataKey?: string;
  height?: number;
}) {
  if (data.length === 0) return <ChartEmptyState />;

  return (
    <div className="lsc-recharts-surface" style={{ height }}>
      <ChartContainer height={height}>
        <BarChart layout="vertical" data={data} margin={{ top: 8, right: 18, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={GRID_COLOR} horizontal={false} />
          <XAxis type="number" tickLine={false} axisLine={false} tick={{ fill: TEXT_SOFT, fontSize: 11 }} tickFormatter={compactNumber} />
          <YAxis type="category" dataKey="name" tickLine={false} axisLine={false} tick={{ fill: TEXT_SOFT, fontSize: 11 }} width={118} />
          <Tooltip content={<LscTooltip />} />
          <Bar dataKey={dataKey} name="Amount" radius={[0, 8, 8, 0]} barSize={14} isAnimationActive animationDuration={ANIMATION_DURATION}>
            {data.map((entry, index) => (
              <Cell key={entry.name} fill={colorFor(entry.tone, index)} />
            ))}
          </Bar>
        </BarChart>
      </ChartContainer>
    </div>
  );
}

export function StatusDonutChart({
  data,
  height = 240,
}: {
  data: readonly ChartDatum[];
  height?: number;
}) {
  const visibleData = data.filter((entry) => Number(entry.value ?? 0) !== 0);
  if (visibleData.length === 0) return <ChartEmptyState />;

  return (
    <div className="lsc-donut-layout">
      <div className="lsc-recharts-surface lsc-donut-chart" style={{ height }}>
        <ChartContainer height={height} minWidth={170}>
          <PieChart>
            <Tooltip content={<LscTooltip />} />
            <Pie data={visibleData} dataKey="value" nameKey="name" innerRadius={58} outerRadius={92} paddingAngle={3} isAnimationActive animationDuration={ANIMATION_DURATION}>
              {visibleData.map((entry, index) => (
                <Cell key={entry.name} fill={colorFor(entry.tone, index)} />
              ))}
            </Pie>
          </PieChart>
        </ChartContainer>
      </div>
      <div className="lsc-chart-legend-list">
        {visibleData.map((entry, index) => (
          <div key={entry.name}>
            <i style={{ backgroundColor: colorFor(entry.tone, index) }} />
            <span>{entry.name}</span>
            <strong>{entry.displayValue ?? formatTooltipValue(entry.value, entry.name)}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

export function WaterfallBridgeChart({
  data,
  height = 280,
}: {
  data: readonly ChartDatum[];
  height?: number;
}) {
  if (data.length === 0) return <ChartEmptyState />;

  let running = 0;
  const bridgeData = data.map((entry) => {
    const value = Number(entry.value ?? 0);
    const start = value >= 0 ? running : running + value;
    running += value;
    return {
      ...entry,
      base: Math.max(0, start),
      amount: Math.abs(value),
      signedAmount: value,
    };
  });

  return (
    <div className="lsc-recharts-surface" style={{ height }}>
      <ChartContainer height={height}>
        <BarChart data={bridgeData} margin={{ top: 8, right: 18, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={GRID_COLOR} vertical={false} />
          <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fill: TEXT_SOFT, fontSize: 11 }} interval={0} />
          <YAxis tickLine={false} axisLine={false} tick={{ fill: TEXT_SOFT, fontSize: 11 }} tickFormatter={compactNumber} width={42} />
          <Tooltip content={<LscTooltip />} />
          <Bar dataKey="base" stackId="bridge" fill="transparent" isAnimationActive={false} />
          <Bar dataKey="amount" name="Amount" stackId="bridge" radius={[8, 8, 0, 0]} isAnimationActive animationDuration={ANIMATION_DURATION}>
            {bridgeData.map((entry, index) => (
              <Cell key={entry.name} fill={colorFor(entry.tone, index)} />
            ))}
          </Bar>
        </BarChart>
      </ChartContainer>
    </div>
  );
}

export function MiniSparkline({ data, dataKey = "value" }: { data: readonly ChartDatum[]; dataKey?: string }) {
  if (data.length === 0) return null;

  return (
    <div className="lsc-mini-sparkline" aria-hidden="true">
      <ChartContainer height={38} minWidth={80}>
        <AreaChart data={data} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
          <Area type="monotone" dataKey={dataKey} stroke={CHART_COLORS.brand} fill={CHART_COLORS.brand} fillOpacity={0.16} strokeWidth={2} isAnimationActive animationDuration={ANIMATION_DURATION} />
        </AreaChart>
      </ChartContainer>
    </div>
  );
}
