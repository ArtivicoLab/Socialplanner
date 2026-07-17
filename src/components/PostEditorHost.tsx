import { PostSheet } from "../features/scheduler/PostSheet";
import { PostViewSheet } from "../features/scheduler/PostViewSheet";
import { usePostEditor, switchPostEditorToEdit } from "../stores/usePostEditor";
import { usePosts } from "../stores/v2";
import { useLocalImages } from "../stores/localImages";
import type { Post } from "../lib/types";

// Renders whatever openPostEditor() is currently showing. Mounted once at
// the app shell (see App.tsx) — same pattern as ConfirmHost, so any screen
// (including Calendar, as of 2026-07-17 — see its own comment) can
// view/edit/create a post in place, without navigating to the Scheduler
// route. An existing post opens read-only (PostViewSheet) first; its "Edit"
// button switches this same open post over to the real form (PostSheet)
// without closing/reopening. A brand-new post skips the view step entirely
// (see usePostEditor's show()).
export function PostEditorHost() {
  const { open, mode, post, prefillDate, close } = usePostEditor();
  const addPost = usePosts((s) => s.add);
  const updatePost = usePosts((s) => s.update);
  const removePost = usePosts((s) => s.remove);

  function save(patch: Partial<Post>): Post | void {
    close();
    if (post) {
      updatePost(post.id, patch);
      return undefined;
    }
    return addPost(patch);
  }

  function del() {
    if (post) {
      removePost(post.id);
      void useLocalImages.getState().remove(post.id);
    }
    close();
  }

  return (
    <>
      <PostViewSheet
        open={open && mode === "view"}
        post={post}
        onClose={close}
        onEdit={switchPostEditorToEdit}
      />
      <PostSheet
        open={open && mode === "edit"}
        post={post}
        prefillDate={prefillDate}
        onClose={close}
        onSave={save}
        onDelete={post ? del : undefined}
      />
    </>
  );
}
