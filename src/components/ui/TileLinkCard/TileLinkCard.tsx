import Link from "next/link";
import clsx from "clsx";
import { MediaTile } from "@/components/ui/MediaTile";
import type { MediaTile as MediaTileData } from "@/types";
import styles from "./TileLinkCard.module.css";

interface TileLinkCardProps {
  href: string;
  name: string;
  tile: MediaTileData;
  shape?: "square" | "wide";
}

export function TileLinkCard({ href, name, tile, shape = "square" }: TileLinkCardProps) {
  return (
    <Link href={href} className={styles.card}>
      <div className={clsx(styles.tile, shape === "wide" && styles.wide)}>
        <MediaTile tile={tile} alt={name} iconSize={32} />
      </div>
      <span className={styles.name}>{name}</span>
    </Link>
  );
}
