"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, Images, X } from "lucide-react";
import styles from "./SupplierGallery.module.css";

interface GalleryImage {
  src: string;
  alt: string;
}

export function SupplierGallery({ images }: { images: GalleryImage[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  useEffect(() => {
    if (openIndex === null) return;

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpenIndex(null);
      if (event.key === "ArrowRight") setOpenIndex((i) => (i === null ? i : (i + 1) % images.length));
      if (event.key === "ArrowLeft") setOpenIndex((i) => (i === null ? i : (i - 1 + images.length) % images.length));
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openIndex, images.length]);

  if (images.length === 0) {
    return null;
  }

  const current = openIndex === null ? null : images[openIndex];

  return (
    <section className={styles.section} aria-labelledby="gallery-heading">
      <h2 id="gallery-heading" className={styles.heading}>
        <Images size={18} strokeWidth={2} aria-hidden />
        Company Gallery
      </h2>

      <div className={styles.grid}>
        {images.map((image, index) => (
          <button
            key={image.src}
            type="button"
            className={styles.thumb}
            onClick={() => setOpenIndex(index)}
            aria-label={`Open image: ${image.alt}`}
          >
            <Image src={image.src} alt={image.alt} fill sizes="(max-width: 768px) 50vw, 20vw" className={styles.img} />
          </button>
        ))}
      </div>

      {current && openIndex !== null && (
        <div className={styles.lightbox} role="dialog" aria-modal="true" aria-label={current.alt}>
          <button type="button" className={styles.close} onClick={() => setOpenIndex(null)} aria-label="Close">
            <X size={22} aria-hidden />
          </button>
          {images.length > 1 && (
            <button
              type="button"
              className={`${styles.nav} ${styles.prev}`}
              onClick={() => setOpenIndex((openIndex - 1 + images.length) % images.length)}
              aria-label="Previous image"
            >
              <ChevronLeft size={24} aria-hidden />
            </button>
          )}
          <div className={styles.lightboxImage}>
            <Image src={current.src} alt={current.alt} fill sizes="90vw" className={styles.contain} />
          </div>
          {images.length > 1 && (
            <button
              type="button"
              className={`${styles.nav} ${styles.next}`}
              onClick={() => setOpenIndex((openIndex + 1) % images.length)}
              aria-label="Next image"
            >
              <ChevronRight size={24} aria-hidden />
            </button>
          )}
        </div>
      )}
    </section>
  );
}
