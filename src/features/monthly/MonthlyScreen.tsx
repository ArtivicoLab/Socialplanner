// 12-Month Visual Plan — a rich month-at-a-time preview of the content plan
// (the Etsy listing's monthly overview). One header card holds the month
// title, prev/next arrows and a scrollable 12-month strip; a compact
// "at a glance" card (published ring + pillar legend) sits beside the plan
// grid on desktop and above it on phones; platform distribution and monthly
// goals live in the side rail. The plan is a weeks-as-rows grid with mini
// post cards; on phones it scrolls sideways (same pattern as the Calendar
// screen) so cells stay full-size instead of squishing.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { EmptyState } from "../../components/EmptyState";
import { ProgressRing } from "../../components/ProgressRing";
import { PostPhoto } from "../../components/PostPhoto";
import { Checkbox } from "../../components/Checkbox";
import { Bars } from "../../components/Charts";
import { IconCalendar, IconChevron, IconTrash } from "../../components/icons";
import { usePosts, useMonthlyGoals } from "../../stores/v2";
import { useLocalImages } from "../../stores/localImages";
import { useSettings } from "../../stores/useSettings";
import { openPostEditor } from "../../stores/usePostEditor";
import { countByPlatform, postsByDay } from "../../lib/postStats";
import { categoryColor, POST_FORMAT_LABEL, POST_STATUS_COLOR, POST_STATUS_LABEL, swatchTextColor } from "../../lib/ui";
import type { Post } from "../../lib/types";
import {
  addMonthsISO,
  dayNum,
  format,
  fromISO,
  inSameMonth,
  monthGridISO,
  monthTitle,
  todayISO,
  weekdayShort,
} from "../../lib/dates";
import "../../styles/features/monthly.css";

const MAX_CARDS_PER_DAY = 4;

// A square tile like the Feed Preview's: the photo (or pillar color) fills
// the background, labels sit on top over a scrim.
function PostCard({ post, onOpen }: { post: Post; onOpen: () => void }) {
  const hasLocal = useLocalImages((s) => !!s.map[post.id]);
  const hasPhoto = hasLocal || !!post.image;
  const fill = post.cover || categoryColor(post.pillar);
  return (
    <button
      className={`mon-card${hasPhoto ? " mon-card--photo" : ""}`}
      style={{ background: fill, color: hasPhoto ? undefined : swatchTextColor(fill) }}
      onClick={onOpen}
      title={`${post.idea || "Untitled"} (${POST_STATUS_LABEL[post.status]})`}
    >
      <PostPhoto postId={post.id} fallbackUrl={post.image} alt={post.idea} className="mon-card__img" />
      <span className="mon-card__chip">{post.pillar || "No pillar"}</span>
      <span
        className="mon-card__dot"
        style={{ background: POST_STATUS_COLOR[post.status] }}
        aria-label={POST_STATUS_LABEL[post.status]}
      />
      <span className="mon-card__idea">{post.idea || "Untitled"}</span>
      <span className="mon-card__foot">
        {post.time && <span className="mon-card__time">{post.time}</span>}
        <span className="mon-card__fmt">{POST_FORMAT_LABEL[post.format]}</span>
      </span>
      {post.platforms.length > 0 && (
        <span className="mon-card__plats">{post.platforms.join(" · ")}</span>
      )}
    </button>
  );
}

export function MonthlyScreen() {
  const posts = usePosts((s) => s.items);
  const weekStart = useSettings((s) => s.weekStart);
  const today = todayISO();
  const thisMonth = today.slice(0, 7);

  const [anchor, setAnchor] = useState(() => thisMonth); // "yyyy-MM"
  const monthStart = `${anchor}-01`;
  const year = anchor.slice(0, 4);

  const allGoals = useMonthlyGoals((s) => s.items);
  const addGoal = useMonthlyGoals((s) => s.add);
  const updateGoal = useMonthlyGoals((s) => s.update);
  const removeGoal = useMonthlyGoals((s) => s.remove);
  const [goalText, setGoalText] = useState("");
  const monthGoals = useMemo(
    () =>
      allGoals
        .filter((g) => g.month === anchor)
        .sort((a, b) => a.order - b.order || (a.createdAt < b.createdAt ? -1 : 1)),
    [allGoals, anchor]
  );
  function addMonthGoal() {
    const text = goalText.trim();
    if (!text) return;
    addGoal({ month: anchor, text, order: monthGoals.length });
    setGoalText("");
  }

  const monthPosts = useMemo(
    () => posts.filter((p) => p.date.startsWith(anchor)),
    [posts, anchor]
  );
  const byDay = useMemo(() => postsByDay(posts, anchor), [posts, anchor]);

  // How busy each month of the visible year is, for the month-strip dots.
  const yearCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of posts) {
      if (!p.date.startsWith(year)) continue;
      const ym = p.date.slice(0, 7);
      map.set(ym, (map.get(ym) ?? 0) + 1);
    }
    return map;
  }, [posts, year]);

  const weeks = useMemo(() => {
    const grid = monthGridISO(monthStart, weekStart);
    const out: string[][] = [];
    for (let i = 0; i < grid.length; i += 7) out.push(grid.slice(i, i + 7));
    return out;
  }, [monthStart, weekStart]);

  const published = monthPosts.filter((p) => p.status === "published").length;
  const total = monthPosts.length;
  const platformCounts = useMemo(() => countByPlatform(monthPosts), [monthPosts]);
  const pillars = useMemo(
    () => [...new Set(monthPosts.map((p) => p.pillar || "Unassigned"))],
    [monthPosts]
  );

  const weekdayRow = weeks[0]?.map(weekdayShort) ?? [];

  // Keep the selected month pill visible in the scrollable strip.
  const stripRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const strip = stripRef.current;
    const pill = strip?.querySelector<HTMLElement>(".mon-month--on");
    if (!strip || !pill) return;
    strip.scrollTo({
      left: pill.offsetLeft - strip.clientWidth / 2 + pill.clientWidth / 2,
      behavior: "smooth",
    });
  }, [anchor]);

  const openPost = (post: Post) => openPostEditor(post);
  const planMonth = () => openPostEditor(null, anchor === thisMonth ? today : monthStart);

  // Same gap as the Calendar screen's grid (see its own comment): the plan
  // grid scrolls sideways on a phone, so without this "today" can load
  // off-screen — confirmed live 2026-07-17. Runs once on mount, before
  // paint, and only bites when today is actually on the currently-viewed
  // month's grid (a no-op on any other month, so paging away never fights
  // the user by snapping back).
  const gridScrollRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const todayCell = gridScrollRef.current?.querySelector<HTMLElement>(".mon-cell--today");
    const container = gridScrollRef.current;
    if (!todayCell || !container) return;
    container.scrollLeft =
      todayCell.offsetLeft - container.clientWidth / 2 + todayCell.offsetWidth / 2;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <div className="screen-head">
        <div className="screen-head__eyebrow">Your year, month by month</div>
        <h1 className="screen-head__title">Monthly Plan</h1>
      </div>

      {/* Month header: title + arrows + 12-month strip */}
      <div className="card mon-head">
        <div className="mon-head__row">
          <span className="mon-head__title">{monthTitle(monthStart)}</span>
          {anchor !== thisMonth && (
            <button className="mon-today" onClick={() => setAnchor(thisMonth)}>
              Today
            </button>
          )}
          <button
            className="mon-navbtn"
            aria-label="Previous month"
            onClick={() => setAnchor(addMonthsISO(monthStart, -1).slice(0, 7))}
          >
            <IconChevron size={18} className="ic-flip" />
          </button>
          <button
            className="mon-navbtn"
            aria-label="Next month"
            onClick={() => setAnchor(addMonthsISO(monthStart, 1).slice(0, 7))}
          >
            <IconChevron size={18} />
          </button>
        </div>
        <div
          className="mon-months"
          ref={stripRef}
          role="tablist"
          aria-label={`Jump to a month of ${year}`}
        >
          {Array.from({ length: 12 }, (_, m) => {
            const ym = `${year}-${String(m + 1).padStart(2, "0")}`;
            const d = fromISO(`${ym}-01`);
            const count = yearCounts.get(ym) ?? 0;
            return (
              <button
                key={ym}
                role="tab"
                aria-selected={ym === anchor}
                aria-label={format(d, "MMMM")}
                title={count > 0 ? `${format(d, "MMMM")}: ${count} posts` : format(d, "MMMM")}
                className={`mon-month${ym === anchor ? " mon-month--on" : ""}`}
                onClick={() => setAnchor(ym)}
              >
                {format(d, "MMM")}
                <span className={`mon-month__dot${count > 0 ? " mon-month__dot--busy" : ""}`} />
              </button>
            );
          })}
        </div>
      </div>

      <div className="mon-layout">
        {/* At a glance: published ring + pillar legend */}
        <div className="card mon-glance" data-tour="monthly-charts">
          <ProgressRing
            value={total > 0 ? published / total : 0}
            size={64}
            stroke={9}
            color="var(--success)"
            dotted={total === 0}
            ariaLabel={`${published} of ${total} posts published this month`}
          />
          <div className="mon-glance__body">
            <div className="mon-glance__count">
              {published} of {total}
            </div>
            <div className="mon-glance__sub">posts published this month</div>
            {pillars.length > 0 && (
              <div className="mon-legend">
                {pillars.map((name) => (
                  <span key={name} className="mon-legend__item">
                    <span className="dot-9" style={{ background: categoryColor(name) }} />
                    {name}
                  </span>
                ))}
              </div>
            )}
          </div>
          {total > 0 && (
            <button className="btn btn--auto mon-glance__add" onClick={planMonth}>
              Add post
            </button>
          )}
        </div>

        {/* The plan itself */}
        <div className="mon-plan" data-tour="monthly-grid">
          {total === 0 ? (
            <div className="card">
              <EmptyState
                icon={<IconCalendar size={30} />}
                title={`${monthTitle(monthStart)} is a blank canvas`}
                sub="Nothing planned yet. Sketch in your first post and watch the month fill up."
              >
                <button className="btn btn--primary btn--auto" onClick={planMonth}>
                  Plan this month
                </button>
              </EmptyState>
            </div>
          ) : (
            /* Weeks as rows; the grid keeps full-size cells and scrolls
               sideways on phones, same pattern as the Calendar screen. */
            <div className="card mon-gridcard">
              <div className="mon-scroll" ref={gridScrollRef}>
                <div className="mon-grid">
                  {weekdayRow.map((w) => (
                    <div key={w} className="mon-dow">
                      {w}
                    </div>
                  ))}
                  {weeks.flat().map((date) => {
                    const inMonth = inSameMonth(date, monthStart);
                    const dPosts = inMonth ? byDay.get(date) ?? [] : [];
                    return (
                      <div
                        key={date}
                        className={`mon-cell${inMonth ? "" : " mon-cell--out"}${date === today ? " mon-cell--today" : ""}`}
                      >
                        <span className="mon-cell__date">{dayNum(date)}</span>
                        {dPosts.slice(0, MAX_CARDS_PER_DAY).map((p) => (
                          <PostCard key={p.id} post={p} onOpen={() => openPost(p)} />
                        ))}
                        {dPosts.length > MAX_CARDS_PER_DAY && (
                          <span className="mon-more">
                            +{dPosts.length - MAX_CARDS_PER_DAY} more
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Side rail: distribution + goals */}
        <div className="mon-side">
          <div className="card">
            <div className="section-title section-title--compact">Post distribution</div>
            {platformCounts.length === 0 ? (
              <div className="muted fs-13">No platforms picked yet this month.</div>
            ) : (
              <Bars
                data={platformCounts.map((d) => ({ ...d, color: "var(--accent)" }))}
              />
            )}
          </div>
          <div className="card" data-tour="monthly-goals">
            <div className="section-title section-title--compact">Monthly goals</div>
            {monthGoals.length === 0 && (
              <div className="muted fs-13 mb-2">
                What are you working toward this month?
              </div>
            )}
            <div className="mon-goals">
              {monthGoals.map((g) => (
                <div key={g.id} className={`mon-goal${g.done ? " mon-goal--done" : ""}`}>
                  <Checkbox
                    checked={g.done}
                    onChange={() => updateGoal(g.id, { done: !g.done })}
                    label={g.text}
                  />
                  <span className="mon-goal__text">{g.text}</span>
                  <button
                    className="mon-goal__del"
                    aria-label={`Remove goal: ${g.text}`}
                    onClick={() => removeGoal(g.id)}
                  >
                    <IconTrash size={14} />
                  </button>
                </div>
              ))}
            </div>
            <div className="mon-goalform">
              <input
                className="input"
                value={goalText}
                placeholder="e.g. Boost engagement by 15%"
                aria-label="New monthly goal"
                onChange={(e) => setGoalText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addMonthGoal()}
              />
              <button
                className="btn btn--auto"
                onClick={addMonthGoal}
                disabled={!goalText.trim()}
              >
                Add
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
