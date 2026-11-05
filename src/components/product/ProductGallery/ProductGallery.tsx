"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, Maximize2, Package, X } from "lucide-react";
import clsx from "clsx";
import type { ProductDetail } from "@/lib/catalog/productDetail";
import styles from "./ProductGallery.module.css";
import { lockBodyScroll } from "@/lib/utils/scrollLock";

type GalleryImage = ProductDetail["images"][number];

/**
 * Product photos: a main image, thumbnails when there is more than one, and a full-screen viewer
 * (Escape closes, arrow keys move, focus returns to the button that opened it). Only real images are
 * shown; with none, a neutral branded tile. There is no video or 360-degree asset in the data, so none is offered.
 */
export function ProductGallery({ images, name }: { images: GalleryImage[]; name: string }) {
  const [index, setIndex] = useState(0);
  const [open, setOpen] = useState(false);
  const [broken, setBroken] = useState<Set<string>>(new Set());
  const opener = useRef<HTMLButtonElement>(null);
  const closer = useRef<HTMLButtonElement>(null);

  const shown = images.filter((image) => !broken.has(image.src));
  const current = shown[Math.min(index, Math.max(0, shown.length - 1))];
  const many = shown.length > 1;

  const move = useCallback(
    (step: number) => setIndex((value) => (shown.length ? (value + step + shown.length) % shown.length : 0)),
    [shown.length],
  );

  useEffect(() => {
    if (!open) return;
    const trigger = opener.current;
    closer.current?.focus();
    const unlock = lockBodyScroll();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
      if (event.key === "ArrowLeft") move(-1);
      if (event.key === "ArrowRight") move(1);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      unlock();
      trigger?.focus();
    };
  }, [open, move]);

  const markBroken = (src: string) => setBroken((previous) => new Set(previous).add(src));

  return (
    <div className={clsx(styles.gallery, many && styles.withThumbs)}>
      {many && (
        <ul className={styles.thumbs} aria-label="Product images">
          {shown.map((image, i) => (
            <li key={image.src}>
              <button
                type="button"
                className={clsx(styles.thumb, i === index && styles.active)}
                onClick={() => setIndex(i)}
                aria-label={`Show image ${i + 1} of ${shown.length}`}
                aria-current={i === index ? "true" : undefined}
              >
                <Image src={image.src} alt="" fill sizes="72px" unoptimized={image.remote} className={styles.thumbImage} onError={() => markBroken(image.src)} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className={styles.frame}>
        {current ? (
          <>
            <Image
              src={current.src}
              alt={current.alt}
              fill
              priority
              sizes="(max-width: 900px) 92vw, (max-width: 1280px) 44vw, 520px"
              unoptimized={current.remote}
              className={styles.image}
              onError={() => markBroken(current.src)}
            />
            <button ref={opener} type="button" className={styles.expand} onClick={() => setOpen(true)} aria-label="View image full screen">
              <Maximize2 size={18} strokeWidth={2} aria-hidden />
            </button>
          </>
        ) : (
          <div className={styles.fallback} role="img" aria-label={`No photo available for ${name}`}>
            <Package size={56} strokeWidth={1.5} aria-hidden />
            <span>Photo not available</span>
          </div>
        )}
      </div>

      {many && <p className={styles.count}>{shown.length} images</p>}

      {open && current && (
        <div className={styles.viewer} role="dialog" aria-modal="true" aria-label={`${name} images`}>
          <button type="button" className={styles.backdrop} onClick={() => setOpen(false)} aria-label="Close image viewer" tabIndex={-1} />
          <div className={styles.viewerBody}>
            <button ref={closer} type="button" className={styles.close} onClick={() => setOpen(false)} aria-label="Close image viewer">
              <X size={22} strokeWidth={2} aria-hidden />
            </button>
            {many && (
              <button type="button" className={clsx(styles.nav, styles.prev)} onClick={() => move(-1)} aria-label="Previous image">
                <ChevronLeft size={26} aria-hidden />
              </button>
            )}
            <div className={styles.viewerFrame}>
              <Image src={current.src} alt={current.alt} fill sizes="100vw" unoptimized={current.remote} className={styles.viewerImage} />
            </div>
            {many && (
              <button type="button" className={clsx(styles.nav, styles.next)} onClick={() => move(1)} aria-label="Next image">
                <ChevronRight size={26} aria-hidden />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
