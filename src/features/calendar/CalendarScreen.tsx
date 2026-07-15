// Content Calendar — a 6-week rolling view of every scheduled post (the
// Etsy listing's "Smart Calendar"). Start anywhere: pick a start date (snapped
// to the configured week start), page week by week, jump back to today.
// Highlight dates (Pay Day / Launch Day …) tint their cells and are managed
// in a card below the grid. The grid scrolls horizontally so the day cells stay
// big and readable on a phone. Tapping a day opens a popup with that day's
// posts and full in-place CRUD (add / edit / delete) via the shared PostSheet —
// no jumping away to the Scheduler.
import { useMemo, useRef, useState } from "react";
import { BottomSheet } from "../../components/BottomSheet";
import { PostPhoto, useObjectUrl } from "../../components/PostPhoto";
import { PostSheet } from "../scheduler/PostSheet";
import {
  IconCalendar,
  IconCamera,
  IconChevron,
  IconClose,
  IconEdit,
  IconPlus,
  IconStar,
  IconTrash,
} from "../../components/icons";
import { usePosts, useHighlights, useMoodBoardPins } from "../../stores/v2";
import { useLocalImages } from "../../stores/localImages";
import { useSettings } from "../../stores/useSettings";
import { confirmDialog } from "../../stores/useConfirm";
import { resizeImageFile } from "../../lib/localImage";
import { categoryColor, POST_FORMAT_LABEL, POST_STATUS_COLOR, POST_STATUS_LABEL } from "../../lib/ui";
import type { Highlight, MoodBoardPin, Post } from "../../lib/types";
import {
  addDaysISO,
  dayNum,
  format,
  fromISO,
  isValidISO,
  todayISO,
  weekDaysISO,
  weekdayShort,
} from "../../lib/dates";
import "../../styles/features/calendar.css";

const WEEKS_SHOWN = 6;
const MAX_CELL_POSTS = 4;

export function CalendarScreen() {
  const posts = usePosts((s) => s.items);
  const addPost = usePosts((s) => s.add);
  const updatePost = usePosts((s) => s.update);
  const removePost = usePosts((s) => s.remove);
  const highlights = useHighlights((s) => s.items);
  const addHighlight = useHighlights((s) => s.add);
  const removeHighlight = useHighlights((s) => s.remove);
  const moodBoardPins = useMoodBoardPins((s) => s.items);
  const addMoodBoardPin = useMoodBoardPins((s) => s.add);
  const removeMoodBoardPin = useMoodBoardPins((s) => s.remove);
  const weekStart = useSettings((s) => s.weekStart);

  const today = todayISO();
  // null = "this week" (recomputed if weekStart loads later); a string pins it.
  const [startSel, setStartSel] = useState<string | null>(null);
  const start = startSel ?? weekDaysISO(today, weekStart)[0];
  const end = addDaysISO(start, WEEKS_SHOWN * 7 - 1);

  const [daySel, setDaySel] = useState<string | null>(null);

  // In-place post editor (the same BottomSheet the Scheduler uses).
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorPost, setEditorPost] = useState<Post | null>(null);
  const [editorDate, setEditorDate] = useState("");

  // highlights manager form
  const [hlDate, setHlDate] = useState(today);
  const [hlLabel, setHlLabel] = useState("");
  // inline "add highlight" inside the day popup
  const [sheetHl, setSheetHl] = useState("");

  // mood board: one board per calendar month, keyed off the visible grid's
  // start date (a 6-week window can span two months — the first day shown
  // decides which board is "active", same anchor the toolbar's own range uses)
  const monthKey = start.slice(0, 7);
  const [moodAddOpen, setMoodAddOpen] = useState(false);
  const [viewPin, setViewPin] = useState<MoodBoardPin | null>(null);
  const [moodImage, setMoodImage] = useState("");
  const [moodNote, setMoodNote] = useState("");
  const [moodPendingBlob, setMoodPendingBlob] = useState<Blob | null>(null);
  const [moodPicking, setMoodPicking] = useState(false);
  const [moodError, setMoodError] = useState("");
  const moodFileInputRef = useRef<HTMLInputElement>(null);
  const moodPendingPreview = useObjectUrl(moodPendingBlob ?? undefined);

  const days = useMemo(
    () => Array.from({ length: WEEKS_SHOWN * 7 }, (_, i) => addDaysISO(start, i)),
    [start]
  );

  const postsMap = useMemo(() => {
    const map = new Map<string, Post[]>();
    for (const p of posts) {
      if (!p.date || p.date < start || p.date > end) continue;
      const list = map.get(p.date) ?? [];
      list.push(p);
      map.set(p.date, list);
    }
    const t = (s: string) => s || "99:99";
    for (const list of map.values()) list.sort((a, b) => t(a.time).localeCompare(t(b.time)));
    return map;
  }, [posts, start, end]);

  const hlMap = useMemo(() => {
    const map = new Map<string, Highlight[]>();
    for (const h of highlights) {
      const list = map.get(h.date) ?? [];
      list.push(h);
      map.set(h.date, list);
    }
    return map;
  }, [highlights]);

  const upcomingHls = useMemo(
    () =>
      [...highlights]
        .filter((h) => h.date >= today)
        .sort((a, b) => a.date.localeCompare(b.date)),
    [highlights, today]
  );

  const monthLabel = format(fromISO(`${monthKey}-01`), "MMMM yyyy");
  const monthPins = useMemo(
    () =>
      moodBoardPins
        .filter((p) => p.month === monthKey)
        .sort((a, b) => a.order - b.order || (a.createdAt < b.createdAt ? -1 : 1)),
    [moodBoardPins, monthKey]
  );

  const weekdayRow = days.slice(0, 7).map(weekdayShort);
  const isCurrentWeek = start === weekDaysISO(today, weekStart)[0];

  function pickStart(iso: string) {
    if (!isValidISO(iso)) return;
    setStartSel(weekDaysISO(iso, weekStart)[0]);
  }

  function openDay(date: string) {
    setSheetHl("");
    setDaySel(date);
  }

  // ---- in-place post CRUD ----
  function openEditor(post: Post | null, date: string) {
    setEditorPost(post);
    setEditorDate(date);
    setEditorOpen(true);
  }
  function saveEditor(patch: Partial<Post>): Post | void {
    setEditorOpen(false);
    if (editorPost) { updatePost(editorPost.id, patch); return undefined; }
    return addPost(patch);
  }
  function deleteEditor() {
    if (editorPost) {
      removePost(editorPost.id);
      void useLocalImages.getState().remove(editorPost.id);
    }
    setEditorOpen(false);
  }
  async function deletePostRow(p: Post) {
    const ok = await confirmDialog({
      title: `Delete "${p.idea || "this post"}"?`,
      message: "This can't be undone.",
      confirmLabel: "Delete",
      danger: true,
    });
    if (ok) {
      removePost(p.id);
      void useLocalImages.getState().remove(p.id);
    }
  }

  function saveSheetHighlight() {
    const label = sheetHl.trim();
    if (!label || !daySel) return;
    addHighlight({ date: daySel, label });
    setSheetHl("");
  }

  function saveManagerHighlight() {
    const label = hlLabel.trim();
    if (!label || !isValidISO(hlDate)) return;
    addHighlight({ date: hlDate, label });
    setHlLabel("");
  }

  // ---- mood board ----
  function openMoodAdd() {
    setMoodImage("");
    setMoodNote("");
    setMoodPendingBlob(null);
    setMoodError("");
    setMoodAddOpen(true);
  }
  function openMoodFilePicker() {
    moodFileInputRef.current?.click();
  }
  async function onMoodFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setMoodError("");
    setMoodPicking(true);
    try {
      setMoodPendingBlob(await resizeImageFile(file));
    } catch (err) {
      setMoodError(err instanceof Error ? err.message : "Couldn't read that photo. Try a different one.");
    } finally {
      setMoodPicking(false);
    }
  }
  function saveMoodPin() {
    if (!moodPendingBlob && !moodImage.trim()) return;
    const saved = addMoodBoardPin({
      month: monthKey,
      image: moodImage.trim(),
      note: moodNote.trim(),
      order: monthPins.length,
    });
    // Local device photos share the SAME blob store posts use (see
    // stores/localImages.ts) — it's keyed generically by id -> Blob, nothing
    // post-specific about it, so reusing it here needs no new infrastructure.
    if (moodPendingBlob) void useLocalImages.getState().set(saved.id, moodPendingBlob);
    setMoodAddOpen(false);
  }
  async function deleteMoodPin(pin: MoodBoardPin) {
    const ok = await confirmDialog({
      title: "Remove this pin?",
      message: "This can't be undone.",
      confirmLabel: "Remove",
      danger: true,
    });
    if (ok) {
      removeMoodBoardPin(pin.id);
      void useLocalImages.getState().remove(pin.id);
    }
  }

  const dayPosts = daySel ? postsMap.get(daySel) ?? [] : [];
  const dayHls = daySel ? hlMap.get(daySel) ?? [] : [];

  return (
    <>
      <div className="screen-head">
        <div className="screen-head__eyebrow">Six weeks at a glance</div>
        <h1 className="screen-head__title">Content Calendar</h1>
      </div>

      <div className="cal-toolbar" data-tour="cal-toolbar">
        <button
          className="cal-navbtn"
          aria-label="Previous week"
          onClick={() => setStartSel(addDaysISO(start, -7))}
        >
          <IconChevron size={18} className="ic-flip" />
        </button>
        <button
          className="cal-navbtn"
          aria-label="Next week"
          onClick={() => setStartSel(addDaysISO(start, 7))}
        >
          <IconChevron size={18} />
        </button>
        <span className="cal-toolbar__range">
          {format(fromISO(start), "MMM d")} to {format(fromISO(end), "MMM d, yyyy")}
        </span>
        <input
          className="cal-datepick"
          type="date"
          value={start}
          aria-label="Calendar start date"
          onChange={(e) => pickStart(e.target.value)}
        />
        {!isCurrentWeek && (
          <button className="chip" onClick={() => setStartSel(null)}>
            Today
          </button>
        )}
      </div>

      <div className="card cal-gridcard" data-tour="cal-grid">
        <div className="cal-scroll">
          <div className="cal-grid">
            {weekdayRow.map((w) => (
              <div key={w} className="cal-dow">
                {w}
              </div>
            ))}
            {days.map((date, i) => {
              const dPosts = postsMap.get(date) ?? [];
              const dHls = hlMap.get(date) ?? [];
              const isToday = date === today;
              return (
                <div
                  key={date}
                  role="button"
                  tabIndex={0}
                  aria-label={`${format(fromISO(date), "EEEE, MMM d")}, ${dPosts.length} post${dPosts.length === 1 ? "" : "s"}`}
                  className={`cal-cell${isToday ? " cal-cell--today" : ""}${dHls.length ? " cal-cell--hl" : ""}`}
                  onClick={() => openDay(date)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && e.target === e.currentTarget) openDay(date);
                  }}
                >
                  <span className="cal-cell__head">
                    <span className="cal-daynum">{dayNum(date)}</span>
                    {(dayNum(date) === 1 || i === 0) && (
                      <span className="cal-monthtag">{format(fromISO(date), "MMM")}</span>
                    )}
                  </span>
                  {dHls.map((h) => (
                    <span key={h.id} className="cal-hl" title={h.label}>
                      {h.label}
                    </span>
                  ))}
                  {dPosts.slice(0, MAX_CELL_POSTS).map((p) => (
                    <button
                      key={p.id}
                      className="cal-post"
                      style={{ borderLeftColor: categoryColor(p.pillar) }}
                      title={`${p.time ? p.time + " · " : ""}${POST_FORMAT_LABEL[p.format]} · ${p.idea || "Untitled"} (${POST_STATUS_LABEL[p.status]})`}
                      onClick={(e) => {
                        e.stopPropagation();
                        openEditor(p, p.date);
                      }}
                    >
                      <span
                        className="cal-post__dot"
                        style={{ background: POST_STATUS_COLOR[p.status] }}
                      />
                      <span className="cal-post__txt">
                        {p.time && <span className="cal-post__time">{p.time} </span>}
                        {POST_FORMAT_LABEL[p.format]} · {p.idea || "Untitled"}
                      </span>
                    </button>
                  ))}
                  {dPosts.length > MAX_CELL_POSTS && (
                    <span className="cal-more">+{dPosts.length - MAX_CELL_POSTS} more</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Mood board + highlight dates: stacked on phones, side by side on
          desktop so neither card stretches across the full content width. */}
      <div className="cal-below">
      <div className="cal-below__col">
      {/* Mood board — pinned inspiration for the visible month */}
      <div className="section-title">Mood board · {monthLabel}</div>
      <div className="card" data-tour="cal-moodboard">
        {monthPins.length === 0 && (
          <div className="muted fs-13" style={{ marginBottom: 8 }}>
            Pin palettes, references, anything that sets the vibe for {monthLabel}.
          </div>
        )}
        <div className="cal-mood-row">
          {monthPins.map((pin) => (
            <div key={pin.id} className="cal-mood-pin">
              <button
                className="cal-mood-pin__view"
                aria-label={`View ${pin.note || "this pin"} full size`}
                onClick={() => setViewPin(pin)}
              >
                <PostPhoto postId={pin.id} fallbackUrl={pin.image} alt={pin.note} />
                {pin.note && <span className="cal-mood-pin__note">{pin.note}</span>}
              </button>
              <button
                className="cal-mood-pin__del"
                aria-label={`Remove ${pin.note || "this pin"}`}
                onClick={() => deleteMoodPin(pin)}
              >
                <IconClose size={12} />
              </button>
            </div>
          ))}
          <button className="cal-mood-add" aria-label="Pin an image" onClick={openMoodAdd}>
            <IconPlus size={18} />
          </button>
        </div>
      </div>
      </div>

      <div className="cal-below__col">
      {/* Highlight dates manager */}
      <div className="section-title">Highlight dates</div>
      <div className="card" data-tour="cal-highlights">
        {upcomingHls.length === 0 && (
          <div className="muted fs-13">
            Mark the days that matter: Pay Day, a launch, a trip, and they glow
            on the calendar.
          </div>
        )}
        {upcomingHls.map((h) => (
          <div key={h.id} className="cal-hlrow">
            <span className="cal-hlrow__date">{format(fromISO(h.date), "EEE, MMM d")}</span>
            <span className="cal-hlrow__label">
              <IconStar size={13} style={{ verticalAlign: -2, marginRight: 4 }} />
              {h.label}
            </span>
            <button
              className="cal-hlrow__del"
              aria-label={`Delete highlight ${h.label}`}
              onClick={() => removeHighlight(h.id)}
            >
              <IconTrash size={16} />
            </button>
          </div>
        ))}
        <div className="cal-hlform">
          <input
            className="input"
            type="date"
            value={hlDate}
            aria-label="Highlight date"
            onChange={(e) => setHlDate(e.target.value)}
          />
          <input
            className="input"
            value={hlLabel}
            placeholder="e.g. Pay Day"
            aria-label="Highlight label"
            onChange={(e) => setHlLabel(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && saveManagerHighlight()}
          />
          <button
            className="btn btn--primary btn--auto"
            onClick={saveManagerHighlight}
            disabled={!hlLabel.trim() || !isValidISO(hlDate)}
          >
            Add
          </button>
        </div>
      </div>
      </div>
      </div>

      {/* Day popup — full in-place CRUD for the day */}
      <BottomSheet
        open={!!daySel}
        title={daySel ? format(fromISO(daySel), "EEEE, MMM d") : ""}
        onClose={() => setDaySel(null)}
      >
        {daySel && (
          <>
            {dayHls.map((h) => (
              <div key={h.id} className="cal-hlrow">
                <span className="cal-hlrow__label">
                  <IconStar size={13} style={{ verticalAlign: -2, marginRight: 4 }} />
                  {h.label}
                </span>
                <button
                  className="cal-hlrow__del"
                  aria-label={`Delete highlight ${h.label}`}
                  onClick={() => removeHighlight(h.id)}
                >
                  <IconTrash size={16} />
                </button>
              </div>
            ))}
            {dayPosts.length === 0 && (
              <div className="muted fs-13" style={{ padding: "8px 0" }}>
                Nothing planned for this day yet. Add your first post below.
              </div>
            )}
            {dayPosts.map((p) => (
              <div key={p.id} className="cal-dayrow">
                <button
                  className="cal-dayrow__main"
                  onClick={() => openEditor(p, p.date)}
                >
                  <span
                    className="cal-sheetrow__bar"
                    style={{ background: categoryColor(p.pillar) }}
                  />
                  <span
                    className="cal-dayrow__thumb"
                    style={{ background: p.cover || categoryColor(p.pillar) }}
                  >
                    <PostPhoto postId={p.id} fallbackUrl={p.image} alt="" />
                  </span>
                  <span className="cal-sheetrow__body">
                    <span className="cal-sheetrow__title">{p.idea || "Untitled"}</span>
                    <span className="cal-sheetrow__sub">
                      <span
                        className="cal-post__dot"
                        style={{ background: POST_STATUS_COLOR[p.status] }}
                      />
                      {POST_STATUS_LABEL[p.status]}
                      {p.time && ` · ${p.time}`} · {POST_FORMAT_LABEL[p.format]}
                      {p.pillar && ` · ${p.pillar}`}
                    </span>
                  </span>
                </button>
                <button
                  className="cal-dayrow__act"
                  aria-label={`Edit ${p.idea || "post"}`}
                  onClick={() => openEditor(p, p.date)}
                >
                  <IconEdit size={16} />
                </button>
                <button
                  className="cal-dayrow__act cal-dayrow__act--del"
                  aria-label={`Delete ${p.idea || "post"}`}
                  onClick={() => deletePostRow(p)}
                >
                  <IconTrash size={16} />
                </button>
              </div>
            ))}
            <div className="cal-sheet__actions">
              <button className="btn btn--primary" onClick={() => openEditor(null, daySel)}>
                <IconPlus size={16} /> Add post
              </button>
            </div>
            <div className="cal-addhl">
              <input
                className="input"
                value={sheetHl}
                placeholder="Add a highlight (e.g. Launch Day)"
                aria-label="New highlight label"
                onChange={(e) => setSheetHl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && saveSheetHighlight()}
              />
              <button
                className="btn btn--auto"
                onClick={saveSheetHighlight}
                disabled={!sheetHl.trim()}
              >
                <IconCalendar size={15} /> Highlight
              </button>
            </div>
          </>
        )}
      </BottomSheet>

      {/* The shared post editor, layered above the day popup */}
      <PostSheet
        open={editorOpen}
        post={editorPost}
        prefillDate={editorDate}
        onClose={() => setEditorOpen(false)}
        onSave={saveEditor}
        onDelete={editorPost ? deleteEditor : undefined}
      />

      {/* Add a mood board pin: device photo (primary) or a pasted image link */}
      <BottomSheet open={moodAddOpen} title="Pin an image" onClose={() => setMoodAddOpen(false)}>
        <div className="field">
          <span className="field__label">Photo</span>
          {moodPendingPreview ? (
            <div className="cal-mood-preview">
              <img src={moodPendingPreview} alt="Pin preview" />
              <button
                type="button"
                className="cal-mood-preview__remove"
                onClick={() => setMoodPendingBlob(null)}
              >
                <IconClose size={13} /> Remove
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="cal-mood-photopick"
              onClick={openMoodFilePicker}
              disabled={moodPicking}
            >
              <IconCamera size={22} />
              {moodPicking ? "Reading photo…" : "Choose from device"}
            </button>
          )}
          <input
            ref={moodFileInputRef}
            type="file"
            accept="image/*"
            hidden
            onChange={onMoodFileChange}
          />
          {moodError && (
            <div className="fs-13" style={{ color: "var(--alert)", marginTop: 6 }}>
              {moodError}
            </div>
          )}
          {moodPendingBlob && (
            <div className="muted fs-12 mt-1">Saved on this device only, won't sync to other devices.</div>
          )}
          <details className="cal-mood-urlfallback">
            <summary>Or paste an image link instead</summary>
            <input
              className="input"
              type="url"
              inputMode="url"
              value={moodImage}
              onChange={(e) => setMoodImage(e.target.value)}
              placeholder="https://…"
            />
          </details>
        </div>
        <div className="field">
          <label className="field__label" htmlFor="mood-note">Note (optional)</label>
          <input
            id="mood-note"
            className="input"
            value={moodNote}
            onChange={(e) => setMoodNote(e.target.value)}
            placeholder="e.g. This month's palette"
          />
        </div>
        <button
          className="btn btn--primary"
          onClick={saveMoodPin}
          disabled={!moodPendingBlob && !moodImage.trim()}
        >
          Pin it
        </button>
      </BottomSheet>

      {/* Full-size pin viewer: tap any mood board thumbnail to open it big. */}
      <BottomSheet
        open={!!viewPin}
        title={viewPin?.note || "Mood board pin"}
        onClose={() => setViewPin(null)}
      >
        {viewPin && (
          <>
            <div className="cal-mood-view">
              <PostPhoto postId={viewPin.id} fallbackUrl={viewPin.image} alt={viewPin.note} />
            </div>
            <button
              className="btn btn--danger"
              onClick={() => {
                const pin = viewPin;
                setViewPin(null);
                void deleteMoodPin(pin);
              }}
            >
              Remove pin
            </button>
          </>
        )}
      </BottomSheet>
    </>
  );
}
