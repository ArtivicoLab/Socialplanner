// A post's image tile (a =IMAGE-style URL). Renders the photo as a fill layer
// over whatever background the parent set (the pillar/cover swatch), and quietly
// removes itself if the URL is empty or fails to load — so an offline or broken
// link gracefully falls back to the color tile instead of a broken-image icon.
import { useEffect, useState } from "react";
import "../styles/features/postimage.css";

export function PostImage({
  src,
  alt = "",
  className = "",
}: {
  src: string;
  alt?: string;
  className?: string;
}) {
  const [broken, setBroken] = useState(false);
  // Reset when the URL changes so a fixed link can recover.
  useEffect(() => setBroken(false), [src]);
  if (!src || broken) return null;
  return (
    <img
      className={`postimg ${className}`}
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setBroken(true)}
    />
  );
}
