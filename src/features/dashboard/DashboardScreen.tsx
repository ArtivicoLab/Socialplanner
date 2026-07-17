// Dashboard — the creator's command center: a gradient cover hero with the
// next posts' images and frosted stats, today's queue with photo thumbnails,
// a feed peek, content mix, publishing progress, and performance with
// month-over-month growth. Dashboard-first: must look great at 390px AND in
// the ≥900px sidebar layout (bento columns).
import { useMemo } from "react";
import { ProgressRing } from "../../components/ProgressRing";
import { Donut, Bars } from "../../components/Charts";
import { EmptyState } from "../../components/EmptyState";
import { PostPhoto } from "../../components/PostPhoto";
import {
  IconTasks,
  IconCalendar,
  IconFeed,
  IconIdea,
  IconTrend,
  IconCamera,
  IconStar,
  IconChevron,
} from "../../components/icons";
import { usePosts, usePlatforms, usePerformance, useIdeas, useHighlights } from "../../stores/v2";
import { planStats, countByPillar, countByPlatform, feedPosts } from "../../lib/postStats";
import {
  categoryColor,
  POST_STATUS_LABEL,
  POST_STATUS_COLOR,
  POST_FORMAT_LABEL,
  compact,
} from "../../lib/ui";
import { todayISO, dueLabel, format, fromISO, addDaysISO } from "../../lib/dates";
import { navigate, type Route } from "../../router";
import type { Post } from "../../lib/types";
import { openPostEditor } from "../../stores/usePostEditor";
import { DashboardHero } from "./DashboardHero";
import "../../styles/features/dashboard.css";

const QUICK_LINKS: { route: Route; label: string; color: string; Icon: typeof IconTasks }[] = [
  { route: "scheduler", label: "Scheduler", color: "var(--cat-pink)", Icon: IconTasks },
  { route: "calendar", label: "Calendar", color: "var(--cat-lavender)", Icon: IconCalendar },
  { route: "feed", label: "Feed Preview", color: "var(--cat-butter)", Icon: IconFeed },
  { route: "ideas", label: "Idea Bank", color: "var(--cat-pink)", Icon: IconIdea },
];

function byTime(a: Post, b: Post): number {
  const ta = a.time || "99:99";
  const tb = b.time || "99:99";
  return ta < tb ? -1 : ta > tb ? 1 : 0;
}

/** "14:30" -> "2:30 PM" (empty time -> "anytime"). */
function timeLabel(t: string): string {
  if (!t) return "anytime";
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${ampm}`;
}

export function DashboardScreen() {
  const { items: posts } = usePosts();
  const { items: platforms } = usePlatforms();
  const { items: perf } = usePerformance();
  const { items: ideas } = useIdeas();
  const { items: highlights } = useHighlights();
  const today = todayISO();

  const stats = useMemo(() => planStats(posts, today), [posts, today]);
  const pillarMix = useMemo(() => countByPillar(posts), [posts]);
  const platformMix = useMemo(() => countByPlatform(posts), [posts]);

  // ---------- today + up next (for the hero image stack) ----------
  const todaysPosts = posts.filter((p) => p.date === today).sort(byTime);
  const upNext = useMemo(
    () =>
      posts
        .filter((p) => p.date >= today && p.status !== "published")
        .sort((a, b) => (a.date === b.date ? byTime(a, b) : a.date < b.date ? -1 : 1)),
    [posts, today]
  );
  const upcomingHighlights = highlights
    .filter((h) => h.date >= today)
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .slice(0, 3);

  // ---------- feed peek: the freshest grid across all platforms ----------
  const firstPlatform = platforms.filter((p) => p.active).sort((a, b) => a.order - b.order)[0];
  const peek = useMemo(
    () => (firstPlatform ? feedPosts(posts, firstPlatform.name, addDaysISO(today, 7)).slice(0, 6) : []),
    [posts, firstPlatform, today]
  );

  // ---------- publishing progress (this month) ----------
  const monthPrefix = today.slice(0, 7);
  const monthPosts = posts.filter((p) => p.date.startsWith(monthPrefix));
  const monthPublished = monthPosts.filter((p) => p.status === "published").length;
  const monthPct = monthPosts.length ? monthPublished / monthPosts.length : 0;
  const monthName = format(fromISO(today), "MMMM");

  // ---------- performance: latest month + growth vs the month before ----------
  const latestMonth = perf.reduce((a, e) => (e.month > a ? e.month : a), "");
  const activePlatforms = platforms
    .filter((p) => p.active)
    .sort((a, b) => a.order - b.order);
  const perfRows = latestMonth
    ? activePlatforms
        .map((p) => {
          const entry = perf.find((e) => e.month === latestMonth && e.platform === p.name);
          const prevMonths = perf
            .filter((e) => e.platform === p.name && e.month < latestMonth)
            .sort((a, b) => (a.month > b.month ? -1 : 1));
          const prev = prevMonths[0];
          const delta =
            entry && prev && prev.followers > 0
              ? ((entry.followers - prev.followers) / prev.followers) * 100
              : null;
          return { name: p.name, entry, delta };
        })
        .filter((r) => r.entry)
    : [];

  const freshIdeas = ideas.filter((i) => !i.used).length;

  const heroChips = [
    stats.scheduledToday > 0
      ? `${stats.scheduledToday} post${stats.scheduledToday > 1 ? "s" : ""} to publish today`
      : "Nothing due today",
    freshIdeas > 0 ? `${freshIdeas} idea${freshIdeas > 1 ? "s" : ""} in the bank` : null,
    upcomingHighlights[0]
      ? `${upcomingHighlights[0].label} ${dueLabel(upcomingHighlights[0].date).toLowerCase()}`
      : null,
  ].filter(Boolean) as string[];

  // ---------- brand-new user: no posts at all ----------
  if (posts.length === 0) {
    return (
      <>
        <DashboardHero chips={["Your studio is ready"]} />
        <div className="card">
          <EmptyState
            icon={<IconCamera size={30} />}
            title="Your content plan starts here"
            sub="Schedule your first post and the dashboard fills up with your plan, content mix, and progress."
          >
            <button className="btn btn--primary btn--auto" onClick={() => navigate("scheduler")}>
              Plan your first post
            </button>
          </EmptyState>
        </div>
        <div className="dash-quick mt-4">
          {QUICK_LINKS.map(({ route, label, color, Icon }) => (
            <button key={route} className="dash-quick__btn" onClick={() => navigate(route)}>
              <span className="dash-quick__ico dash-quick__ico--brand" style={{ background: color }}>
                <Icon size={18} />
              </span>
              {label}
            </button>
          ))}
        </div>
      </>
    );
  }

  return (
    <>
      <DashboardHero chips={heroChips} stats={stats} upNext={upNext} />

      <div className="bento">
        {/* ============ COLUMN 1 — Today ============ */}
        <div className="bento__col">
          <div className="card dash-today" data-tour="dash-today">
            <div className="dash-today__head">
              <span className="dash-today__title">Today</span>
              <span className="dash-today__count">
                {todaysPosts.length > 0 && (
                  <>
                    {todaysPosts.length} post{todaysPosts.length > 1 ? "s" : ""}
                    {/* Only spell out the split once it's not just "all of today's
                        posts" — avoids "2 posts · 2 to publish" repeating itself
                        when nothing's published yet (the common case). */}
                    {stats.scheduledToday > 0 && stats.scheduledToday < todaysPosts.length &&
                      ` · ${stats.scheduledToday} to publish`}
                    {stats.scheduledToday === 0 && " · all published"}
                  </>
                )}
              </span>
            </div>
            {todaysPosts.length === 0 ? (
              <p className="muted dash-today-clear">
                Nothing due today. Your feed is ahead of schedule.
              </p>
            ) : (
              <div>
                {todaysPosts.map((p) => (
                  <button
                    key={p.id}
                    className="dash-postrow"
                    onClick={() => openPostEditor(p)}
                  >
                    <span
                      className="dash-postrow__thumb"
                      style={{ background: p.cover || categoryColor(p.pillar) }}
                    >
                      <PostPhoto postId={p.id} fallbackUrl={p.image} alt="" />
                    </span>
                    <span className="dash-postrow__body">
                      <span className="dash-postrow__idea">
                        {p.idea || POST_FORMAT_LABEL[p.format]}
                      </span>
                      <span className="dash-postrow__meta">
                        <span className="dash-postrow__time">{timeLabel(p.time)}</span>
                        <span
                          className="dash-status"
                          style={{
                            color: POST_STATUS_COLOR[p.status],
                            background: `color-mix(in srgb, ${POST_STATUS_COLOR[p.status]} 13%, transparent)`,
                          }}
                        >
                          {POST_STATUS_LABEL[p.status]}
                        </span>
                        {p.platforms.length > 0 && (
                          <span className="dash-postrow__platforms">
                            {p.platforms.join(" · ")}
                          </span>
                        )}
                      </span>
                    </span>
                    <IconChevron size={15} className="dash-postrow__chev" />
                  </button>
                ))}
              </div>
            )}

            {upcomingHighlights.length > 0 && (
              <div className="dash-today__hl">
                <div className="muted eyebrow-12 mb-2">HIGHLIGHT DATES</div>
                {upcomingHighlights.map((h) => (
                  <div key={h.id} className="dash-highlight">
                    <span className="dash-highlight__label">
                      <IconStar size={14} className="dash-highlight__ico" />
                      {h.label || "Highlight"}
                    </span>
                    <span className="muted">{dueLabel(h.date)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Quick links */}
          <div className="dash-quick" data-tour="dash-quick">
            {QUICK_LINKS.map(({ route, label, color, Icon }) => (
              <button key={route} className="dash-quick__btn" onClick={() => navigate(route)}>
                <span className="dash-quick__ico dash-quick__ico--brand" style={{ background: color }}>
                  <Icon size={18} />
                </span>
                <span className="dash-quick__txt">
                  {label}
                  {route === "ideas" && freshIdeas > 0 && (
                    <span className="dash-quick__sub">{freshIdeas} fresh</span>
                  )}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* ============ COLUMN 2 — The feed + content mix ============ */}
        <div className="bento__col">
          {peek.length > 0 && (
            <div className="card dash-peek" data-tour="dash-peek">
              <div className="spread mb-2">
                <div className="section-title section-title--flush">This week's feed</div>
                {firstPlatform && <span className="muted fs-12">{firstPlatform.name}</span>}
              </div>
              <div className="dash-peek__grid">
                {peek.map((p) => (
                  <button
                    key={p.id}
                    className="dash-peek__tile"
                    style={{ background: p.cover || categoryColor(p.pillar) }}
                    aria-label={p.idea || "Post"}
                    onClick={() => openPostEditor(p)}
                  >
                    <PostPhoto postId={p.id} fallbackUrl={p.image} alt="" />
                    {p.status !== "published" && <span className="dash-peek__dot" aria-hidden />}
                  </button>
                ))}
              </div>
              <button className="dash-more-link" onClick={() => navigate("feed")}>
                <IconFeed size={13} className="dash-more-link__ico" />
                Open the full feed preview
              </button>
            </div>
          )}

          <div className="card" data-tour="dash-pillars">
            <div className="section-title section-title--compact">Content mix</div>
            <Donut
              slices={pillarMix.map((m) => ({
                label: m.label,
                value: m.value,
                color: categoryColor(m.label),
              }))}
              size={128}
              center={
                <span className="text-center">
                  <span className="dash-donut-num">{stats.total}</span>
                  <span className="dash-donut-sub">posts</span>
                </span>
              }
              formatValue={(n) => `${Math.round(n)} post${Math.round(n) === 1 ? "" : "s"}`}
            />
          </div>
        </div>

        {/* ============ COLUMN 3 — Progress & performance ============ */}
        <div className="bento__col">
          <div className="card" data-tour="dash-progress">
            <div className="section-title section-title--compact section-title--success">
              Publishing progress
            </div>
            <div className="dash-pubring">
              <ProgressRing
                value={monthPct}
                size={84}
                stroke={10}
                color="var(--success)"
                dotted={monthPosts.length === 0}
                ariaLabel={`${monthPublished} of ${monthPosts.length} posts published in ${monthName}`}
                center={
                  monthPosts.length > 0 ? (
                    <span className="dash-ring-label">{Math.round(monthPct * 100)}%</span>
                  ) : (
                    <span className="dash-ring-label--empty">Fresh</span>
                  )
                }
              />
              <div>
                <div className="txt-strong">
                  {monthPublished} of {monthPosts.length} posts published
                </div>
                <div className="muted fs-13">in {monthName}</div>
              </div>
            </div>
          </div>

          <div className="card" data-tour="dash-performance">
            <div className="spread mb-2">
              <div className="section-title section-title--flush">Performance</div>
              {latestMonth && (
                <span className="muted fs-12">
                  {format(fromISO(`${latestMonth}-01`), "MMM yyyy")}
                </span>
              )}
            </div>
            {perfRows.length === 0 ? (
              <button className="btn btn--ghost" onClick={() => navigate("performance")}>
                Log your first month of numbers →
              </button>
            ) : (
              <>
                {perfRows.map((r) => (
                  <button
                    key={r.name}
                    className="dash-perfrow"
                    onClick={() => navigate("performance")}
                  >
                    <span className="dash-perfrow__name">{r.name}</span>
                    <span className="dash-perfrow__nums">
                      <span className="dash-perfrow__val">
                        {compact(r.entry!.followers)}
                        <span className="muted dash-perfrow__unit"> followers</span>
                      </span>
                      {r.delta !== null && (
                        <span
                          className={`dash-perfrow__delta${r.delta < 0 ? " dash-perfrow__delta--down" : ""}`}
                        >
                          <IconTrend size={12} className={r.delta < 0 ? "ic-flipv" : ""} />
                          {r.delta >= 0 ? "+" : ""}
                          {r.delta.toFixed(1)}%
                        </span>
                      )}
                    </span>
                  </button>
                ))}
                <button className="dash-more-link" onClick={() => navigate("performance")}>
                  <IconTrend size={13} className="dash-more-link__ico" />
                  See growth charts
                </button>
              </>
            )}
          </div>

          {platformMix.length > 0 && (
            <div className="card" data-tour="dash-platforms">
              <div className="section-title section-title--compact">Posts per platform</div>
              <Bars
                data={platformMix.map((m) => ({ label: m.label, value: m.value }))}
                formatValue={(n) => `${Math.round(n)} post${Math.round(n) === 1 ? "" : "s"}`}
              />
            </div>
          )}
        </div>
      </div>
    </>
  );
}
