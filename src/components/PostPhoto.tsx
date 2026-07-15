// A post's photo, wherever it's shown (Feed, Monthly, Scheduler, Dashboard).
// Priority: a device-picked local photo (see stores/localImages) beats a
// pasted image URL, which beats nothing (parent falls back to its swatch
// color). This is the one place that priority is decided — every screen just
// renders <PostPhoto postId={p.id} fallbackUrl={p.image} />.
import { useEffect, useState } from "react";
import { PostImage } from "./PostImage";
import { useLocalImages } from "../stores/localImages";

/** Turns a Blob into an object URL for the component's lifetime, revoking it
 *  on unmount or when the blob changes so we never leak. */
export function useObjectUrl(blob: Blob | undefined): string {
  const [url, setUrl] = useState("");
  useEffect(() => {
    if (!blob) {
      setUrl("");
      return;
    }
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return url;
}

export function PostPhoto({
  postId,
  fallbackUrl,
  alt = "",
  className = "",
}: {
  postId: string;
  fallbackUrl: string;
  alt?: string;
  className?: string;
}) {
  const blob = useLocalImages((s) => s.map[postId]);
  const objectUrl = useObjectUrl(blob);
  return <PostImage src={objectUrl || fallbackUrl} alt={alt} className={className} />;
}
