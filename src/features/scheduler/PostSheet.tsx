// The post editor — a BottomSheet covering every Post field: idea, date/time,
// pillar, format, goal, status, hook/caption/cta, hashtag group + extras,
// platforms, photo, cover swatch, notes. Used by the Scheduler, the Calendar's
// day popup (and deep links) — one editor, every entry point.
import { useEffect, useRef, useState } from "react";
import { BottomSheet } from "../../components/BottomSheet";
import { Chip, ChipRow } from "../../components/Chip";
import { Segmented } from "../../components/Segmented";
import { useObjectUrl } from "../../components/PostPhoto";
import { IconCamera, IconClose } from "../../components/icons";
import { useHashtagGroups, usePlatforms } from "../../stores/v2";
import { useLocalImages } from "../../stores/localImages";
import { useSettings } from "../../stores/useSettings";
import { confirmDialog } from "../../stores/useConfirm";
import { resizeImageFile } from "../../lib/localImage";
import {
  categoryColor,
  PICKABLE_CATEGORY_COLORS,
  POST_FORMAT_LABEL,
  POST_STATUS_COLOR,
  POST_STATUS_LABEL,
} from "../../lib/ui";
import { todayISO } from "../../lib/dates";
import {
  POST_FORMATS,
  POST_STATUSES,
  type Post,
  type PostFormat,
  type PostStatus,
} from "../../lib/types";

interface Props {
  open: boolean;
  post: Post | null;
  /** yyyy-mm-dd to prefill a NEW post's date ("" = today). Ignored when editing. */
  prefillDate?: string;
  onClose: () => void;
  /** Returns the saved post when it creates a NEW row (so a pending device
   *  photo, picked before the post had an id, can be filed under the real
   *  one) — void when updating an existing post (its id was already known). */
  onSave: (patch: Partial<Post>) => Post | void;
  onDelete?: () => void;
}

const FORMAT_OPTIONS = POST_FORMATS.map((f) => ({ value: f, label: POST_FORMAT_LABEL[f] }));

export function PostSheet({ open, post, prefillDate, onClose, onSave, onDelete }: Props) {
  const groups = useHashtagGroups((s) => s.items);
  const platforms = usePlatforms((s) => s.items);
  const { categories, goals } = useSettings();
  const existingLocalBlob = useLocalImages((s) => (post ? s.map[post.id] : undefined));

  const [idea, setIdea] = useState("");
  const [date, setDate] = useState(todayISO());
  const [time, setTime] = useState("");
  const [pillar, setPillar] = useState("");
  const [customPillar, setCustomPillar] = useState("");
  const [fmt, setFmt] = useState<PostFormat>("post");
  const [goal, setGoal] = useState("");
  const [status, setStatus] = useState<PostStatus>("notstarted");
  const [hook, setHook] = useState("");
  const [caption, setCaption] = useState("");
  const [cta, setCta] = useState("");
  const [groupId, setGroupId] = useState("");
  const [hashtags, setHashtags] = useState("");
  const [postPlatforms, setPostPlatforms] = useState<string[]>([]);
  const [image, setImage] = useState("");
  const [imgBroken, setImgBroken] = useState(false);
  const [cover, setCover] = useState("");
  const [notes, setNotes] = useState("");

  // ---- device photo picking ----
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingBlob, setPendingBlob] = useState<Blob | null>(null);
  const [photoCleared, setPhotoCleared] = useState(false);
  const [photoError, setPhotoError] = useState("");
  const [picking, setPicking] = useState(false);
  const pendingPreview = useObjectUrl(pendingBlob ?? undefined);
  const existingPreview = useObjectUrl(photoCleared ? undefined : existingLocalBlob);
  const hasLocalPhoto = !!pendingBlob || (!photoCleared && !!existingLocalBlob);
  // A pasted image URL previews here too (same priority as PostPhoto: local
  // device photo beats a URL) — otherwise a post whose only photo is a URL
  // (e.g. picked before this device existed) looks photo-less until the
  // "paste a link" disclosure is expanded by hand.
  const urlPreview = !hasLocalPhoto && image.trim() !== "" && !imgBroken ? image.trim() : "";
  const photoPreview = pendingPreview || existingPreview || urlPreview;

  useEffect(() => {
    if (!open) return;
    setIdea(post?.idea ?? "");
    setDate(post ? post.date : prefillDate || todayISO());
    setTime(post?.time ?? "");
    const pil = post?.pillar ?? "";
    setPillar(pil);
    setCustomPillar(pil && !categories.includes(pil) ? pil : "");
    setFmt(post?.format ?? "post");
    setGoal(post?.goal ?? "");
    setStatus(post?.status ?? "notstarted");
    setHook(post?.hook ?? "");
    setCaption(post?.caption ?? "");
    setCta(post?.cta ?? "");
    setGroupId(post?.hashtagGroupId ?? "");
    setHashtags(post?.hashtags ?? "");
    setPostPlatforms(post?.platforms ?? []);
    setImage(post?.image ?? "");
    setImgBroken(false);
    setCover(post?.cover ?? "");
    setNotes(post?.notes ?? "");
    setPendingBlob(null);
    setPhotoCleared(false);
    setPhotoError("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const activePlatforms = platforms
    .filter((p) => p.active)
    .sort((a, b) => a.order - b.order);
  const selectedGroup = groups.find((g) => g.id === groupId);
  const sortedGroups = [...groups].sort((a, b) => a.order - b.order);

  function togglePlatform(name: string) {
    setPostPlatforms((cur) =>
      cur.includes(name) ? cur.filter((p) => p !== name) : [...cur, name]
    );
  }

  function pickCustomPillar(v: string) {
    setCustomPillar(v);
    setPillar(v.trim());
  }

  function openFilePicker() {
    fileInputRef.current?.click();
  }

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // let picking the same file again re-fire onChange
    if (!file) return;
    setPhotoError("");
    setPicking(true);
    try {
      const blob = await resizeImageFile(file);
      setPendingBlob(blob);
      setPhotoCleared(false);
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : "Couldn't read that photo. Try a different one.");
    } finally {
      setPicking(false);
    }
  }

  function removePhoto() {
    setPendingBlob(null);
    setPhotoCleared(true);
    setImage("");
    setPhotoError("");
  }

  function submit() {
    if (!idea.trim()) return;
    const saved = onSave({
      idea: idea.trim(),
      date,
      time,
      pillar: pillar.trim(),
      format: fmt,
      goal,
      status,
      hook,
      caption,
      cta,
      hashtagGroupId: groupId,
      hashtags: hashtags.trim(),
      platforms: postPlatforms,
      image: image.trim(),
      cover,
      notes: notes.trim(),
    });
    // A device photo was staged in local state (not IndexedDB yet) so a brand
    // new post — which has no id until onSave creates it — has somewhere to
    // land. Commit it now that the real id is known either way.
    const targetId = post?.id ?? saved?.id;
    if (targetId) {
      if (pendingBlob) void useLocalImages.getState().set(targetId, pendingBlob);
      else if (photoCleared) void useLocalImages.getState().remove(targetId);
    }
  }

  async function confirmDelete() {
    if (!onDelete) return;
    const ok = await confirmDialog({
      title: "Delete this post?",
      message: "This can't be undone.",
      confirmLabel: "Delete",
      danger: true,
    });
    if (ok) onDelete();
  }

  return (
    <BottomSheet
      open={open}
      title={post ? "Edit Post" : "New Post"}
      onClose={onClose}
      action={{ label: post ? "Save" : "Add", onClick: submit, disabled: !idea.trim() }}
    >
      <span className="sheet-section-label">Idea</span>
      <div className="sheet-group">
        <div className="sheet-cell sheet-cell--field">
          <input
            id="ps-idea"
            className="input"
            autoFocus
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            placeholder="e.g. 3 tools I can't work without"
            aria-label="Idea"
          />
        </div>
      </div>

      <span className="sheet-section-label">Schedule</span>
      <div className="sheet-group">
        <label className="sheet-cell sheet-cell--row" htmlFor="ps-date">
          <span className="sheet-cell__label">Date</span>
          <input
            id="ps-date"
            className="input"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <label className="sheet-cell sheet-cell--row" htmlFor="ps-time">
          <span className="sheet-cell__label">Time</span>
          <input
            id="ps-time"
            className="input"
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
          />
        </label>
      </div>

      <span className="sheet-section-label">Details</span>
      <div className="sheet-group">
        <div className="sheet-cell">
          <span className="postsheet-minilabel">Pillar</span>
          <ChipRow>
            {categories.map((c) => (
              <Chip
                key={c}
                active={pillar === c}
                dotColor={categoryColor(c)}
                onClick={() => {
                  setPillar(pillar === c ? "" : c);
                  setCustomPillar("");
                }}
              >
                {c}
              </Chip>
            ))}
          </ChipRow>
          <input
            className="input postsheet-custom"
            value={customPillar}
            onChange={(e) => pickCustomPillar(e.target.value)}
            placeholder="Or type a custom pillar"
            aria-label="Custom pillar"
          />
        </div>
        <div className="sheet-cell">
          <span className="postsheet-minilabel">Format</span>
          <Segmented options={FORMAT_OPTIONS} value={fmt} onChange={setFmt} />
        </div>
        <div className="sheet-cell">
          <span className="postsheet-minilabel">Goal</span>
          <ChipRow>
            {goals.map((g) => (
              <Chip key={g} active={goal === g} onClick={() => setGoal(goal === g ? "" : g)}>
                {g}
              </Chip>
            ))}
          </ChipRow>
        </div>
        <div className="sheet-cell">
          <span className="postsheet-minilabel">Status</span>
          <ChipRow>
            {POST_STATUSES.map((s) => (
              <Chip
                key={s}
                active={status === s}
                dotColor={POST_STATUS_COLOR[s]}
                onClick={() => setStatus(s)}
              >
                {POST_STATUS_LABEL[s]}
              </Chip>
            ))}
          </ChipRow>
        </div>
      </div>

      <span className="sheet-section-label">Content</span>
      <div className="sheet-group">
        <div className="sheet-cell sheet-cell--field">
          <label className="postsheet-minilabel" htmlFor="ps-hook">Hook</label>
          <textarea
            id="ps-hook"
            className="input postsheet-ta--sm"
            value={hook}
            onChange={(e) => setHook(e.target.value)}
            placeholder="The scroll-stopping first line"
          />
        </div>
        <div className="sheet-cell sheet-cell--field">
          <label className="postsheet-minilabel" htmlFor="ps-caption">Caption</label>
          <textarea
            id="ps-caption"
            className="input postsheet-ta"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="The main body text"
          />
        </div>
        <div className="sheet-cell sheet-cell--field">
          <label className="postsheet-minilabel" htmlFor="ps-cta">Call to action</label>
          <textarea
            id="ps-cta"
            className="input postsheet-ta--sm"
            value={cta}
            onChange={(e) => setCta(e.target.value)}
            placeholder="e.g. Save this for later"
          />
        </div>
      </div>

      <span className="sheet-section-label">Hashtags</span>
      <div className="sheet-group">
        <label className="sheet-cell sheet-cell--row" htmlFor="ps-group">
          <span className="sheet-cell__label">Group</span>
          <select
            id="ps-group"
            className="input"
            value={groupId}
            onChange={(e) => setGroupId(e.target.value)}
          >
            <option value="">None</option>
            {sortedGroups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name || "Untitled group"}
              </option>
            ))}
          </select>
        </label>
        {selectedGroup && selectedGroup.tags && (
          <div className="sheet-cell postsheet-tags">{selectedGroup.tags}</div>
        )}
        <div className="sheet-cell sheet-cell--field">
          <label className="postsheet-minilabel" htmlFor="ps-tags">Extra hashtags</label>
          <input
            id="ps-tags"
            className="input"
            value={hashtags}
            onChange={(e) => setHashtags(e.target.value)}
            placeholder="#extra #tags"
          />
        </div>
      </div>

      <span className="sheet-section-label">Platforms</span>
      <div className="sheet-group">
        <div className="sheet-cell">
          {activePlatforms.length === 0 ? (
            <div className="muted fs-13">No active platforms yet. Add some in Settings.</div>
          ) : (
            <div className="postsheet-platforms">
              {activePlatforms.map((p) => (
                <Chip
                  key={p.id}
                  active={postPlatforms.includes(p.name)}
                  onClick={() => togglePlatform(p.name)}
                >
                  {p.name}
                </Chip>
              ))}
            </div>
          )}
        </div>
      </div>

      <span className="sheet-section-label">Photo</span>
      {photoPreview ? (
        <div className="postsheet-photostage">
          <img
            className="postsheet-photostage__blur"
            src={photoPreview}
            alt=""
            aria-hidden
          />
          <img
            className="postsheet-photostage__img"
            src={photoPreview}
            alt="Post photo preview"
            onError={() => { if (!hasLocalPhoto) setImgBroken(true); }}
          />
          <div className="postsheet-photostage__tools">
            <button
              type="button"
              className="postsheet-phototool"
              onClick={openFilePicker}
              disabled={picking}
            >
              <IconCamera size={13} /> {picking ? "Reading…" : "Replace"}
            </button>
            <button
              type="button"
              className="postsheet-phototool"
              onClick={removePhoto}
            >
              <IconClose size={13} /> Remove
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="postsheet-photopick"
          onClick={openFilePicker}
          disabled={picking}
        >
          <span className="postsheet-photopick__ico">
            <IconCamera size={20} />
          </span>
          <span className="postsheet-photopick__title">
            {picking ? "Reading photo…" : "Add a photo"}
          </span>
          <span className="postsheet-photopick__sub">
            Any shape works: square, portrait or landscape
          </span>
        </button>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={onFileChange}
      />
      {photoError && (
        <div className="postsheet-imgnote" style={{ color: "var(--alert)" }}>
          {photoError}
        </div>
      )}
      {hasLocalPhoto && (
        <div className="muted fs-12 mt-1">Saved on this device only, won't sync to other devices.</div>
      )}
      <details className="postsheet-urlfallback">
        <summary>Or paste an image link instead</summary>
        <input
          id="ps-image"
          className="input"
          type="url"
          inputMode="url"
          value={image}
          onChange={(e) => { setImage(e.target.value); setImgBroken(false); }}
          placeholder="https://…"
        />
        {image.trim() !== "" && imgBroken && (
          <div className="postsheet-imgnote muted fs-13">
            That link didn't load. The tile will use the cover color instead.
          </div>
        )}
      </details>

      <span className="sheet-section-label">Cover color</span>
      <div className="sheet-group">
        <div className="sheet-cell">
          <div className="muted fs-13" style={{ marginBottom: 8 }}>
            Shown on the feed tile when there's no photo.
          </div>
          <div className="postsheet-swatches">
            <button
              className={`postsheet-swatch postsheet-swatch--auto${cover === "" ? " postsheet-swatch--on" : ""}`}
              onClick={() => setCover("")}
              aria-label="Auto (by pillar)"
              title="Auto (by pillar)"
            >
              A
            </button>
            {PICKABLE_CATEGORY_COLORS.map((c) => (
              <button
                key={c}
                className={`postsheet-swatch${cover === c ? " postsheet-swatch--on" : ""}`}
                style={{ background: c }}
                onClick={() => setCover(c)}
                aria-label={`Cover color ${c}`}
              />
            ))}
          </div>
        </div>
      </div>

      <span className="sheet-section-label">Notes</span>
      <div className="sheet-group">
        <div className="sheet-cell sheet-cell--field">
          <textarea
            id="ps-notes"
            className="input postsheet-ta--sm"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Anything future-you should know"
            aria-label="Notes"
          />
        </div>
      </div>

      {onDelete && (
        <div className="sheet-group" style={{ marginTop: "var(--sp-5)" }}>
          <button className="sheet-cell--destructive" onClick={confirmDelete}>
            Delete Post
          </button>
        </div>
      )}
    </BottomSheet>
  );
}
