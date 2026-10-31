import { MediaTile } from "@/components/ui/MediaTile";
import type { ProductDetailData } from "@/types";
import styles from "./ProductGallery.module.css";

export function ProductGallery({ product }: { product: ProductDetailData }) {
  return (
    <div className={styles.frame}>
      <MediaTile tile={product.tile} alt={product.name} iconSize={56} />
    </div>
  );
}
