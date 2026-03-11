import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
  CartesianGrid,
  Legend,
} from "recharts";

import { useStore } from "~/store";
import { SidebarInset } from "~/components/ui/sidebar";
import { isElectron } from "~/env";
import type { Thread, Project } from "~/types";

// ── Theme-aware chart colors ────────────────────────────────────────

const CHART_COLORS: string[] = [
  "hsl(221 83% 53%)", // blue-600
  "hsl(262 83% 58%)", // violet-500
  "hsl(160 84% 39%)", // emerald-600
  "hsl(25 95% 53%)", // orange-500
  "hsl(346 77% 50%)", // rose-600
  "hsl(199 89% 48%)", // sky-500
  "hsl(47 96% 53%)", // amber-400
  "hsl(280 67% 50%)", // purple-500
];

function chartColor(index: number): string {
  return CHART_COLORS[index % CHART_COLORS.length] ?? CHART_COLORS[0] ?? "currentColor";
}

const MUTED_TEXT = "hsl(var(--muted-foreground))";

// ── Helpers ─────────────────────────────────────────────────────────

function formatDuration(ms: number): string {
  if (ms < 1_000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1_000).toFixed(1)}s`;
  if (ms < 3_600_000) return `${(ms / 60_000).toFixed(1)}m`;
  return `${(ms / 3_600_000).toFixed(1)}h`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function dayKey(iso: string): string {
  return iso.slice(0, 10); // YYYY-MM-DD
}

function weekKey(iso: string): string {
  const d = new Date(iso);
  const dayOfWeek = d.getUTCDay();
  const diff = d.getUTCDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), diff));
  return monday.toISOString().slice(0, 10);
}

function hourOfDay(iso: string): number {
  return new Date(iso).getHours();
}

function dayOfWeekLabel(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { weekday: "short" });
}

// ── Stat card ───────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string | undefined;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
        {value}
      </p>
      {sub && (
        <p className="mt-0.5 text-xs text-muted-foreground/70">{sub}</p>
      )}
    </div>
  );
}

// ── Custom tooltip ──────────────────────────────────────────────────

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-md">
      {label && (
        <p className="mb-1 font-medium text-foreground">{label}</p>
      )}
      {payload.map((entry) => (
        <p key={`${entry.name}:${entry.value}`} style={{ color: entry.color }}>
          {entry.name}: {typeof entry.value === "number" ? entry.value.toLocaleString() : entry.value}
        </p>
      ))}
    </div>
  );
}

// ── Productivity & Efficiency ───────────────────────────────────────

function useProductivityMetrics(threads: Thread[]) {
  return useMemo(() => {
    // Turns per thread
    const turnsPerThread = threads.map((t) => ({
      title: t.title.length > 25 ? t.title.slice(0, 25) + "..." : t.title,
      turns: t.turnDiffSummaries.length,
      messages: t.messages.length,
    }));

    // Turn state distribution (across latest turns)
    const turnStateCounts: Record<string, number> = {};
    for (const t of threads) {
      if (t.latestTurn) {
        turnStateCounts[t.latestTurn.state] =
          (turnStateCounts[t.latestTurn.state] ?? 0) + 1;
      }
    }
    const turnStateData = Object.entries(turnStateCounts).map(
      ([state, count]) => ({ name: state, value: count }),
    );

    // Model usage distribution
    const modelCounts: Record<string, number> = {};
    for (const t of threads) {
      const model = t.model.replace(/^(codex:|claude-code:|gemini:)/, "");
      modelCounts[model] = (modelCounts[model] ?? 0) + 1;
    }
    const modelUsageData = Object.entries(modelCounts)
      .toSorted((a, b) => b[1] - a[1])
      .map(([model, count]) => ({ name: model, value: count }));

    // Activity breakdown by tone
    const toneCounts: Record<string, number> = {
      info: 0,
      tool: 0,
      approval: 0,
      error: 0,
    };
    for (const t of threads) {
      for (const a of t.activities) {
        toneCounts[a.tone] = (toneCounts[a.tone] ?? 0) + 1;
      }
    }
    const activityToneData = Object.entries(toneCounts)
      .filter(([, v]) => v > 0)
      .map(([tone, count]) => ({ name: tone, value: count }));

    // Turn duration estimates (from turnDiffSummaries consecutive completedAt)
    const turnDurations: Array<{ model: string; durations: number[] }> = [];
    const durationsByModel: Record<string, number[]> = {};
    for (const t of threads) {
      const sorted = [...t.turnDiffSummaries].toSorted(
        (a, b) =>
          new Date(a.completedAt).getTime() - new Date(b.completedAt).getTime(),
      );
      for (let i = 1; i < sorted.length; i++) {
        const delta =
          new Date(sorted[i]!.completedAt).getTime() -
          new Date(sorted[i - 1]!.completedAt).getTime();
        if (delta > 0 && delta < 3_600_000) {
          // < 1 hour to filter outliers
          const model = t.model;
          if (!durationsByModel[model]) durationsByModel[model] = [];
          durationsByModel[model]!.push(delta);
        }
      }
    }
    for (const [model, durations] of Object.entries(durationsByModel)) {
      turnDurations.push({ model, durations });
    }
    const avgDurationByModel = turnDurations.map(({ model, durations }) => ({
      model: model.length > 20 ? model.slice(0, 20) + "..." : model,
      avgMs:
        durations.reduce((s, d) => s + d, 0) / (durations.length || 1),
      count: durations.length,
    }));

    // Summary stats
    const totalThreads = threads.length;
    const totalTurns = threads.reduce(
      (s, t) => s + t.turnDiffSummaries.length,
      0,
    );
    const totalMessages = threads.reduce((s, t) => s + t.messages.length, 0);
    const totalActivities = threads.reduce(
      (s, t) => s + t.activities.length,
      0,
    );
    const errorCount = toneCounts.error ?? 0;
    const avgTurnsPerThread =
      totalThreads > 0 ? (totalTurns / totalThreads).toFixed(1) : "0";

    return {
      turnsPerThread: turnsPerThread
        .filter((t) => t.turns > 0)
        .toSorted((a, b) => b.turns - a.turns)
        .slice(0, 15),
      turnStateData,
      modelUsageData,
      activityToneData,
      avgDurationByModel,
      totalThreads,
      totalTurns,
      totalMessages,
      totalActivities,
      errorCount,
      avgTurnsPerThread,
    };
  }, [threads]);
}

// ── Cost & Token Burn ───────────────────────────────────────────────

function useTokenMetrics(threads: Thread[]) {
  return useMemo(() => {
    let totalInput = 0;
    let totalOutput = 0;
    let totalCached = 0;
    let totalReasoning = 0;
    let threadsWithTokens = 0;
    let totalUsedPercent = 0;

    const tokensByModel: Record<
      string,
      { input: number; output: number; cached: number; reasoning: number; count: number }
    > = {};

    const threadTokens: Array<{
      title: string;
      model: string;
      input: number;
      output: number;
      cached: number;
      reasoning: number;
      usedPercent: number;
    }> = [];

    for (const t of threads) {
      const cw = t.contextWindow;
      if (!cw) continue;
      threadsWithTokens++;

      const input = cw.inputTokens ?? 0;
      const output = cw.outputTokens ?? 0;
      const cached = cw.cachedInputTokens ?? 0;
      const reasoning = cw.reasoningOutputTokens ?? 0;

      totalInput += input;
      totalOutput += output;
      totalCached += cached;
      totalReasoning += reasoning;
      totalUsedPercent += cw.usedPercent;

      const model = t.model;
      if (!tokensByModel[model]) {
        tokensByModel[model] = { input: 0, output: 0, cached: 0, reasoning: 0, count: 0 };
      }
      tokensByModel[model]!.input += input;
      tokensByModel[model]!.output += output;
      tokensByModel[model]!.cached += cached;
      tokensByModel[model]!.reasoning += reasoning;
      tokensByModel[model]!.count++;

      threadTokens.push({
        title: t.title.length > 25 ? t.title.slice(0, 25) + "..." : t.title,
        model,
        input,
        output,
        cached,
        reasoning,
        usedPercent: cw.usedPercent,
      });
    }

    const cacheHitRate =
      totalInput > 0
        ? ((totalCached / totalInput) * 100).toFixed(1) + "%"
        : "N/A";
    const avgContextUtil =
      threadsWithTokens > 0
        ? (totalUsedPercent / threadsWithTokens).toFixed(0) + "%"
        : "N/A";

    // Token breakdown pie
    const tokenBreakdown = [
      { name: "Input", value: totalInput - totalCached },
      { name: "Cached Input", value: totalCached },
      { name: "Output", value: totalOutput - totalReasoning },
      { name: "Reasoning", value: totalReasoning },
    ].filter((d) => d.value > 0);

    // Per-model token usage
    const modelTokenData = Object.entries(tokensByModel)
      .toSorted((a, b) => (b[1].input + b[1].output) - (a[1].input + a[1].output))
      .map(([model, data]) => ({
        model: model.length > 20 ? model.slice(0, 20) + "..." : model,
        input: data.input,
        output: data.output,
        cached: data.cached,
        reasoning: data.reasoning,
        threads: data.count,
      }));

    // Context utilization distribution
    const contextUtilBuckets = [
      { range: "0-25%", count: 0 },
      { range: "25-50%", count: 0 },
      { range: "50-75%", count: 0 },
      { range: "75-90%", count: 0 },
      { range: "90-100%", count: 0 },
    ];
    for (const t of threadTokens) {
      if (t.usedPercent <= 25) contextUtilBuckets[0]!.count++;
      else if (t.usedPercent <= 50) contextUtilBuckets[1]!.count++;
      else if (t.usedPercent <= 75) contextUtilBuckets[2]!.count++;
      else if (t.usedPercent <= 90) contextUtilBuckets[3]!.count++;
      else contextUtilBuckets[4]!.count++;
    }

    // Top token-consuming threads
    const topTokenThreads = [...threadTokens]
      .toSorted((a, b) => (b.input + b.output) - (a.input + a.output))
      .slice(0, 10);

    return {
      totalInput,
      totalOutput,
      totalCached,
      totalReasoning,
      cacheHitRate,
      avgContextUtil,
      tokenBreakdown,
      modelTokenData,
      contextUtilBuckets: contextUtilBuckets.filter((b) => b.count > 0),
      topTokenThreads,
      threadsWithTokens,
    };
  }, [threads]);
}

// ── Project Health ──────────────────────────────────────────────────

function useProjectHealthMetrics(threads: Thread[], projects: Project[]) {
  return useMemo(() => {
    // Threads per project
    const threadsByProject: Record<string, { name: string; total: number; active: number; errored: number }> = {};
    for (const p of projects) {
      threadsByProject[p.id] = { name: p.name, total: 0, active: 0, errored: 0 };
    }
    for (const t of threads) {
      const entry = threadsByProject[t.projectId];
      if (!entry) continue;
      entry.total++;
      if (
        t.session?.status === "running" ||
        t.session?.status === "connecting" ||
        t.session?.status === "ready"
      ) {
        entry.active++;
      }
      if (t.latestTurn?.state === "error") {
        entry.errored++;
      }
    }
    const projectThreadData = Object.values(threadsByProject)
      .filter((p) => p.total > 0)
      .toSorted((a, b) => b.total - a.total);

    // Thread creation timeline (by week)
    const creationByWeek: Record<string, number> = {};
    for (const t of threads) {
      const wk = weekKey(t.createdAt);
      creationByWeek[wk] = (creationByWeek[wk] ?? 0) + 1;
    }
    const creationTimeline = Object.entries(creationByWeek)
      .toSorted(([a], [b]) => a.localeCompare(b))
      .map(([week, count]) => ({ week, threads: count }));

    // Activity heatmap (hour of day)
    const activityByHour = Array.from({ length: 24 }, () => 0);
    for (const t of threads) {
      for (const a of t.activities) {
        activityByHour[hourOfDay(a.createdAt)]!++;
      }
    }
    const hourlyActivityData = activityByHour.map((count, hour) => ({
      hour: `${hour.toString().padStart(2, "0")}:00`,
      activities: count,
    }));

    // Activity by day of week
    const activityByDay: Record<string, number> = {
      Mon: 0,
      Tue: 0,
      Wed: 0,
      Thu: 0,
      Fri: 0,
      Sat: 0,
      Sun: 0,
    };
    for (const t of threads) {
      for (const a of t.activities) {
        const day = dayOfWeekLabel(a.createdAt);
        activityByDay[day] = (activityByDay[day] ?? 0) + 1;
      }
    }
    const dailyActivityData = Object.entries(activityByDay).map(
      ([day, count]) => ({ day, activities: count }),
    );

    // Code impact (from turnDiffSummaries)
    let totalAdditions = 0;
    let totalDeletions = 0;
    let totalFilesTouched = 0;
    const fileHotspots: Record<string, number> = {};
    for (const t of threads) {
      for (const turn of t.turnDiffSummaries) {
        totalFilesTouched += turn.files.length;
        for (const f of turn.files) {
          totalAdditions += f.additions ?? 0;
          totalDeletions += f.deletions ?? 0;
          fileHotspots[f.path] = (fileHotspots[f.path] ?? 0) + 1;
        }
      }
    }
    const topHotspotFiles = Object.entries(fileHotspots)
      .toSorted((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([path, count]) => ({
        file: path.split("/").pop() ?? path,
        fullPath: path,
        touchCount: count,
      }));

    // Error timeline (errors per day)
    const errorsByDay: Record<string, number> = {};
    for (const t of threads) {
      for (const a of t.activities) {
        if (a.tone === "error") {
          const dk = dayKey(a.createdAt);
          errorsByDay[dk] = (errorsByDay[dk] ?? 0) + 1;
        }
      }
    }
    const errorTimeline = Object.entries(errorsByDay)
      .toSorted(([a], [b]) => a.localeCompare(b))
      .map(([day, count]) => ({ day, errors: count }));

    // Thread age distribution (in days)
    const now = Date.now();
    const ageBuckets = [
      { range: "< 1 day", count: 0 },
      { range: "1-7 days", count: 0 },
      { range: "1-4 weeks", count: 0 },
      { range: "1-3 months", count: 0 },
      { range: "3+ months", count: 0 },
    ];
    for (const t of threads) {
      const ageDays = (now - new Date(t.createdAt).getTime()) / 86_400_000;
      if (ageDays < 1) ageBuckets[0]!.count++;
      else if (ageDays < 7) ageBuckets[1]!.count++;
      else if (ageDays < 28) ageBuckets[2]!.count++;
      else if (ageDays < 90) ageBuckets[3]!.count++;
      else ageBuckets[4]!.count++;
    }

    return {
      projectThreadData,
      creationTimeline,
      hourlyActivityData,
      dailyActivityData,
      totalAdditions,
      totalDeletions,
      totalFilesTouched,
      topHotspotFiles,
      errorTimeline,
      ageBuckets: ageBuckets.filter((b) => b.count > 0),
    };
  }, [threads, projects]);
}

// ── Section wrapper ─────────────────────────────────────────────────

function DashboardSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </section>
  );
}

// ── Main dashboard ──────────────────────────────────────────────────

function DashboardView() {
  const threads = useStore((s) => s.threads);
  const projects = useStore((s) => s.projects);

  const productivity = useProductivityMetrics(threads);
  const tokens = useTokenMetrics(threads);
  const health = useProjectHealthMetrics(threads, projects);

  const hasData = threads.length > 0;

  return (
    <SidebarInset className="h-[var(--app-viewport-height)] min-h-0 overflow-hidden overscroll-y-none bg-background text-foreground isolate">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-background text-foreground">
        {isElectron && (
          <div className="drag-region flex h-[52px] shrink-0 items-center border-b border-border px-5">
            <span className="text-xs font-medium tracking-wide text-muted-foreground/70">
              Dashboard
            </span>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-6">
          <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
            <header className="space-y-1">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Dashboard
              </h1>
              <p className="text-sm text-muted-foreground">
                Insights across all your coding agent sessions.
              </p>
            </header>

            {!hasData ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-border bg-card p-12 text-center">
                <p className="text-lg font-medium text-muted-foreground">
                  No data yet
                </p>
                <p className="mt-1 text-sm text-muted-foreground/70">
                  Start some coding sessions to see your dashboard populate.
                </p>
              </div>
            ) : (
              <>
                {/* ── Panel 1: Productivity & Efficiency ─────────────── */}
                <DashboardSection
                  title="Productivity & Efficiency"
                  description="How much work your agents are doing and how they perform."
                >
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <StatCard
                      label="Total Threads"
                      value={productivity.totalThreads}
                    />
                    <StatCard
                      label="Total Turns"
                      value={productivity.totalTurns}
                      sub={`${productivity.avgTurnsPerThread} avg/thread`}
                    />
                    <StatCard
                      label="Total Messages"
                      value={productivity.totalMessages}
                    />
                    <StatCard
                      label="Errors"
                      value={productivity.errorCount}
                      sub={
                        productivity.totalActivities > 0
                          ? `${((productivity.errorCount / productivity.totalActivities) * 100).toFixed(1)}% of activities`
                          : undefined
                      }
                    />
                  </div>

                  <div className="mt-5 grid gap-5 lg:grid-cols-2">
                    {/* Model usage */}
                    {productivity.modelUsageData.length > 0 && (
                      <div>
                        <h3 className="mb-2 text-sm font-medium text-muted-foreground">
                          Model Usage
                        </h3>
                        <div className="h-[220px]">
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie
                                data={productivity.modelUsageData}
                                cx="50%"
                                cy="50%"
                                innerRadius={50}
                                outerRadius={80}
                                paddingAngle={2}
                                dataKey="value"
                                nameKey="name"
                                label={({ name, percent, x, y, textAnchor }) => (
                                  <text x={x} y={y} textAnchor={textAnchor} fill={MUTED_TEXT} fontSize={11}>
                                    {`${name} (${((percent ?? 0) * 100).toFixed(0)}%)`}
                                  </text>
                                )}
                                labelLine={false}
                              >
                                {productivity.modelUsageData.map((entry, i) => (
                                  <Cell
                                    key={entry.name}
                                    fill={chartColor(i)}
                                  />
                                ))}
                              </Pie>
                              <Tooltip content={<ChartTooltip />} />
                            </PieChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    )}

                    {/* Activity breakdown */}
                    {productivity.activityToneData.length > 0 && (
                      <div>
                        <h3 className="mb-2 text-sm font-medium text-muted-foreground">
                          Activity Breakdown
                        </h3>
                        <div className="h-[220px]">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={productivity.activityToneData}>
                              <CartesianGrid
                                strokeDasharray="3 3"
                                stroke="hsl(var(--border))"
                              />
                              <XAxis
                                dataKey="name"
                                tick={{ fill: MUTED_TEXT, fontSize: 11 }}
                              />
                              <YAxis
                                tick={{ fill: MUTED_TEXT, fontSize: 11 }}
                              />
                              <Tooltip content={<ChartTooltip />} />
                              <Bar
                                dataKey="value"
                                name="Count"
                                fill={chartColor(0)}
                                radius={[4, 4, 0, 0]}
                              />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    )}

                    {/* Turn state distribution */}
                    {productivity.turnStateData.length > 0 && (
                      <div>
                        <h3 className="mb-2 text-sm font-medium text-muted-foreground">
                          Latest Turn States
                        </h3>
                        <div className="h-[220px]">
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie
                                data={productivity.turnStateData}
                                cx="50%"
                                cy="50%"
                                innerRadius={50}
                                outerRadius={80}
                                paddingAngle={2}
                                dataKey="value"
                                nameKey="name"
                                label={({ name, value, x, y, textAnchor }) => (
                                  <text x={x} y={y} textAnchor={textAnchor} fill={MUTED_TEXT} fontSize={11}>
                                    {`${name}: ${value}`}
                                  </text>
                                )}
                                labelLine={false}
                              >
                                {productivity.turnStateData.map((entry, i) => (
                                  <Cell
                                    key={entry.name}
                                    fill={chartColor(i)}
                                  />
                                ))}
                              </Pie>
                              <Tooltip content={<ChartTooltip />} />
                            </PieChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    )}

                    {/* Avg turn duration by model */}
                    {productivity.avgDurationByModel.length > 0 && (
                      <div>
                        <h3 className="mb-2 text-sm font-medium text-muted-foreground">
                          Avg Turn Interval by Model
                        </h3>
                        <div className="h-[220px]">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={productivity.avgDurationByModel}>
                              <CartesianGrid
                                strokeDasharray="3 3"
                                stroke="hsl(var(--border))"
                              />
                              <XAxis
                                dataKey="model"
                                tick={{ fill: MUTED_TEXT, fontSize: 10 }}
                              />
                              <YAxis
                                tickFormatter={(v: number) => formatDuration(v)}
                                tick={{ fill: MUTED_TEXT, fontSize: 11 }}
                              />
                              <Tooltip
                                formatter={(value: unknown) => [
                                  formatDuration(Number(value ?? 0)),
                                  "Avg interval",
                                ]}
                              />
                              <Bar
                                dataKey="avgMs"
                                name="Avg interval"
                                fill={chartColor(1)}
                                radius={[4, 4, 0, 0]}
                              />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Top threads by turns */}
                  {productivity.turnsPerThread.length > 0 && (
                    <div className="mt-5">
                      <h3 className="mb-2 text-sm font-medium text-muted-foreground">
                        Most Active Threads (by turns)
                      </h3>
                      <div className="h-[240px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart
                            data={productivity.turnsPerThread}
                            layout="vertical"
                          >
                            <CartesianGrid
                              strokeDasharray="3 3"
                              stroke="hsl(var(--border))"
                            />
                            <XAxis
                              type="number"
                              tick={{ fill: MUTED_TEXT, fontSize: 11 }}
                            />
                            <YAxis
                              dataKey="title"
                              type="category"
                              width={150}
                              tick={{ fill: MUTED_TEXT, fontSize: 10 }}
                            />
                            <Tooltip content={<ChartTooltip />} />
                            <Bar
                              dataKey="turns"
                              name="Turns"
                              fill={chartColor(2)}
                              radius={[0, 4, 4, 0]}
                            />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  )}
                </DashboardSection>

                {/* ── Panel 2: Cost & Token Burn ──────────────────── */}
                <DashboardSection
                  title="Cost & Token Burn"
                  description="Where your tokens are going and how efficiently context is used."
                >
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <StatCard
                      label="Total Tokens"
                      value={formatTokens(tokens.totalInput + tokens.totalOutput)}
                      sub={`${tokens.threadsWithTokens} threads reporting`}
                    />
                    <StatCard
                      label="Input Tokens"
                      value={formatTokens(tokens.totalInput)}
                    />
                    <StatCard
                      label="Output Tokens"
                      value={formatTokens(tokens.totalOutput)}
                      sub={
                        tokens.totalReasoning > 0
                          ? `${formatTokens(tokens.totalReasoning)} reasoning`
                          : undefined
                      }
                    />
                    <StatCard
                      label="Cache Hit Rate"
                      value={tokens.cacheHitRate}
                      sub={`Avg context: ${tokens.avgContextUtil}`}
                    />
                  </div>

                  <div className="mt-5 grid gap-5 lg:grid-cols-2">
                    {/* Token breakdown */}
                    {tokens.tokenBreakdown.length > 0 && (
                      <div>
                        <h3 className="mb-2 text-sm font-medium text-muted-foreground">
                          Token Breakdown
                        </h3>
                        <div className="h-[220px]">
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie
                                data={tokens.tokenBreakdown}
                                cx="50%"
                                cy="50%"
                                innerRadius={50}
                                outerRadius={80}
                                paddingAngle={2}
                                dataKey="value"
                                nameKey="name"
                                label={({ name, percent, x, y, textAnchor }) => (
                                  <text x={x} y={y} textAnchor={textAnchor} fill={MUTED_TEXT} fontSize={11}>
                                    {`${name} (${((percent ?? 0) * 100).toFixed(0)}%)`}
                                  </text>
                                )}
                                labelLine={false}
                              >
                                {tokens.tokenBreakdown.map((entry, i) => (
                                  <Cell
                                    key={entry.name}
                                    fill={chartColor(i)}
                                  />
                                ))}
                              </Pie>
                              <Tooltip
                                formatter={(value: unknown) => [
                                  formatTokens(Number(value ?? 0)),
                                  "Tokens",
                                ]}
                              />
                            </PieChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    )}

                    {/* Context utilization distribution */}
                    {tokens.contextUtilBuckets.length > 0 && (
                      <div>
                        <h3 className="mb-2 text-sm font-medium text-muted-foreground">
                          Context Window Utilization
                        </h3>
                        <div className="h-[220px]">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={tokens.contextUtilBuckets}>
                              <CartesianGrid
                                strokeDasharray="3 3"
                                stroke="hsl(var(--border))"
                              />
                              <XAxis
                                dataKey="range"
                                tick={{ fill: MUTED_TEXT, fontSize: 11 }}
                              />
                              <YAxis
                                tick={{ fill: MUTED_TEXT, fontSize: 11 }}
                              />
                              <Tooltip content={<ChartTooltip />} />
                              <Bar
                                dataKey="count"
                                name="Threads"
                                fill={chartColor(3)}
                                radius={[4, 4, 0, 0]}
                              />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Per-model token usage */}
                  {tokens.modelTokenData.length > 0 && (
                    <div className="mt-5">
                      <h3 className="mb-2 text-sm font-medium text-muted-foreground">
                        Token Usage by Model
                      </h3>
                      <div className="h-[220px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={tokens.modelTokenData}>
                            <CartesianGrid
                              strokeDasharray="3 3"
                              stroke="hsl(var(--border))"
                            />
                            <XAxis
                              dataKey="model"
                              tick={{ fill: MUTED_TEXT, fontSize: 10 }}
                            />
                            <YAxis
                              tickFormatter={(v: number) => formatTokens(v)}
                              tick={{ fill: MUTED_TEXT, fontSize: 11 }}
                            />
                            <Tooltip
                              formatter={(value: unknown) => [
                                formatTokens(Number(value ?? 0)),
                                "",
                              ]}
                            />
                            <Legend wrapperStyle={{ color: MUTED_TEXT }} />
                            <Bar
                              dataKey="input"
                              name="Input"
                              stackId="tokens"
                              fill={chartColor(0)}
                            />
                            <Bar
                              dataKey="output"
                              name="Output"
                              stackId="tokens"
                              fill={chartColor(1)}
                            />
                            <Bar
                              dataKey="cached"
                              name="Cached"
                              stackId="tokens2"
                              fill={chartColor(2)}
                            />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  )}

                  {/* Top token-consuming threads */}
                  {tokens.topTokenThreads.length > 0 && (
                    <div className="mt-5">
                      <h3 className="mb-2 text-sm font-medium text-muted-foreground">
                        Highest Token-Consuming Threads
                      </h3>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-border text-left text-muted-foreground">
                              <th className="pb-2 pr-4 font-medium">Thread</th>
                              <th className="pb-2 pr-4 font-medium text-right">
                                Input
                              </th>
                              <th className="pb-2 pr-4 font-medium text-right">
                                Output
                              </th>
                              <th className="pb-2 pr-4 font-medium text-right">
                                Cached
                              </th>
                              <th className="pb-2 font-medium text-right">
                                Context %
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {tokens.topTokenThreads.map((t) => (
                              <tr
                                key={`${t.title}:${t.model}`}
                                className="border-b border-border/50"
                              >
                                <td className="py-1.5 pr-4 text-foreground">
                                  {t.title}
                                </td>
                                <td className="py-1.5 pr-4 text-right tabular-nums">
                                  {formatTokens(t.input)}
                                </td>
                                <td className="py-1.5 pr-4 text-right tabular-nums">
                                  {formatTokens(t.output)}
                                </td>
                                <td className="py-1.5 pr-4 text-right tabular-nums">
                                  {formatTokens(t.cached)}
                                </td>
                                <td className="py-1.5 text-right tabular-nums">
                                  {t.usedPercent}%
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </DashboardSection>

                {/* ── Panel 6: Project Health Overview ────────────── */}
                <DashboardSection
                  title="Project Health Overview"
                  description="Activity patterns, code impact, and project-level insights."
                >
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <StatCard
                      label="Projects"
                      value={projects.length}
                    />
                    <StatCard
                      label="Lines Added"
                      value={health.totalAdditions.toLocaleString()}
                      sub={`${health.totalDeletions.toLocaleString()} deleted`}
                    />
                    <StatCard
                      label="Files Touched"
                      value={health.totalFilesTouched.toLocaleString()}
                    />
                    <StatCard
                      label="Net Delta"
                      value={
                        (health.totalAdditions - health.totalDeletions >= 0
                          ? "+"
                          : "") +
                        (
                          health.totalAdditions - health.totalDeletions
                        ).toLocaleString()
                      }
                      sub="lines"
                    />
                  </div>

                  <div className="mt-5 grid gap-5 lg:grid-cols-2">
                    {/* Threads per project */}
                    {health.projectThreadData.length > 0 && (
                      <div>
                        <h3 className="mb-2 text-sm font-medium text-muted-foreground">
                          Threads per Project
                        </h3>
                        <div className="h-[220px]">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={health.projectThreadData}>
                              <CartesianGrid
                                strokeDasharray="3 3"
                                stroke="hsl(var(--border))"
                              />
                              <XAxis
                                dataKey="name"
                                tick={{ fill: MUTED_TEXT, fontSize: 10 }}
                              />
                              <YAxis
                                tick={{ fill: MUTED_TEXT, fontSize: 11 }}
                              />
                              <Tooltip content={<ChartTooltip />} />
                              <Legend wrapperStyle={{ color: MUTED_TEXT }} />
                              <Bar
                                dataKey="total"
                                name="Total"
                                fill={chartColor(0)}
                                radius={[4, 4, 0, 0]}
                              />
                              <Bar
                                dataKey="active"
                                name="Active"
                                fill={chartColor(2)}
                                radius={[4, 4, 0, 0]}
                              />
                              <Bar
                                dataKey="errored"
                                name="Errored"
                                fill={chartColor(4)}
                                radius={[4, 4, 0, 0]}
                              />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    )}

                    {/* Thread age distribution */}
                    {health.ageBuckets.length > 0 && (
                      <div>
                        <h3 className="mb-2 text-sm font-medium text-muted-foreground">
                          Thread Age Distribution
                        </h3>
                        <div className="h-[220px]">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={health.ageBuckets}>
                              <CartesianGrid
                                strokeDasharray="3 3"
                                stroke="hsl(var(--border))"
                              />
                              <XAxis
                                dataKey="range"
                                tick={{ fill: MUTED_TEXT, fontSize: 11 }}
                              />
                              <YAxis
                                tick={{ fill: MUTED_TEXT, fontSize: 11 }}
                              />
                              <Tooltip content={<ChartTooltip />} />
                              <Bar
                                dataKey="count"
                                name="Threads"
                                fill={chartColor(5)}
                                radius={[4, 4, 0, 0]}
                              />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    )}

                    {/* Activity by hour of day */}
                    <div>
                      <h3 className="mb-2 text-sm font-medium text-muted-foreground">
                        Activity by Hour of Day
                      </h3>
                      <div className="h-[220px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={health.hourlyActivityData}>
                            <CartesianGrid
                              strokeDasharray="3 3"
                              stroke="hsl(var(--border))"
                            />
                            <XAxis
                              dataKey="hour"
                              tick={{ fill: MUTED_TEXT, fontSize: 10 }}
                              interval={2}
                            />
                            <YAxis
                              tick={{ fill: MUTED_TEXT, fontSize: 11 }}
                            />
                            <Tooltip content={<ChartTooltip />} />
                            <Area
                              type="monotone"
                              dataKey="activities"
                              name="Activities"
                              stroke={chartColor(0)}
                              fill={chartColor(0)}
                              fillOpacity={0.2}
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    {/* Activity by day of week */}
                    <div>
                      <h3 className="mb-2 text-sm font-medium text-muted-foreground">
                        Activity by Day of Week
                      </h3>
                      <div className="h-[220px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={health.dailyActivityData}>
                            <CartesianGrid
                              strokeDasharray="3 3"
                              stroke="hsl(var(--border))"
                            />
                            <XAxis
                              dataKey="day"
                              tick={{ fill: MUTED_TEXT, fontSize: 11 }}
                            />
                            <YAxis
                              tick={{ fill: MUTED_TEXT, fontSize: 11 }}
                            />
                            <Tooltip content={<ChartTooltip />} />
                            <Bar
                              dataKey="activities"
                              name="Activities"
                              fill={chartColor(1)}
                              radius={[4, 4, 0, 0]}
                            />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>

                  {/* Thread creation timeline */}
                  {health.creationTimeline.length > 1 && (
                    <div className="mt-5">
                      <h3 className="mb-2 text-sm font-medium text-muted-foreground">
                        Thread Creation Over Time (weekly)
                      </h3>
                      <div className="h-[200px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={health.creationTimeline}>
                            <CartesianGrid
                              strokeDasharray="3 3"
                              stroke="hsl(var(--border))"
                            />
                            <XAxis
                              dataKey="week"
                              tick={{ fill: MUTED_TEXT, fontSize: 10 }}
                            />
                            <YAxis
                              tick={{ fill: MUTED_TEXT, fontSize: 11 }}
                            />
                            <Tooltip content={<ChartTooltip />} />
                            <Area
                              type="monotone"
                              dataKey="threads"
                              name="Threads Created"
                              stroke={chartColor(2)}
                              fill={chartColor(2)}
                              fillOpacity={0.2}
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  )}

                  {/* Error timeline */}
                  {health.errorTimeline.length > 0 && (
                    <div className="mt-5">
                      <h3 className="mb-2 text-sm font-medium text-muted-foreground">
                        Errors Over Time
                      </h3>
                      <div className="h-[180px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={health.errorTimeline}>
                            <CartesianGrid
                              strokeDasharray="3 3"
                              stroke="hsl(var(--border))"
                            />
                            <XAxis
                              dataKey="day"
                              tick={{ fill: MUTED_TEXT, fontSize: 10 }}
                            />
                            <YAxis
                              tick={{ fill: MUTED_TEXT, fontSize: 11 }}
                            />
                            <Tooltip content={<ChartTooltip />} />
                            <Bar
                              dataKey="errors"
                              name="Errors"
                              fill={chartColor(4)}
                              radius={[4, 4, 0, 0]}
                            />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  )}

                  {/* File hotspots */}
                  {health.topHotspotFiles.length > 0 && (
                    <div className="mt-5">
                      <h3 className="mb-2 text-sm font-medium text-muted-foreground">
                        Most Frequently Modified Files
                      </h3>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-border text-left text-muted-foreground">
                              <th className="pb-2 pr-4 font-medium">File</th>
                              <th className="pb-2 font-medium text-right">
                                Times Modified
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {health.topHotspotFiles.map((f) => (
                              <tr
                                key={f.fullPath}
                                className="border-b border-border/50"
                              >
                                <td
                                  className="py-1.5 pr-4 text-foreground"
                                  title={f.fullPath}
                                >
                                  <span className="text-muted-foreground/50">
                                    {f.fullPath.includes("/")
                                      ? f.fullPath.slice(
                                          0,
                                          f.fullPath.lastIndexOf("/") + 1,
                                        )
                                      : ""}
                                  </span>
                                  {f.file}
                                </td>
                                <td className="py-1.5 text-right tabular-nums">
                                  {f.touchCount}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </DashboardSection>
              </>
            )}
          </div>
        </div>
      </div>
    </SidebarInset>
  );
}

export const Route = createFileRoute("/_chat/dashboard")({
  component: DashboardView,
});
