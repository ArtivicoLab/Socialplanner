// Dashboard hero — a gradient "studio cover" band: live date + ticking clock,
// a display-weight greeting with an inline-editable name, context chips, a
// primary "Plan a post" CTA, a polaroid-style stack of the next scheduled post
// images, and a frosted stat strip. The name edit is zero-friction: tap it
// (falls back to "creator"), type, saves instantly.
import { useEffect, useRef, useState } from "react";
import { LiveClock } from "../../components/LiveClock";
import { PostPhoto } from "../../components/PostPhoto";
import { CountUp } from "../../components/CountUp";
import { IconEdit, IconPlus, IconChevron } from "../../components/icons";
import { useSettings } from "../../stores/useSettings";
import { navigate } from "../../router";
import { categoryColor } from "../../lib/ui";
import type { Post } from "../../lib/types";
import type { PlanStats } from "../../lib/postStats";

function greetingWord(d = new Date()): string {
  const h = d.getHours();
  if (h < 5) return "Good night";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

interface Props {
  /** Short context facts rendered as chips ("1 post to publish today"). */
  chips?: string[];
  /** Headline numbers for the frosted stat strip (omit to hide the strip). */
  stats?: PlanStats;
  /** The next few scheduled posts — their images become the cover stack. */
  upNext?: Post[];
}

export function DashboardHero({ chips = [], stats, upNext = [] }: Props) {
  const { name, update } = useSettings();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  function save() {
    update({ name: draft.trim() });
    setEditing(false);
  }

  const dateLabel = new Date()
    .toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })
    .toUpperCase();

  const stack = upNext.slice(0, 3);

  return (
    <div className="dash-hero">
      <div className="dash-hero__main">
        <div className="dash-hero__top">
          <span className="dash-hero__date">{dateLabel}</span>
          <LiveClock />
        </div>
        <div className="dash-hero__greet">
          {greetingWord()}
          {editing ? (
            <>
              <span>, </span>
              <input
                ref={inputRef}
                className="dash-hero__nameinput"
                value={draft}
                maxLength={24}
                placeholder="your name"
                aria-label="Your name"
                onChange={(e) => setDraft(e.target.value)}
                onBlur={save}
                onKeyDown={(e) => {
                  if (e.key === "Enter") save();
                  if (e.key === "Escape") {
                    setDraft(name);
                    setEditing(false);
                  }
                }}
              />
            </>
          ) : (
            <button
              className="dash-hero__setname"
              aria-label={name ? `Edit name (${name})` : "Add your name"}
              onClick={() => {
                setDraft(name);
                setEditing(true);
              }}
            >
              , {name || "creator"}
              <IconEdit size={15} className="dash-hero__editicon" />
            </button>
          )}
        </div>

        {chips.length > 0 && (
          <div className="dash-hero__chips">
            {chips.map((c) => (
              <span key={c} className="dash-hero__chip">
                {c}
              </span>
            ))}
          </div>
        )}

        <div className="dash-hero__actions" data-tour="dash-hero-actions">
          <button
            className="dash-hero__cta"
            onClick={() => navigate("scheduler", { new: "1" })}
          >
            <IconPlus size={16} /> Plan a post
          </button>
          {stack.length > 0 && (
            <button
              className="dash-hero__ctaghost"
              onClick={() => navigate("feed")}
            >
              Preview feed <IconChevron size={14} />
            </button>
          )}
        </div>
      </div>

      {stack.length > 0 && (
        <button
          className="dash-hero__stack"
          data-tour="dash-hero-upnext"
          aria-label="Up next, open the feed preview"
          onClick={() => navigate("feed")}
        >
          {stack.map((p, i) => (
            <span
              key={p.id}
              className={`dash-hero__shot dash-hero__shot--${i}`}
              style={{ background: p.cover || categoryColor(p.pillar) }}
            >
              <PostPhoto postId={p.id} fallbackUrl={p.image} alt={p.idea} className="dash-hero__img" />
            </span>
          ))}
          <span className="dash-hero__stacktag">Up next</span>
        </button>
      )}

      {stats && (
        <div className="dash-stats" data-tour="stats">
          <button className="dash-stat" onClick={() => navigate("scheduler")}>
            <span className="dash-stat__value">
              <CountUp value={stats.total} />
            </span>
            <span className="dash-stat__label">Total posts</span>
          </button>
          <button className="dash-stat" onClick={() => navigate("scheduler")}>
            <span className="dash-stat__value">
              <CountUp value={stats.published} />
            </span>
            <span className="dash-stat__label">Published</span>
          </button>
          <button className="dash-stat" onClick={() => navigate("monthly")}>
            <span className="dash-stat__value">
              <CountUp
                value={Math.round(stats.avgPerDay * 10)}
                format={(n) => (n / 10).toFixed(1)}
              />
            </span>
            <span className="dash-stat__label">Avg / day</span>
          </button>
          <button className="dash-stat" onClick={() => navigate("scheduler")}>
            <span className="dash-stat__value">
              <CountUp value={stats.scheduledToday} />
            </span>
            <span className="dash-stat__label">Due today</span>
          </button>
        </div>
      )}
    </div>
  );
}
