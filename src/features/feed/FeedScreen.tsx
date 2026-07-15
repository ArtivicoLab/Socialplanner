// Feed Preview — the listing's hero feature: see the planned grid per
// platform inside a CSS "phone" before anything actually goes live.
import { useMemo, useRef, useState } from "react";
import { EmptyState } from "../../components/EmptyState";
import { Segmented } from "../../components/Segmented";
import {
  IconCamera,
  IconChevronDown,
  IconClapper,
  IconFeed,
  IconPlay,
} from "../../components/icons";
import { PostPhoto } from "../../components/PostPhoto";
import { useLocalImages } from "../../stores/localImages";
import { usePlatforms, usePosts } from "../../stores/v2";
import { useSettings } from "../../stores/useSettings";
import { feedPosts } from "../../lib/postStats";
import { addDaysISO, format, fromISO, todayISO } from "../../lib/dates";
import { categoryColor, POST_FORMAT_LABEL, swatchTextColor } from "../../lib/ui";
import type { Post, PostFormat } from "../../lib/types";
import { navigate } from "../../router";
import "../../styles/features/feed.css";

function formatIcon(f: PostFormat) {
  if (f === "reel") return <IconClapper size={10} aria-hidden />;
  if (f === "story") return <IconCamera size={10} aria-hidden />;
  if (f === "video") return <IconPlay size={10} aria-hidden />;
  return null;
}

function tileColor(p: Post): string {
  if (p.cover) return p.cover;
  if (p.pillar) return categoryColor(p.pillar);
  return "var(--surface-2)";
}

function FeedTile({ post, live }: { post: Post; live: boolean }) {
  const hasLocal = useLocalImages((s) => !!s.map[post.id]);
  const hasPhoto = hasLocal || !!post.image;
  const fill = tileColor(post);
  const textColor = hasPhoto ? undefined : fill.startsWith("var(--cat-") ? swatchTextColor(fill) : "var(--ink)";
  return (
    <button
      className={`feed-tile${live ? "" : " feed-tile--planned"}${hasPhoto ? " feed-tile--photo" : ""}`}
      style={{ background: fill, color: textColor }}
      onClick={() => navigate("scheduler", { post: post.id })}
      aria-label={`${post.idea || "Untitled post"}, ${
        POST_FORMAT_LABEL[post.format]
      }, ${live ? "published" : "planned"}`}
    >
      <PostPhoto postId={post.id} fallbackUrl={post.image} alt={post.idea} className="feed-tile__img" />
      <span className="feed-tile__chip">
        {formatIcon(post.format)}
        {POST_FORMAT_LABEL[post.format]}
      </span>
      {!live && <span className="feed-tile__dot" aria-hidden />}
      <span className="feed-tile__idea">{post.idea || "Untitled"}</span>
      <span className="feed-tile__date">{format(fromISO(post.date), "MMM d")}</span>
    </button>
  );
}

export function FeedScreen() {
  const posts = usePosts((s) => s.items);
  const platforms = usePlatforms((s) => s.items);
  // Subscribe so tiles re-tint when the user re-colors a pillar in Settings.
  useSettings((s) => s.categoryColors);

  const active = useMemo(
    () =>
      platforms
        .filter((p) => p.active && p.name.trim())
        .sort((a, b) => a.order - b.order || (a.createdAt < b.createdAt ? -1 : 1)),
    [platforms]
  );

  const [picked, setPicked] = useState("");
  const [upto, setUpto] = useState(() => addDaysISO(todayISO(), 7));
  const bottomRef = useRef<HTMLDivElement>(null);

  // Fall back gracefully if the picked platform was deactivated/renamed.
  const platform =
    active.some((p) => p.name === picked) ? picked : active[0]?.name ?? "";

  const feed = useMemo(
    () => (platform ? feedPosts(posts, platform, upto) : []),
    [posts, platform, upto]
  );

  return (
    <>
      <div className="screen-head">
        <div className="screen-head__eyebrow">Preview</div>
        <h1 className="screen-head__title">Feed</h1>
      </div>

      <div className="card feed-controls" data-tour="feed-platform">
        {active.length === 0 ? (
          <p className="muted feed-controls__hint">
            No active platforms yet. Turn one on in Settings to preview its feed.
          </p>
        ) : active.length <= 4 ? (
          <Segmented
            options={active.map((p) => ({ value: p.name, label: p.name }))}
            value={platform}
            onChange={setPicked}
          />
        ) : (
          <select
            className="input feed-controls__select"
            aria-label="Platform"
            value={platform}
            onChange={(e) => setPicked(e.target.value)}
          >
            {active.map((p) => (
              <option key={p.id} value={p.name}>
                {p.name}
              </option>
            ))}
          </select>
        )}
        <div className="feed-upto">
          <label className="field__label field__label--flush" htmlFor="feed-upto">
            Show feed up to
          </label>
          <input
            id="feed-upto"
            className="input"
            type="date"
            value={upto}
            onChange={(e) => e.target.value && setUpto(e.target.value)}
          />
        </div>
      </div>

      {platform && (
        <div className="feed-device" data-tour="feed-grid">
          <div className="feed-device__notch" aria-hidden />
          <div className="feed-device__bar">{platform}</div>
          {feed.length === 0 ? (
            <EmptyState
              icon={<IconFeed size={28} />}
              title="Nothing on this feed yet"
              sub={`Assign posts to ${platform} in the scheduler and they'll appear here, newest first.`}
            />
          ) : (
            <>
              {feed.length > 9 && (
                <button
                  className="feed-jump"
                  onClick={() => bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })}
                >
                  Jump to bottom
                  <IconChevronDown size={13} />
                </button>
              )}
              <div className="feed-grid">
                {feed.map((p) => (
                  <FeedTile key={p.id} post={p} live={p.status === "published"} />
                ))}
              </div>
              <div ref={bottomRef} aria-hidden />
            </>
          )}
          <div className="feed-device__home" aria-hidden />
        </div>
      )}

      {platform && feed.length > 0 && (
        <div className="feed-legend">
          <span className="feed-legend__item">
            <span className="feed-legend__swatch feed-legend__swatch--live" />
            Published
          </span>
          <span className="feed-legend__item">
            <span className="feed-legend__swatch feed-legend__swatch--planned" />
            Planned
          </span>
        </div>
      )}
    </>
  );
}
