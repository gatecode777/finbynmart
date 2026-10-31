import Image from "next/image";
import clsx from "clsx";
import { ICON_REGISTRY } from "@/lib/constants/icons";
import type { MediaTile as MediaTileData, SerializableTile } from "@/types";
import styles from "./MediaTile.module.css";

interface MediaTileProps {
  tile: MediaTileData | SerializableTile;
  alt: string;
  iconSize?: number;
}

/**
 * Renders licensed photography when `tile.imageSrc` is supplied; otherwise
 * falls back to a branded icon tile. See docs/MISSING_ASSETS.md.
 *
 * Accepts either a MediaTile (live icon component, server-render only) or a
 * SerializableTile (icon by name, safe to pass into Client Components).
 */
export function MediaTile({ tile, alt, iconSize = 32 }: MediaTileProps) {
  if (tile.imageSrc) {
    return (
      <Image
        src={tile.imageSrc}
        alt={alt}
        fill
        sizes="(max-width: 768px) 50vw, 25vw"
        // Remote photos load straight in the visitor's browser; we don't proxy or copy them.
        unoptimized={/^https?:\/\//.test(tile.imageSrc)}
        className={styles.image}
      />
    );
  }

  const Icon = "iconName" in tile ? ICON_REGISTRY[tile.iconName] : tile.icon;

  return (
    <div className={clsx(styles.tile, styles[tile.tint])}>
      <Icon size={iconSize} strokeWidth={1.5} aria-hidden />
    </div>
  );
}
