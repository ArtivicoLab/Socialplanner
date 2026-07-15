// Performance Tracker — per-platform monthly followers / engagement / reach,
// charted over the trailing 12 months against the platform's goals.
import { useMemo, useState } from "react";
import { LineChart } from "../../components/Charts";
import { ProgressRing } from "../../components/ProgressRing";
import { BottomSheet } from "../../components/BottomSheet";
import { Chip, ChipRow } from "../../components/Chip";
import { Segmented } from "../../components/Segmented";
import { EmptyState } from "../../components/EmptyState";
import { HelpTip } from "../../components/HelpTip";
import { IconPlus, IconTrend, IconTrash } from "../../components/icons";
import { usePerformance, usePlatforms } from "../../stores/v2";
import type { PerfEntry, Platform } from "../../lib/types";
import { compact, pct } from "../../lib/ui";
import { addMonthsISO, format, fromISO, todayISO } from "../../lib/dates";
import "../../styles/features/performance.css";

type Metric = "followers" | "engagement" | "reach";

const METRIC_OPTIONS = [
  { value: "followers", label: "Followers" },
  { value: "engagement", label: "Engagement" },
  { value: "reach", label: "Reach" },
] as const;

const METRIC_LABEL: Record<Metric, string> = {
  followers: "Followers",
  engagement: "Engagement rate",
  reach: "Reach",
};

const METRIC_COLOR: Record<Metric, string> = {
  followers: "var(--accent)",
  engagement: "var(--cat-teal)",
  reach: "var(--cat-lavender)",
};

/** "yyyy-MM" for the month `n` months before the current one. */
function monthKey(offset: number): string {
  return addMonthsISO(todayISO().slice(0, 7) + "-01", offset).slice(0, 7);
}

function monthShort(key: string): string {
  return format(fromISO(key + "-01"), "MMM");
}

function monthLong(key: string): string {
  return format(fromISO(key + "-01"), "MMMM yyyy");
}

function fmtMetric(metric: Metric, v: number): string {
  return metric === "engagement" ? `${v % 1 === 0 ? v : v.toFixed(1)}%` : compact(v);
}

/** Signed month-over-month delta label, e.g. "+1.2K" / "-0.4%". */
function deltaLabel(metric: Metric, delta: number): string {
  const sign = delta > 0 ? "+" : delta < 0 ? "-" : "±";
  return `${sign}${fmtMetric(metric, Math.abs(delta))}`;
}

export function PerformanceScreen() {
  const platforms = usePlatforms((s) => s.items);
  const entries = usePerformance((s) => s.items);
  const addEntry = usePerformance((s) => s.add);
  const updateEntry = usePerformance((s) => s.update);
  const removeEntry = usePerformance((s) => s.remove);
  const updatePlatform = usePlatforms((s) => s.update);

  const active = useMemo(
    () => [...platforms].filter((p) => p.active).sort((a, b) => a.order - b.order),
    [platforms]
  );

  const [platformId, setPlatformId] = useState<string>("");
  const [metric, setMetric] = useState<Metric>("followers");
  const [editMonth, setEditMonth] = useState<string | null>(null); // "yyyy-MM" being edited

  const platform = active.find((p) => p.id === platformId) ?? active[0];

  // This platform's log, newest first, plus a by-month lookup.
  const platformEntries = useMemo(() => {
    if (!platform) return [];
    return entries
      .filter((e) => e.platform === platform.name)
      .sort((a, b) => b.month.localeCompare(a.month));
  }, [entries, platform]);

  const byMonth = useMemo(
    () => new Map(platformEntries.map((e) => [e.month, e])),
    [platformEntries]
  );

  // Trailing 12 months, oldest → newest.
  const months = useMemo(() => Array.from({ length: 12 }, (_, i) => monthKey(i - 11)), []);

  if (active.length === 0) {
    return (
      <>
        <Head />
        <EmptyState
          icon={<IconTrend size={28} />}
          title="No active platforms"
          sub="Turn on at least one platform in Settings to start tracking its monthly numbers."
        />
      </>
    );
  }

  const hasEntries = platformEntries.length > 0;
  const latest = platformEntries[0];
  const previous = latest
    ? platformEntries.find((e) => e.month < latest.month)
    : undefined;

  const chartPoints = months.map((m) => byMonth.get(m)?.[metric] ?? 0);

  function saveMonth(month: string, values: { followers: number; engagement: number; reach: number }) {
    if (!platform) return;
    const existing = byMonth.get(month);
    if (existing) updateEntry(existing.id, values);
    else addEntry({ platform: platform.name, month, ...values });
    setEditMonth(null);
  }

  return (
    <>
      <Head />

      {/* Platform picker */}
      <div data-tour="perf-platform">
        <ChipRow>
          {active.map((p) => (
            <Chip
              key={p.id}
              active={platform?.id === p.id}
              onClick={() => setPlatformId(p.id)}
            >
              {p.name}
            </Chip>
          ))}
        </ChipRow>
      </div>

      {platform && (
        <>
          {/* Charts card */}
          <div className="card" data-tour="perf-charts">
            <div className="spread perf-chart-head">
              <div className="perf-chart-title">{platform.name} · last 12 months</div>
            </div>
            <Segmented
              options={METRIC_OPTIONS}
              value={metric}
              onChange={(v) => setMetric(v as Metric)}
            />
            <div className="perf-chart-body">
              {hasEntries ? (
                <LineChart
                  series={[
                    {
                      label: METRIC_LABEL[metric],
                      color: METRIC_COLOR[metric],
                      points: chartPoints,
                    },
                  ]}
                  xLabels={months.map(monthShort)}
                  height={180}
                  formatValue={(n) => fmtMetric(metric, n)}
                />
              ) : (
                <EmptyState
                  icon={<IconTrend size={28} />}
                  title="Log your first month"
                  sub={`No numbers for ${platform.name} yet. Add this month's followers, engagement, and reach to start the trend line.`}
                >
                  <button className="btn btn--primary btn--auto" onClick={() => setEditMonth(monthKey(0))}>
                    <IconPlus size={16} />
                    Log this month
                  </button>
                </EmptyState>
              )}
            </div>
          </div>

          {hasEntries && (
            <>
              {/* YTD summary vs goals */}
              <div className="section-title">
                Where you stand
                <HelpTip text="Your latest logged month for each metric, measured against this platform's goal, plus how much it moved since the month before." />
              </div>
              <div className="card">
                <div className="perf-ytd">
                  {(["followers", "engagement", "reach"] as Metric[]).map((m) => {
                    const current = latest?.[m] ?? 0;
                    const goal =
                      m === "followers" ? platform.followersGoal
                      : m === "engagement" ? platform.engagementGoal
                      : platform.reachGoal;
                    const delta = previous ? current - previous[m] : 0;
                    return (
                      <div key={m} className="perf-ytd__cell">
                        <ProgressRing
                          value={goal > 0 ? current / goal : 0}
                          dotted={goal <= 0}
                          size={72}
                          stroke={8}
                          color={METRIC_COLOR[m]}
                          ariaLabel={
                            goal > 0
                              ? `${METRIC_LABEL[m]}: ${fmtMetric(m, current)} of ${fmtMetric(m, goal)} goal (${pct(current, goal)}%)`
                              : `${METRIC_LABEL[m]}: ${fmtMetric(m, current)}, no goal set`
                          }
                          center={
                            <span className="perf-ytd__ringval">
                              {goal > 0 ? `${pct(current, goal)}%` : "N/A"}
                            </span>
                          }
                        />
                        <div className="perf-ytd__metric">{METRIC_LABEL[m]}</div>
                        <div className="perf-ytd__value">{fmtMetric(m, current)}</div>
                        <div className="muted perf-ytd__goal">
                          {goal > 0 ? `Goal ${fmtMetric(m, goal)}` : "No goal set"}
                        </div>
                        {previous && (
                          <div
                            className={`perf-ytd__delta${
                              delta > 0 ? " perf-ytd__delta--up" : delta < 0 ? " perf-ytd__delta--down" : ""
                            }`}
                          >
                            {deltaLabel(m, delta)} vs {monthShort(previous.month)}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Monthly table */}
              <div className="section-title">
                Monthly log
                <HelpTip text="One row per month. Tap any row to edit that month's numbers, or use Log this month to add the current one." />
              </div>
              <div className="card card--tight">
                {months
                  .slice()
                  .reverse()
                  .map((m) => {
                    const e = byMonth.get(m);
                    return (
                      <button
                        key={m}
                        className="perf-month-row"
                        onClick={() => setEditMonth(m)}
                        aria-label={`Edit ${monthLong(m)}`}
                      >
                        <span className="perf-month-row__label">{monthLong(m)}</span>
                        {e ? (
                          <span className="perf-month-row__vals">
                            <span>{compact(e.followers)}</span>
                            <span>{fmtMetric("engagement", e.engagement)}</span>
                            <span>{compact(e.reach)}</span>
                          </span>
                        ) : (
                          <span className="muted perf-month-row__empty">Not logged</span>
                        )}
                      </button>
                    );
                  })}
                <div className="perf-table-foot">
                  <span className="muted perf-table-legend">Followers · Engagement · Reach</span>
                  <button className="btn btn--primary btn--auto" onClick={() => setEditMonth(monthKey(0))}>
                    <IconPlus size={16} />
                    Log this month
                  </button>
                </div>
              </div>
            </>
          )}

          {/* Goals editor */}
          <div className="section-title">
            Monthly goals
            <HelpTip text="The targets the rings above measure against. Set any of them to 0 to track that metric without a goal." />
          </div>
          <div className="card">
            <div className="perf-goals">
              <GoalField
                id="perf-goal-followers"
                label="Followers"
                value={platform.followersGoal}
                onSave={(n) => updatePlatform(platform.id, { followersGoal: n })}
              />
              <GoalField
                id="perf-goal-engagement"
                label="Engagement %"
                step="0.1"
                value={platform.engagementGoal}
                onSave={(n) => updatePlatform(platform.id, { engagementGoal: n })}
              />
              <GoalField
                id="perf-goal-reach"
                label="Reach"
                value={platform.reachGoal}
                onSave={(n) => updatePlatform(platform.id, { reachGoal: n })}
              />
            </div>
          </div>

          <MonthSheet
            key={`${platform.id}-${editMonth ?? "closed"}`}
            month={editMonth}
            platform={platform}
            entry={editMonth ? byMonth.get(editMonth) : undefined}
            onSave={saveMonth}
            onDelete={(e) => {
              removeEntry(e.id);
              setEditMonth(null);
            }}
            onClose={() => setEditMonth(null)}
          />
        </>
      )}
    </>
  );
}

function Head() {
  return (
    <div className="screen-head">
      <div className="screen-head__eyebrow">Know what's working</div>
      <h1 className="screen-head__title">
        Performance
        <HelpTip text="Log each platform's followers, engagement rate, and reach once a month, and watch the trend against your goals." />
      </h1>
    </div>
  );
}

function GoalField({
  id,
  label,
  value,
  step,
  onSave,
}: {
  id: string;
  label: string;
  value: number;
  step?: string;
  onSave: (n: number) => void;
}) {
  return (
    <div className="field field--flush perf-goal-field">
      <label className="field__label" htmlFor={id}>{label}</label>
      <input
        id={id}
        className="input"
        type="number"
        min={0}
        step={step ?? "1"}
        inputMode="decimal"
        defaultValue={value || ""}
        placeholder="0"
        key={`${id}-${value}`}
        onBlur={(e) => {
          const n = Math.max(0, Number(e.target.value) || 0);
          if (n !== value) onSave(n);
        }}
        onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
      />
    </div>
  );
}

function MonthSheet({
  month,
  platform,
  entry,
  onSave,
  onDelete,
  onClose,
}: {
  month: string | null;
  platform: Platform;
  entry?: PerfEntry;
  onSave: (month: string, values: { followers: number; engagement: number; reach: number }) => void;
  onDelete: (entry: PerfEntry) => void;
  onClose: () => void;
}) {
  // The parent re-keys this component per platform+month, so initializing from
  // `entry` here always reflects the month being edited (or blanks for a new one).
  const [followers, setFollowers] = useState(entry ? String(entry.followers) : "");
  const [engagement, setEngagement] = useState(entry ? String(entry.engagement) : "");
  const [reach, setReach] = useState(entry ? String(entry.reach) : "");

  if (!month) return null;

  const num = (s: string) => Math.max(0, Number(s) || 0);

  return (
    <BottomSheet
      open
      title={`${platform.name} · ${monthLong(month)}`}
      onClose={onClose}
    >
      <div className="field">
        <label className="field__label" htmlFor="perf-edit-followers">Followers</label>
        <input
          id="perf-edit-followers"
          className="input"
          type="number"
          min={0}
          inputMode="numeric"
          value={followers}
          placeholder="0"
          onChange={(e) => setFollowers(e.target.value)}
          autoFocus
        />
      </div>
      <div className="field">
        <label className="field__label" htmlFor="perf-edit-engagement">Engagement rate %</label>
        <input
          id="perf-edit-engagement"
          className="input"
          type="number"
          min={0}
          step="0.1"
          inputMode="decimal"
          value={engagement}
          placeholder="0"
          onChange={(e) => setEngagement(e.target.value)}
        />
      </div>
      <div className="field">
        <label className="field__label" htmlFor="perf-edit-reach">Reach</label>
        <input
          id="perf-edit-reach"
          className="input"
          type="number"
          min={0}
          inputMode="numeric"
          value={reach}
          placeholder="0"
          onChange={(e) => setReach(e.target.value)}
        />
      </div>
      <button
        className="btn btn--primary btn--stack"
        onClick={() =>
          onSave(month, {
            followers: num(followers),
            engagement: num(engagement),
            reach: num(reach),
          })
        }
      >
        {entry ? "Save changes" : "Log this month"}
      </button>
      {entry && (
        <button className="btn btn--ghost" onClick={() => onDelete(entry)}>
          <IconTrash size={16} />
          Delete this month's numbers
        </button>
      )}
    </BottomSheet>
  );
}
