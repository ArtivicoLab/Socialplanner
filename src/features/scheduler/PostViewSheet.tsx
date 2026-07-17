// Read-only post preview — opens FIRST when a post is clicked anywhere
// (Monthly Plan, Feed Preview, Dashboard, Idea Bank, Calendar), with editing
// one explicit tap away via the "Edit" button. Confirmed live 2026-07-17:
// jumping straight into an editable form every time a post is clicked made
// it awkward to just glance at what was already written, or proofread a
// hook/caption/CTA for typos — small input boxes are a worse reading surface
// than plain text, and every tap risked an accidental edit. Reuses the exact
// sheet-group/sheet-cell layout PostSheet's edit form already uses, so
// switching between the two feels like the same surface, not two different
// screens. Also reuses PostSheet's own blurred-backdrop photo stage (not a
// fixed-aspect crop) — posts here are square (feed), vertical (Reels/
// Stories) and horizontal, and a fixed crop would butcher whichever shapes
// aren't that one ratio.
import { useRef, useState } from "react";
import { BottomSheet } from "../../components/BottomSheet";
import { useObjectUrl } from "../../components/PostPhoto";
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

/** A labeled block of read-only text with its own copy button — every field
 *  (title, hook, caption, CTA, hashtags) gets one, confirmed live
 *  2026-07-17, since proofreading one piece often means copying just that
 *  piece out to fix elsewhere, not the whole combined post text. */
function Field({
  label,
  value,
  copied,
  onCopy,
}: {
  label: string;
  value: string;
  copied: boolean;
  onCopy: () => void;
}) {
  if (!value.trim()) return null;
  return (
    <div className="postview-field">
      <div className="postview-field__head">
        <span className="postview-field__label">{label}</span>
        <button
          className="postview-copybtn"
          aria-label={`Copy ${label.toLowerCase()}`}
          onClick={onCopy}
        >
          {copied ? <IconCheck size={13} /> : <IconCopy size={13} />}
        </button>
      </div>
      <div className="sheet-group">
        <div className="sheet-cell">
          <p className="postview-text">{value}</p>
        </div>
      </div>
    </div>
  );
}

export function PostViewSheet({ open, post, onClose, onEdit }: Props) {
  const groups = useHashtagGroups((s) => s.items);
  const blob = useLocalImages((s) => (post ? s.map[post.id] : undefined));
  const objectUrl = useObjectUrl(blob);
  const [copiedField, setCopiedField] = useState("");
  const copyTimer = useRef<number>();

  // View mode only ever applies to an EXISTING post — creating new goes
  // straight to Edit (see usePostEditor's show()), so this should never
  // actually render with post=null, but keeps the component crash-proof if
  // it ever does mid-close-animation.
  if (!post) return null;

  const groupTags = groups.find((g) => g.id === post.hashtagGroupId)?.tags ?? "";
  const combined = combinedPostText(post, groupTags);
  const allTags = [groupTags.trim(), post.hashtags.trim()].filter(Boolean).join(" ");
  const photoSrc = objectUrl || post.image;
  const hasPhoto = !!photoSrc;
  const fill = post.cover || categoryColor(post.pillar);

  function copyValue(field: string, value: string) {
    void navigator.clipboard?.writeText(value).catch(() => {});
    setCopiedField(field);
    window.clearTimeout(copyTimer.current);
    copyTimer.current = window.setTimeout(() => setCopiedField(""), 1400);
  }

  return (
    <BottomSheet open={open} title="Post" onClose={onClose} action={{ label: "Edit", onClick: onEdit }}>
      {hasPhoto ? (
        <div className="postsheet-photostage postview-photostage">
          <img className="postsheet-photostage__blur" src={photoSrc} alt="" aria-hidden />
          <img className="postsheet-photostage__img" src={photoSrc} alt={post.idea || "Post photo"} />
          <span className="postview-photostage__pillar">{post.pillar || "No pillar"}</span>
        </div>
      ) : (
        <div className="postview-swatch" style={{ background: fill, color: swatchTextColor(fill) }}>
          {post.pillar || "No pillar"}
        </div>
      )}

      <div className="postview-titlerow">
        <h2 className="postview-idea">{post.idea || "Untitled post"}</h2>
        {post.idea && (
          <button
            className="postview-copybtn"
            aria-label="Copy title"
            onClick={() => copyValue("Title", post.idea)}
          >
            {copiedField === "Title" ? <IconCheck size={13} /> : <IconCopy size={13} />}
          </button>
        )}
      </div>
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

      <Field label="Hook" value={post.hook} copied={copiedField === "Hook"} onCopy={() => copyValue("Hook", post.hook)} />
      <Field label="Caption" value={post.caption} copied={copiedField === "Caption"} onCopy={() => copyValue("Caption", post.caption)} />
      <Field label="Call to action" value={post.cta} copied={copiedField === "Call to action"} onCopy={() => copyValue("Call to action", post.cta)} />
      <Field label="Hashtags" value={allTags} copied={copiedField === "Hashtags"} onCopy={() => copyValue("Hashtags", allTags)} />
      <Field label="Notes" value={post.notes} copied={copiedField === "Notes"} onCopy={() => copyValue("Notes", post.notes)} />

      {combined && (
        <button className="btn btn--ghost btn--stack" onClick={() => copyValue("All", combined)}>
          {copiedField === "All" ? <><IconCheck size={15} /> Copied everything</> : <><IconCopy size={15} /> Copy hook + caption + CTA + hashtags</>}
        </button>
      )}
    </BottomSheet>
  );
}
