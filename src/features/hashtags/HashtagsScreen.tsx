// Hashtag Manager — reusable groups of tags. Create once, auto-fill in the
// scheduler, copy the whole block with one tap when posting.
import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { BottomSheet } from "../../components/BottomSheet";
import { EmptyState } from "../../components/EmptyState";
import {
  IconCheck,
  IconCopy,
  IconEdit,
  IconHash,
  IconPlus,
  IconSearch,
  IconTrash,
} from "../../components/icons";
import { useHashtagGroups, usePosts } from "../../stores/v2";
import { confirmDialog } from "../../stores/useConfirm";
import { PICKABLE_CATEGORY_COLORS, swatchTextColor } from "../../lib/ui";
import type { HashtagGroup } from "../../lib/types";
import "../../styles/features/hashtags.css";

/** Free text -> clean tag line: split on whitespace/commas, force a single
 *  leading "#" on each tag, join with single spaces. */
function normalizeTags(raw: string): string {
  return raw
    .split(/[\s,]+/)
    .map((t) => t.replace(/^#+/, ""))
    .filter(Boolean)
    .map((t) => `#${t}`)
    .join(" ");
}

/** Tags shown on a collapsed card before the "+N more" toggle. */
const TAG_PREVIEW_LIMIT = 10;

export function HashtagsScreen() {
  const { items, add, update, remove } = useHashtagGroups();
  const posts = usePosts((s) => s.items);
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<HashtagGroup | null>(null);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const copyTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(copyTimer.current), []);

  const groups = useMemo(
    () =>
      [...items].sort(
        (a, b) => a.order - b.order || (a.createdAt < b.createdAt ? -1 : 1)
      ),
    [items]
  );

  const usedBy = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of posts) {
      if (p.hashtagGroupId)
        map.set(p.hashtagGroupId, (map.get(p.hashtagGroupId) ?? 0) + 1);
    }
    return map;
  }, [posts]);

  const totalTags = useMemo(
    () =>
      groups.reduce((n, g) => n + g.tags.split(/\s+/).filter(Boolean).length, 0),
    [groups]
  );
  const postsUsing = useMemo(() => {
    const ids = new Set(groups.map((g) => g.id));
    return posts.filter((p) => p.hashtagGroupId && ids.has(p.hashtagGroupId))
      .length;
  }, [groups, posts]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter(
      (g) =>
        g.name.toLowerCase().includes(q) || g.tags.toLowerCase().includes(q)
    );
  }, [groups, query]);

  const copyAll = async (g: HashtagGroup) => {
    try {
      await navigator.clipboard.writeText(g.tags);
      setCopiedId(g.id);
      window.clearTimeout(copyTimer.current);
      copyTimer.current = window.setTimeout(() => setCopiedId(null), 1500);
    } catch {
      // Clipboard unavailable (e.g. insecure context) — do nothing loud.
    }
  };

  const toggleExpanded = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const confirmDelete = async (g: HashtagGroup) => {
    const ok = await confirmDialog({
      title: `Delete "${g.name || "this group"}"?`,
      message: "Any posts using it will keep their extra hashtags, but lose this group's tags.",
      confirmLabel: "Delete",
      danger: true,
    });
    if (ok) remove(g.id);
  };

  return (
    <>
      <div className="screen-head">
        <div className="screen-head__eyebrow">Reusable tag sets</div>
        <h1 className="screen-head__title">Hashtags</h1>
      </div>

      {groups.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<IconHash size={28} />}
            title="No hashtag groups yet"
            sub="Build a group once and it auto-fills the hashtags on any post in the scheduler. No more retyping the same 20 tags."
          >
            <button
              className="btn btn--primary"
              onClick={() => {
                setEdit(null);
                setOpen(true);
              }}
            >
              Create a group
            </button>
          </EmptyState>
        </div>
      ) : (
        <>
          <div className="hash-stats">
            <div className="hash-stat">
              <span className="hash-stat__num">{groups.length}</span>
              <span className="hash-stat__label">
                Group{groups.length === 1 ? "" : "s"}
              </span>
            </div>
            <div className="hash-stat">
              <span className="hash-stat__num">{totalTags}</span>
              <span className="hash-stat__label">
                Tag{totalTags === 1 ? "" : "s"}
              </span>
            </div>
            <div className="hash-stat">
              <span className="hash-stat__num">{postsUsing}</span>
              <span className="hash-stat__label">
                Post{postsUsing === 1 ? "" : "s"} tagged
              </span>
            </div>
          </div>

          {groups.length > 3 && (
            <div className="hash-search">
              <IconSearch size={15} aria-hidden />
              <input
                className="hash-search__input"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search groups or tags"
                aria-label="Search hashtag groups"
              />
            </div>
          )}

          <div className="hash-grid" data-tour="hash-groups">
            {visible.length === 0 && (
              <p className="muted hash-none">
                No groups match "{query.trim()}".
              </p>
            )}
            {visible.map((g) => {
              const idx = groups.indexOf(g);
              const tint =
                PICKABLE_CATEGORY_COLORS[idx % PICKABLE_CATEGORY_COLORS.length];
              const tags = g.tags.split(/\s+/).filter(Boolean);
              const uses = usedBy.get(g.id) ?? 0;
              const copied = copiedId === g.id;
              const isOpen = expanded.has(g.id);
              const shown = isOpen ? tags : tags.slice(0, TAG_PREVIEW_LIMIT);
              const hidden = tags.length - shown.length;
              return (
                <article
                  key={g.id}
                  className="card hash-card"
                  style={{ "--tint": tint } as CSSProperties}
                >
                  <div className="hash-card__top">
                    <span
                      className="hash-card__swatch"
                      style={{ background: tint, color: swatchTextColor(tint) }}
                      aria-hidden
                    >
                      <IconHash size={15} />
                    </span>
                    <div className="hash-card__titles">
                      <span className="hash-card__name">
                        {g.name || "Untitled"}
                      </span>
                      <span className="hash-card__meta">
                        {tags.length} tag{tags.length === 1 ? "" : "s"}
                        {uses > 0 &&
                          ` · on ${uses} post${uses === 1 ? "" : "s"}`}
                      </span>
                    </div>
                    <div className="hash-card__actions">
                      <button
                        className="hash-ghost"
                        aria-label={`Edit ${g.name || "group"}`}
                        onClick={() => {
                          setEdit(g);
                          setOpen(true);
                        }}
                      >
                        <IconEdit size={15} />
                      </button>
                      <button
                        className="hash-ghost hash-ghost--danger"
                        aria-label={`Delete ${g.name || "group"}`}
                        onClick={() => confirmDelete(g)}
                      >
                        <IconTrash size={15} />
                      </button>
                    </div>
                  </div>

                  <div className="hash-card__tags">
                    {shown.map((t, i) => (
                      <span key={`${t}-${i}`} className="hash-tag">
                        {t}
                      </span>
                    ))}
                    {hidden > 0 && (
                      <button
                        className="hash-tag hash-tag--more"
                        onClick={() => toggleExpanded(g.id)}
                      >
                        +{hidden} more
                      </button>
                    )}
                    {isOpen && tags.length > TAG_PREVIEW_LIMIT && (
                      <button
                        className="hash-tag hash-tag--more"
                        onClick={() => toggleExpanded(g.id)}
                      >
                        Show less
                      </button>
                    )}
                    {tags.length === 0 && (
                      <span className="muted hash-card__none">
                        No tags yet. Tap the pencil to add some.
                      </span>
                    )}
                  </div>

                  <button
                    className={`hash-copy${copied ? " hash-copy--copied" : ""}`}
                    onClick={() => copyAll(g)}
                    disabled={tags.length === 0}
                  >
                    {copied ? <IconCheck size={15} /> : <IconCopy size={15} />}
                    {copied
                      ? "Copied to clipboard"
                      : `Copy all ${tags.length || ""} tag${tags.length === 1 ? "" : "s"}`}
                  </button>
                </article>
              );
            })}
          </div>
        </>
      )}

      {groups.length > 0 && (
        <button
          className="fab"
          aria-label="Add hashtag group"
          data-tour="hash-fab"
          onClick={() => {
            setEdit(null);
            setOpen(true);
          }}
        >
          <IconPlus />
        </button>
      )}

      <GroupSheet
        open={open}
        group={edit}
        onClose={() => setOpen(false)}
        onSave={(patch) => {
          if (edit) update(edit.id, patch);
          else add({ ...patch, order: groups.length });
          setOpen(false);
        }}
      />
    </>
  );
}

function GroupSheet({
  open,
  group,
  onClose,
  onSave,
}: {
  open: boolean;
  group: HashtagGroup | null;
  onClose: () => void;
  onSave: (patch: Partial<HashtagGroup>) => void;
}) {
  const [name, setName] = useState("");
  const [tags, setTags] = useState("");

  useEffect(() => {
    if (!open) return;
    setName(group?.name ?? "");
    setTags(group?.tags ?? "");
  }, [open, group]);

  const previewTags = useMemo(
    () => normalizeTags(tags).split(" ").filter(Boolean),
    [tags]
  );
  const count = previewTags.length;

  return (
    <BottomSheet
      open={open}
      title={group ? "Edit Group" : "New Group"}
      onClose={onClose}
      action={{
        label: group ? "Save" : "Add",
        disabled: !name.trim(),
        onClick: () => onSave({ name: name.trim(), tags: normalizeTags(tags) }),
      }}
    >
      <span className="sheet-section-label">Name</span>
      <div className="sheet-group">
        <div className="sheet-cell sheet-cell--field">
          <input
            id="hash-name"
            className="input"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Content Creation"
            aria-label="Group name"
          />
        </div>
      </div>
      <span className="sheet-section-label">Tags</span>
      <div className="sheet-group">
        <div className="sheet-cell sheet-cell--field">
          <textarea
            id="hash-tags"
            className="input hash-sheet__tags"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="contentcreator createcontent smallbusiness: spaces, commas or new lines all work"
            aria-label="Tags"
          />
        </div>
      </div>
      {count === 0 ? (
        <p className="muted hash-sheet__hint">
          The # is added for you on save.
        </p>
      ) : (
        <>
          <p className="muted hash-sheet__hint">
            {count} tag{count === 1 ? "" : "s"}, saved as:
            {count > 30 && (
              <span className="hash-sheet__warn">
                {" "}
                Instagram allows up to 30 per post.
              </span>
            )}
          </p>
          <div className="hash-sheet__preview">
            {previewTags.map((t, i) => (
              <span key={`${t}-${i}`} className="hash-tag">
                {t}
              </span>
            ))}
          </div>
        </>
      )}
    </BottomSheet>
  );
}
