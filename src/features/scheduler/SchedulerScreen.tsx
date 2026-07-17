// Content Scheduler — the heart of the app. One row per planned post, grouped
// by day (today pinned + highlighted), with a filter/sort bar, headline stats,
// a one-tap copy of the combined post text, and a BottomSheet editor.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import "../../styles/features/scheduler.css";
import { PostPhoto } from "../../components/PostPhoto";
import { useLocalImages } from "../../stores/localImages";
import { Chip, ChipRow } from "../../components/Chip";
import { Segmented } from "../../components/Segmented";
import { EmptyState } from "../../components/EmptyState";
import { CountUp } from "../../components/CountUp";
import { IconCalendar, IconCheck, IconChevronDown, IconCopy, IconPlus } from "../../components/icons";
import { usePosts, useHashtagGroups, usePlatforms } from "../../stores/v2";
import { useSettings } from "../../stores/useSettings";
import {
  categoryColor,
  categoryTextColor,
  POST_FORMAT_LABEL,
  POST_STATUS_COLOR,
  POST_STATUS_LABEL,
} from "../../lib/ui";
import { planStats } from "../../lib/postStats";
import { format, fromISO, todayISO } from "../../lib/dates";
import { routeQuery } from "../../router";
import {
  combinedPostText,
  POST_FORMATS,
  POST_STATUSES,
  type Post,
  type PostFormat,
  type PostStatus,
} from "../../lib/types";
import { openPostEditor } from "../../stores/usePostEditor";

type SortDir = "asc" | "desc";
// "Click any column header to filter or sort" from the spreadsheet, adapted to
// a phone-first row list: a "Sort by" field picker instead of literal headers.
// Date keeps the day-grouped/Today-pinned view (its own signature UX, see
// dayGroups below); every other field flattens to one sorted list.
type SortKey = "date" | "idea" | "status" | "pillar" | "format";

const SORT_FIELDS: { value: SortKey; label: string }[] = [
  { value: "date", label: "Date" },
  { value: "idea", label: "Idea" },
  { value: "status", label: "Status" },
  { value: "pillar", label: "Pillar" },
  { value: "format", label: "Format" },
];

// A flat row model for the virtualized list — day/group headers and post rows
// interleaved in render order. Flattening (instead of nesting posts inside a
// per-day card) is what makes windowing possible: a plan with thousands of
// posts across hundreds of days only ever mounts the rows actually on screen,
// regardless of how many days or posts exist in total.
type VRow =
  | { kind: "header"; key: string; label: string; count: number; isToday: boolean }
  | { kind: "post"; key: string; post: Post; showDate: boolean; tourAttr?: string };

const HEADER_ESTIMATE = 40;
const ROW_ESTIMATE = 88;

// Posts render in pages of this size; a "View more" button below the list
// loads the next page. Keeps the first paint light and the page short even
// for a plan with hundreds of posts, instead of one endless scroll.
const PAGE_SIZE = 20;

/** "14:30" -> "2:30 PM" (empty stays empty). */
function fmtTime(t: string): string {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  if (Number.isNaN(h)) return t;
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${String(m ?? 0).padStart(2, "0")} ${ampm}`;
}

function dayHeading(iso: string, todayIso: string): string {
  const sameYear = iso.slice(0, 4) === todayIso.slice(0, 4);
  return format(fromISO(iso), sameYear ? "EEE, MMM d" : "EEE, MMM d, yyyy");
}

const cmpTime = (a: string, b: string) =>
  (a || "99:99") < (b || "99:99") ? -1 : a === b ? 0 : 1;

/** The comparable text for a non-date sort field — case-insensitive, like a
 *  real spreadsheet column sort. */
function sortFieldValue(p: Post, key: SortKey): string {
  switch (key) {
    case "idea":
      return p.idea.trim().toLowerCase();
    case "status":
      return POST_STATUS_LABEL[p.status].toLowerCase();
    case "pillar":
      return p.pillar.trim().toLowerCase();
    case "format":
      return POST_FORMAT_LABEL[p.format].toLowerCase();
    default:
      return "";
  }
}

/** Only renders the thumb box when the post actually has a photo (local
 *  device pick or a URL) — a plain .map() can't call the local-image hook
 *  per row itself, so this small component does. */
function SchedRowThumb({ post, barColor }: { post: Post; barColor: string }) {
  const hasLocal = useLocalImages((s) => !!s.map[post.id]);
  if (!hasLocal && !post.image) return null;
  return (
    <span className="sched-row__thumb" style={{ background: barColor }}>
      <PostPhoto postId={post.id} fallbackUrl={post.image} alt={post.idea} />
    </span>
  );
}

/** One post row — shared by the day-grouped (sort: Date) and flat, sorted-by-
 *  other-field views so both render identically. `showDate` turns on the
 *  inline date/Today chip, needed only when there's no day-group header to
 *  convey it. */
function SchedRow({
  post,
  today,
  copiedId,
  showDate,
  tourAttr,
  onOpen,
  onCopy,
  onStatusChange,
}: {
  post: Post;
  today: string;
  copiedId: string;
  showDate?: boolean;
  tourAttr?: string;
  onOpen: () => void;
  onCopy: () => void;
  onStatusChange: (status: PostStatus) => void;
}) {
  const barColor = post.cover || (post.pillar ? categoryColor(post.pillar) : "var(--surface-2)");
  return (
    <div className="sched-row">
      <span className="sched-row__bar" style={{ background: barColor }} />
      <SchedRowThumb post={post} barColor={barColor} />
      <div
        className="sched-row__main"
        role="button"
        tabIndex={0}
        onClick={onOpen}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onOpen();
          }
        }}
      >
        <div className="sched-row__top">
          <span className="sched-row__idea">{post.idea || "Untitled post"}</span>
          <span
            className="sched-statuspick"
            style={{ color: POST_STATUS_COLOR[post.status] }}
            data-tour={tourAttr ? "sched-status" : undefined}
            onClick={(e) => e.stopPropagation()}
          >
            <span
              className="sched-status__dot"
              style={{ background: POST_STATUS_COLOR[post.status] }}
            />
            <select
              className="sched-statuspick__select"
              aria-label={`Change status for ${post.idea || "post"}`}
              value={post.status}
              onChange={(e) => onStatusChange(e.target.value as PostStatus)}
            >
              {POST_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {POST_STATUS_LABEL[s]}
                </option>
              ))}
            </select>
            <IconChevronDown size={11} className="sched-statuspick__chev" />
          </span>
        </div>
        <div className="sched-row__meta">
          {showDate &&
            (post.date === today ? (
              <span className="sched-row__todaypill">Today</span>
            ) : (
              <span className="sched-row__daychip">
                {post.date ? dayHeading(post.date, today) : "Unscheduled"}
              </span>
            ))}
          {post.time && <span className="sched-row__time">{fmtTime(post.time)}</span>}
          <span className="sched-row__format">{POST_FORMAT_LABEL[post.format]}</span>
          {post.pillar && (
            <span
              className="sched-pillar"
              style={{ background: categoryColor(post.pillar), color: categoryTextColor(post.pillar) }}
            >
              {post.pillar}
            </span>
          )}
          {post.platforms.slice(0, 3).map((pl) => (
            <span key={pl} className="sched-plat">
              {pl}
            </span>
          ))}
          {post.platforms.length > 3 && (
            <span className="sched-plat">+{post.platforms.length - 3}</span>
          )}
        </div>
      </div>
      <button
        className={`sched-copy${copiedId === post.id ? " sched-copy--done" : ""}`}
        aria-label="Copy post text"
        data-tour={tourAttr}
        onClick={(e) => {
          e.stopPropagation();
          onCopy();
        }}
      >
        {copiedId === post.id ? (
          <>
            <IconCheck size={15} /> Copied
          </>
        ) : (
          <IconCopy size={15} />
        )}
      </button>
    </div>
  );
}

export function SchedulerScreen() {
  const { items, update } = usePosts();
  const groups = useHashtagGroups((s) => s.items);
  const platforms = usePlatforms((s) => s.items);
  const { categories, goals } = useSettings();

  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | PostStatus>("all");
  const [pillar, setPillar] = useState("all");
  const [goal, setGoal] = useState("all");
  const [fmt, setFmt] = useState<"all" | PostFormat>("all");
  const [platform, setPlatform] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sort, setSort] = useState<SortDir>("asc");

  // How many posts are currently shown; "View more" bumps it a page at a
  // time. Resets whenever the filters/sort change so a new slice always
  // starts from its own first page.
  const [visibleLimit, setVisibleLimit] = useState(PAGE_SIZE);
  useEffect(() => {
    setVisibleLimit(PAGE_SIZE);
  }, [q, status, pillar, goal, fmt, platform, sortKey, sort]);

  const [copiedId, setCopiedId] = useState("");
  const copyTimer = useRef<number>();
  useEffect(() => () => window.clearTimeout(copyTimer.current), []);

  const today = todayISO();
  const stats = planStats(items, today);

  // Deep links: #/scheduler?post=<id> opens that post (view-first, same as
  // clicking it anywhere else in the app); #/scheduler?new=1&date=yyyy-mm-dd
  // opens a prefilled new-post editor. Routes through the shared, globally
  // mounted post editor (stores/usePostEditor.ts) — Scheduler used to render
  // its own separate local <PostSheet> instance here, which (like Calendar's
  // old one) meant it never got the read-only view step added 2026-07-17;
  // migrated the same way.
  const handledQuery = useRef(false);
  useEffect(() => {
    if (handledQuery.current) return;
    const query = routeQuery();
    const pid = query.get("post");
    const isNew = query.get("new") === "1";
    if (!pid && !isNew) {
      handledQuery.current = true;
      return;
    }
    if (pid) {
      const p = items.find((x) => x.id === pid);
      if (!p) return; // wait for hydration; retries when items change
      openPostEditor(p);
    } else {
      openPostEditor(null, query.get("date") ?? "");
    }
    handledQuery.current = true;
    window.history.replaceState(null, "", "#/scheduler");
  }, [items]);

  // Pillar filter options: the user's pillars plus anything already on posts.
  const pillarOptions = useMemo(() => {
    const set = new Set(categories);
    for (const p of items) if (p.pillar) set.add(p.pillar);
    return [...set];
  }, [categories, items]);

  const goalOptions = useMemo(() => {
    const set = new Set(goals);
    for (const p of items) if (p.goal) set.add(p.goal);
    return [...set];
  }, [goals, items]);

  const activePlatforms = useMemo(
    () => platforms.filter((p) => p.active).sort((a, b) => a.order - b.order),
    [platforms]
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return items.filter((p) => {
      if (status !== "all" && p.status !== status) return false;
      if (pillar !== "all" && p.pillar !== pillar) return false;
      if (goal !== "all" && p.goal !== goal) return false;
      if (fmt !== "all" && p.format !== fmt) return false;
      if (platform !== "all" && !p.platforms.includes(platform)) return false;
      if (needle) {
        const hay = `${p.idea} ${p.hook} ${p.caption} ${p.cta} ${p.pillar} ${p.hashtags} ${p.notes}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [items, q, status, pillar, goal, fmt, platform]);

  // Group by date. "Soonest first": today + upcoming ascending, then past
  // (most recent first), then unscheduled. "Latest first": plain descending.
  const dayGroups = useMemo(() => {
    const map = new Map<string, Post[]>();
    for (const p of filtered) {
      const list = map.get(p.date) ?? [];
      list.push(p);
      map.set(p.date, list);
    }
    for (const list of map.values())
      list.sort((a, b) => cmpTime(a.time, b.time) || (a.createdAt < b.createdAt ? -1 : 1));
    const dated = [...map.keys()].filter(Boolean).sort();
    let ordered: string[];
    if (sort === "asc") {
      const upcoming = dated.filter((d) => d >= today);
      const past = dated.filter((d) => d < today).reverse();
      ordered = [...upcoming, ...past];
    } else {
      ordered = [...dated].reverse();
    }
    if (map.has("")) ordered.push("");
    return ordered.map((date) => ({ date, posts: map.get(date)! }));
  }, [filtered, sort, today]);

  // "Click any column header to sort" adapted for a row list: any field other
  // than Date flattens into one sorted list (day-grouping only makes sense
  // for the date column itself). Case-insensitive, blanks always sort last —
  // same convention a real spreadsheet sort uses.
  const flatSorted = useMemo(() => {
    if (sortKey === "date") return [];
    const dir = sort === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const av = sortFieldValue(a, sortKey);
      const bv = sortFieldValue(b, sortKey);
      if (!av && !bv) return a.createdAt < b.createdAt ? -1 : 1;
      if (!av) return 1;
      if (!bv) return -1;
      if (av < bv) return -dir;
      if (av > bv) return dir;
      return a.createdAt < b.createdAt ? -1 : 1;
    });
  }, [filtered, sortKey, sort]);

  // Flatten whichever view is active into one ordered row list for the
  // virtualizer, capped at `visibleLimit` posts (headers don't count toward
  // the cap). Date mode keeps every day-group's header + its posts in order;
  // every other sort key is one header followed by the sorted posts. A day
  // whose posts land past the cap is left out entirely, header included,
  // until "View more" raises the cap.
  const vrows = useMemo<VRow[]>(() => {
    const out: VRow[] = [];
    let tourAssigned = false;
    let shown = 0;
    const pushPost = (p: Post, showDate: boolean) => {
      out.push({
        kind: "post",
        key: p.id,
        post: p,
        showDate,
        tourAttr: tourAssigned ? undefined : "sched-copy",
      });
      tourAssigned = true;
      shown++;
    };
    if (sortKey === "date") {
      for (const { date, posts } of dayGroups) {
        if (shown >= visibleLimit) break;
        out.push({
          kind: "header",
          key: `h-${date || "unscheduled"}`,
          label: date ? dayHeading(date, today) : "Unscheduled",
          count: posts.length,
          isToday: date === today,
        });
        for (const p of posts.slice(0, visibleLimit - shown)) pushPost(p, false);
      }
    } else {
      out.push({
        kind: "header",
        key: "h-flat",
        label: `Sorted by ${SORT_FIELDS.find((f) => f.value === sortKey)?.label}`,
        count: flatSorted.length,
        isToday: false,
      });
      for (const p of flatSorted.slice(0, visibleLimit)) pushPost(p, true);
    }
    return out;
  }, [sortKey, dayGroups, flatSorted, today, visibleLimit]);

  // Window-virtualize the flattened list so a plan with thousands of posts
  // only ever mounts the rows actually near the viewport. scrollMargin tracks
  // how far the list sits from the top of the page (stats/filter bar live
  // above it) and stays accurate if that content's height changes — e.g. more
  // filter chips wrapping to another line — via a body ResizeObserver.
  const listContainerRef = useRef<HTMLDivElement>(null);
  const [scrollMargin, setScrollMargin] = useState(0);
  useLayoutEffect(() => {
    const el = listContainerRef.current;
    if (!el) return;
    const update = () => setScrollMargin(el.offsetTop);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(document.body);
    window.addEventListener("resize", update);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);

  const virtualizer = useWindowVirtualizer({
    count: vrows.length,
    estimateSize: (i) => (vrows[i]?.kind === "header" ? HEADER_ESTIMATE : ROW_ESTIMATE),
    overscan: 10,
    scrollMargin,
  });

  function groupTagsFor(p: Post): string {
    return groups.find((g) => g.id === p.hashtagGroupId)?.tags ?? "";
  }

  function copyPost(p: Post) {
    const text = combinedPostText(p, groupTagsFor(p));
    void navigator.clipboard?.writeText(text).catch(() => {});
    setCopiedId(p.id);
    window.clearTimeout(copyTimer.current);
    copyTimer.current = window.setTimeout(() => setCopiedId(""), 1400);
  }

  function openNew() {
    openPostEditor(null);
  }

  const openPost = openPostEditor;

  const filtersOn =
    status !== "all" ||
    pillar !== "all" ||
    goal !== "all" ||
    fmt !== "all" ||
    platform !== "all" ||
    q.trim() !== "";

  function clearFilters() {
    setQ("");
    setStatus("all");
    setPillar("all");
    setGoal("all");
    setFmt("all");
    setPlatform("all");
  }

  return (
    <>
      <div className="screen-head">
        <div className="screen-head__eyebrow">Your content plan</div>
        <h1 className="screen-head__title">Scheduler</h1>
      </div>

      {/* Headline stats: one compact strip instead of four separate cards */}
      <div className="card sched-stats" data-tour="sched-stats">
        <div className="sched-stats__cell">
          <span className="sched-stats__value">
            <CountUp value={stats.total} />
          </span>
          <span className="sched-stats__label">Planned</span>
        </div>
        <div className="sched-stats__cell">
          <span className="sched-stats__value sched-stats__value--pub">
            <CountUp value={stats.published} />
          </span>
          <span className="sched-stats__label">Published</span>
        </div>
        <div className="sched-stats__cell">
          <span className="sched-stats__value">{stats.avgPerDay}</span>
          <span className="sched-stats__label">Avg / day</span>
        </div>
        <div className="sched-stats__cell">
          <span className="sched-stats__value">
            <CountUp value={stats.scheduledToday} />
          </span>
          <span className="sched-stats__label">Today</span>
        </div>
      </div>

      {/* Filter / sort bar: search + quick status chips up top, everything
          else as a compact 2-up select grid instead of three chip rows */}
      <div className="card sched-filters" data-tour="sched-filters">
        <input
          className="input sched-search"
          type="search"
          placeholder="Search ideas, captions, hashtags…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Search posts"
        />
        <ChipRow>
          <Chip active={status === "all"} onClick={() => setStatus("all")}>
            All statuses
          </Chip>
          {POST_STATUSES.map((s) => (
            <Chip
              key={s}
              active={status === s}
              dotColor={POST_STATUS_COLOR[s]}
              onClick={() => setStatus(status === s ? "all" : s)}
            >
              {POST_STATUS_LABEL[s]}
            </Chip>
          ))}
        </ChipRow>
        <div className="sched-selectgrid">
          <select
            className="input sched-select"
            value={pillar}
            onChange={(e) => setPillar(e.target.value)}
            aria-label="Filter by pillar"
          >
            <option value="all">All pillars</option>
            {pillarOptions.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select
            className="input sched-select"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            aria-label="Filter by goal"
          >
            <option value="all">All goals</option>
            {goalOptions.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
          <select
            className="input sched-select"
            value={fmt}
            onChange={(e) => setFmt(e.target.value as typeof fmt)}
            aria-label="Filter by format"
          >
            <option value="all">All formats</option>
            {POST_FORMATS.map((f) => (
              <option key={f} value={f}>
                {POST_FORMAT_LABEL[f]}
              </option>
            ))}
          </select>
          <select
            className="input sched-select"
            value={platform}
            onChange={(e) => setPlatform(e.target.value)}
            aria-label="Filter by platform"
          >
            <option value="all">All platforms</option>
            {activePlatforms.map((p) => (
              <option key={p.id} value={p.name}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="sched-filters__row">
          <select
            className="input sched-select"
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            aria-label="Sort by column"
          >
            {SORT_FIELDS.map((f) => (
              <option key={f.value} value={f.value}>
                Sort: {f.label}
              </option>
            ))}
          </select>
          <div className="sched-filters__sort">
            <Segmented
              options={
                sortKey === "date"
                  ? [
                      { value: "asc", label: "Soonest" },
                      { value: "desc", label: "Latest" },
                    ]
                  : [
                      { value: "asc", label: "A → Z" },
                      { value: "desc", label: "Z → A" },
                    ]
              }
              value={sort}
              onChange={(v) => setSort(v)}
            />
          </div>
        </div>
        <div className="sched-filters__foot">
          <span className="muted fs-12">
            {filtered.length < items.length
              ? `${filtered.length} of ${items.length} posts match`
              : `${items.length} posts`}
            {filtered.length > visibleLimit && ` · showing first ${visibleLimit}`}
          </span>
          {filtersOn && (
            <button className="chip sched-filters__clear" onClick={clearFilters}>
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Grouped list */}
      <div data-tour="sched-list">
        {items.length === 0 ? (
          <div className="card">
            <EmptyState
              icon={<IconCalendar size={28} />}
              title="Nothing planned yet, and that's fine"
              sub="Start with one idea. Give it a date and a pillar, and your plan starts building itself."
            >
              <button className="btn btn--primary" onClick={openNew}>
                Plan your first post
              </button>
            </EmptyState>
          </div>
        ) : filtered.length === 0 ? (
          <div className="card">
            <div className="row">
              <span className="muted fs-13">No posts match these filters.</span>
              {filtersOn && (
                <button className="chip flex-none" onClick={clearFilters}>
                  Clear filters
                </button>
              )}
            </div>
          </div>
        ) : (
          <div
            className="card sched-listcard"
            ref={listContainerRef}
            style={{ position: "relative", height: virtualizer.getTotalSize() }}
          >
            {virtualizer.getVirtualItems().map((vi) => {
              const row = vrows[vi.index];
              const prevIsPost = vrows[vi.index - 1]?.kind === "post";
              return (
                <div
                  key={row.key}
                  data-index={vi.index}
                  ref={virtualizer.measureElement}
                  className={
                    row.kind === "header"
                      ? `sched-vheader${vi.index === 0 ? " sched-vheader--first" : ""}`
                      : `sched-vrow${prevIsPost ? " sched-vrow--divider" : ""}`
                  }
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${vi.start - virtualizer.options.scrollMargin}px)`,
                  }}
                >
                  {row.kind === "header" ? (
                    <div className={`sched-day${row.isToday ? " sched-day--today" : ""}`}>
                      <span>{row.label}</span>
                      {row.isToday && <span className="sched-day__badge">Today</span>}
                      <span className="sched-day__count">
                        {row.count} {row.count === 1 ? "post" : "posts"}
                      </span>
                    </div>
                  ) : (
                    <SchedRow
                      post={row.post}
                      today={today}
                      copiedId={copiedId}
                      showDate={row.showDate}
                      tourAttr={row.tourAttr}
                      onOpen={() => openPost(row.post)}
                      onCopy={() => copyPost(row.post)}
                      onStatusChange={(s) => update(row.post.id, { status: s })}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
        {filtered.length > visibleLimit && (
          <button
            className="sched-viewmore"
            data-tour="sched-viewmore"
            onClick={() => setVisibleLimit((v) => v + PAGE_SIZE)}
          >
            <IconChevronDown size={15} />
            View more
            <span className="sched-viewmore__count">
              {filtered.length - visibleLimit} remaining
            </span>
          </button>
        )}
      </div>

      <button className="fab" data-tour="sched-fab" aria-label="Plan a new post" onClick={openNew}>
        <IconPlus />
      </button>
    </>
  );
}
