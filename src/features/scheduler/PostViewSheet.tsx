// Read-only post preview — opens FIRST when a post is clicked anywhere
// (Monthly Plan, Feed Preview, Dashboard, Idea Bank, Calendar), with editing
// one explicit tap away via the "Edit" button. Confirmed live 2026-07-17:
// jumping straight into an editable form every time a post is clicked made
// it awkward to just glance at what was already written, or proofread a
// hook/caption/CTA for typos — small input boxes are a worse reading surface
// than plain text, and every tap risked an accidental edit. Reuses the exact
// sheet-group/sheet-cell layout PostSheet's edit form already uses, so
// switching between the two feels like the same surface, not two different
// screens.
import { useRef, useState } from "react";
import { BottomSheet } from "../../components/BottomSheet";
import { PostPhoto } from "../../components/PostPhoto";
import { IconCheck, IconCopy } from "../../components/icons";
import { useLocalImages } from "../../stores/localImages";
import { useHashtagGroups } from "../../stores/v2";
import {
  categoryColor,
  POST_FORMAT_LABEL,
  POST_STATUS_COLOR,
  POST_STATUS_LABEL,
  swatchTextColor,
} from "../../lib/ui";
import { combinedPostText, type Post } from "../../lib/types";
import { format, fromISO } from "../../lib/dates";

interface Props {
  open: boolean;
  post: Post | null;
  onClose: () => void;
  onEdit: () => void;
}

function Field({ label, value }: { label: string; value: string }) {
  if (!value.trim()) return null;
  return (
    <>
      <span className="sheet-section-label">{label}</span>
      <div className="sheet-group">
        <div className="sheet-cell">
          <p className="postview-text">{value}</p>
        </div>
      </div>
    </>
  );
}

export function PostViewSheet({ open, post, onClose, onEdit }: Props) {
  const groups = useHashtagGroups((s) => s.items);
  const hasLocal = useLocalImages((s) => (post ? !!s.map[post.id] : false));
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<number>();

  // View mode only ever applies to an EXISTING post — creating new goes
  // straight to Edit (see usePostEditor's show()), so this should never
  // actually render with post=null, but keeps the component crash-proof if
  // it ever does mid-close-animation.
  if (!post) return null;

  const groupTags = groups.find((g) => g.id === post.hashtagGroupId)?.tags ?? "";
  const text = combinedPostText(post, groupTags);
  const allTags = [groupTags.trim(), post.hashtags.trim()].filter(Boolean).join(" ");
  const hasPhoto = hasLocal || !!post.image;
  const fill = post.cover || categoryColor(post.pillar);

  function copy() {
    void navigator.clipboard?.writeText(text).catch(() => {});
    setCopied(true);
    window.clearTimeout(copyTimer.current);
    copyTimer.current = window.setTimeout(() => setCopied(false), 1400);
  }

  return (
    <BottomSheet open={open} title="Post" onClose={onClose} action={{ label: "Edit", onClick: onEdit }}>
      <div className="postview-hero" style={{ background: fill }}>
        {hasPhoto && (
          <PostPhoto postId={post.id} fallbackUrl={post.image} alt={post.idea} className="postview-hero__img" />
        )}
        <span
          className={`postview-hero__pillar${hasPhoto ? " postview-hero__pillar--photo" : ""}`}
          style={{ color: hasPhoto ? undefined : swatchTextColor(fill) }}
        >
          {post.pillar || "No pillar"}
        </span>
      </div>

      <h2 className="postview-idea">{post.idea || "Untitled post"}</h2>
      <div className="postview-meta">
        <span
          className="postview-status"
          style={{ color: POST_STATUS_COLOR[post.status] }}
        >
          <span className="postview-status__dot" style={{ background: POST_STATUS_COLOR[post.status] }} />
          {POST_STATUS_LABEL[post.status]}
        </span>
        <span>{POST_FORMAT_LABEL[post.format]}</span>
        {post.date && <span>{format(fromISO(post.date), "EEE, MMM d")}</span>}
        {post.time && <span>{post.time}</span>}
        {post.goal && <span>Goal: {post.goal}</span>}
      </div>
      {post.platforms.length > 0 && (
        <div className="postview-plats">
          {post.platforms.map((pl) => (
            <span key={pl} className="chip">{pl}</span>
          ))}
        </div>
      )}

      <Field label="Hook" value={post.hook} />
      <Field label="Caption" value={post.caption} />
      <Field label="Call to action" value={post.cta} />
      <Field label="Hashtags" value={allTags} />
      <Field label="Notes" value={post.notes} />

      {text && (
        <button className="btn btn--ghost btn--stack" onClick={copy}>
          {copied ? <><IconCheck size={15} /> Copied</> : <><IconCopy size={15} /> Copy caption</>}
        </button>
      )}
    </BottomSheet>
  );
}
