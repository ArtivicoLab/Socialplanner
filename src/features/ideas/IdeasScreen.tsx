// Content Idea Bank — park every spark, then promote the good ones straight
// into the scheduler with one tap.
import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { BottomSheet } from "../../components/BottomSheet";
import { Chip, ChipRow } from "../../components/Chip";
import { EmptyState } from "../../components/EmptyState";
import { Segmented } from "../../components/Segmented";
import {
  IconArrowRight,
  IconCheck,
  IconIdea,
  IconPlus,
  IconSearch,
  IconTrash,
} from "../../components/icons";
import { useIdeas, usePosts } from "../../stores/v2";
import { useSettings } from "../../stores/useSettings";
import { categoryColor, POST_FORMAT_LABEL } from "../../lib/ui";
import { POST_FORMATS, type Idea, type PostFormat } from "../../lib/types";
import { openPostEditor } from "../../stores/usePostEditor";
import "../../styles/features/ideas.css";

type UsedFilter = "all" | "unused" | "used";

const USED_OPTIONS: { value: UsedFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "unused", label: "Unused" },
  { value: "used", label: "Used" },
];

const FORMAT_OPTIONS = POST_FORMATS.map((f) => ({
  value: f,
  label: POST_FORMAT_LABEL[f],
}));

export function IdeasScreen() {
  const { items, add, update, remove } = useIdeas();
  const addPost = usePosts((s) => s.add);
  const categories = useSettings((s) => s.categories);

  const [usedFilter, setUsedFilter] = useState<UsedFilter>("all");
  const [pillarFilter, setPillarFilter] = useState("");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Idea | null>(null);

  const unusedCount = useMemo(() => items.filter((i) => !i.used).length, [items]);
  const usedCount = items.length - unusedCount;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items
      .filter((i) => {
        if (usedFilter === "unused" && i.used) return false;
        if (usedFilter === "used" && !i.used) return false;
        if (pillarFilter && i.pillar !== pillarFilter) return false;
        if (q && !i.title.toLowerCase().includes(q) && !i.notes.toLowerCase().includes(q))
          return false;
        return true;
      })
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)); // newest first
  }, [items, usedFilter, pillarFilter, query]);

  const schedule = (idea: Idea) => {
    const post = addPost({
      idea: idea.title,
      pillar: idea.pillar,
      format: idea.format,
      notes: idea.notes,
      date: "", // parked in the scheduler until the user picks a day
    });
    update(idea.id, { used: true });
    openPostEditor(post);
  };

  return (
    <>
      <div className="screen-head">
        <div className="screen-head__eyebrow">Idea bank</div>
        <h1 className="screen-head__title">Ideas</h1>
      </div>

      {items.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<IconIdea size={28} />}
            title="Park every spark here"
            sub="Shower thought, trending audio, half-formed hook: save it now, shape it later, schedule it when it's ready."
          >
            <button
              className="btn btn--primary"
              onClick={() => {
                setEdit(null);
                setOpen(true);
              }}
            >
              Save an idea
            </button>
          </EmptyState>
        </div>
      ) : (
        <>
          <div className="ideas-stats">
            <div className="ideas-stat">
              <span className="ideas-stat__num">{items.length}</span>
              <span className="ideas-stat__label">
                Idea{items.length === 1 ? "" : "s"}
              </span>
            </div>
            <div className="ideas-stat">
              <span className="ideas-stat__num">{unusedCount}</span>
              <span className="ideas-stat__label">To schedule</span>
            </div>
            <div className="ideas-stat">
              <span className="ideas-stat__num">{usedCount}</span>
              <span className="ideas-stat__label">Already used</span>
            </div>
          </div>

          <div className="ideas-filters">
            <Segmented options={USED_OPTIONS} value={usedFilter} onChange={setUsedFilter} />
            <ChipRow>
              <Chip active={!pillarFilter} onClick={() => setPillarFilter("")}>
                All pillars
              </Chip>
              {categories.map((c) => (
                <Chip
                  key={c}
                  active={pillarFilter === c}
                  dotColor={categoryColor(c)}
                  onClick={() => setPillarFilter(pillarFilter === c ? "" : c)}
                >
                  {c}
                </Chip>
              ))}
            </ChipRow>
            {items.length > 6 && (
              <div className="ideas-search">
                <IconSearch size={15} aria-hidden />
                <input
                  className="ideas-search__input"
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search ideas or notes"
                  aria-label="Search ideas"
                />
              </div>
            )}
          </div>

          <div className="ideas-grid" data-tour="ideas-list">
            {filtered.length === 0 ? (
              <p className="muted ideas-none">Nothing matches these filters.</p>
            ) : (
              filtered.map((i) => {
                const tint = i.pillar ? categoryColor(i.pillar) : "var(--hairline)";
                return (
                  <article
                    key={i.id}
                    className={`card idea-card${i.used ? " idea-card--used" : ""}`}
                    style={{ "--tint": tint } as CSSProperties}
                  >
                    <button
                      className="idea-card__main"
                      onClick={() => {
                        setEdit(i);
                        setOpen(true);
                      }}
                    >
                      <div className="idea-card__head">
                        <span className="idea-card__title">
                          {i.title || "Untitled idea"}
                        </span>
                        {i.used && (
                          <span className="idea-card__done" aria-label="Already used">
                            <IconCheck size={13} />
                          </span>
                        )}
                      </div>
                      {i.notes && <p className="idea-card__notes">{i.notes}</p>}
                      <div className="idea-card__meta">
                        {i.pillar && (
                          <span className="ideas-pill">
                            <span
                              className="ideas-pill__dot"
                              style={{ background: tint }}
                              aria-hidden
                            />
                            {i.pillar}
                          </span>
                        )}
                        <span className="ideas-pill">{POST_FORMAT_LABEL[i.format]}</span>
                      </div>
                    </button>
                    {!i.used && (
                      <button
                        className="idea-card__schedule"
                        onClick={() => schedule(i)}
                        aria-label={`Schedule "${i.title || "idea"}"`}
                      >
                        Schedule
                        <IconArrowRight size={14} />
                      </button>
                    )}
                  </article>
                );
              })
            )}
          </div>
        </>
      )}

      {items.length > 0 && (
        <button
          className="fab"
          aria-label="Add idea"
          data-tour="ideas-fab"
          onClick={() => {
            setEdit(null);
            setOpen(true);
          }}
        >
          <IconPlus />
        </button>
      )}

      <IdeaSheet
        open={open}
        idea={edit}
        categories={categories}
        onClose={() => setOpen(false)}
        onSave={(patch) => {
          if (edit) update(edit.id, patch);
          else add(patch);
          setOpen(false);
        }}
        onDelete={
          edit
            ? () => {
                remove(edit.id);
                setOpen(false);
              }
            : undefined
        }
      />
    </>
  );
}

function IdeaSheet({
  open,
  idea,
  categories,
  onClose,
  onSave,
  onDelete,
}: {
  open: boolean;
  idea: Idea | null;
  categories: string[];
  onClose: () => void;
  onSave: (patch: Partial<Idea>) => void;
  onDelete?: () => void;
}) {
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [pillar, setPillar] = useState("");
  const [format, setFormat] = useState<PostFormat>("post");

  useEffect(() => {
    if (!open) return;
    setTitle(idea?.title ?? "");
    setNotes(idea?.notes ?? "");
    setPillar(idea?.pillar ?? "");
    setFormat(idea?.format ?? "post");
  }, [open, idea]);

  return (
    <BottomSheet
      open={open}
      title={idea ? "Edit Idea" : "New Idea"}
      onClose={onClose}
      action={{
        label: idea ? "Save" : "Add",
        disabled: !title.trim(),
        onClick: () => onSave({ title: title.trim(), notes: notes.trim(), pillar, format }),
      }}
    >
      <span className="sheet-section-label">Idea</span>
      <div className="sheet-group">
        <div className="sheet-cell sheet-cell--field">
          <input
            id="idea-title"
            className="input"
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Productivity tip nobody talks about"
            aria-label="Idea"
          />
        </div>
      </div>
      <span className="sheet-section-label">Notes</span>
      <div className="sheet-group">
        <div className="sheet-cell sheet-cell--field">
          <textarea
            id="idea-notes"
            className="input"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Hook angles, references, audio, anything"
            aria-label="Notes"
          />
        </div>
      </div>
      <span className="sheet-section-label">Details</span>
      <div className="sheet-group">
        <div className="sheet-cell">
          <span className="postsheet-minilabel">Pillar</span>
          <div className="ideas-sheet__pillars">
            {categories.map((c) => (
              <Chip
                key={c}
                active={pillar === c}
                dotColor={categoryColor(c)}
                onClick={() => setPillar(pillar === c ? "" : c)}
              >
                {c}
              </Chip>
            ))}
          </div>
        </div>
        <div className="sheet-cell">
          <span className="postsheet-minilabel">Format</span>
          <Segmented options={FORMAT_OPTIONS} value={format} onChange={setFormat} />
        </div>
      </div>
      {onDelete && (
        <div className="sheet-group" style={{ marginTop: "var(--sp-5)" }}>
          <button className="sheet-cell--destructive" onClick={onDelete}>
            <IconTrash size={16} />
            Delete Idea
          </button>
        </div>
      )}
    </BottomSheet>
  );
}
