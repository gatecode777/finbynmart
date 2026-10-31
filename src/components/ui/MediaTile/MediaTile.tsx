import Image from "next/image";
import clsx from "clsx";
import type { MediaTile as MediaTileData } from "@/types";
import styles from "./MediaTile.module.css";

interface MediaTileProps {
  tile: MediaTileData;
  alt: string;
  iconSize?: number;
}

/**
 * Renders licensed photography when `tile.imageSrc` is supplied; otherwise
 * falls back to a branded icon tile. See docs/MISSING_ASSETS.md.
 */
export function MediaTile({ tile, alt, iconSize = 32 }: MediaTileProps) {
  if (tile.imageSrc) {
    return (
      <Image
        src={tile.imageSrc}
        alt={alt}
        fill
        sizes="(max-width: 768px) 50vw, 25vw"
        className={styles.image}
      />
    );
  }

  const Icon = tile.icon;

  return (
    <div className={clsx(styles.tile, styles[tile.tint])}>
      <Icon size={iconSize} strokeWidth={1.5} aria-hidden />
    </div>
  );
}
