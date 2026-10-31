import type { Testimonial } from "@/types";

/**
 * Sample testimonials for visual development only (spec section 20). Do not
 * ship to production — swap for genuine, customer-approved quotes, or hide
 * this section if none are available yet. See docs/MISSING_ASSETS.md.
 */
export const TESTIMONIALS: Testimonial[] = [
  {
    id: "sample-1",
    name: "Sample Buyer One",
    businessName: "Purchase Manager, Sample Industries",
    quote: "Finbyn Kart helped us find reliable suppliers quickly. Highly recommended!",
    rating: 5,
  },
  {
    id: "sample-2",
    name: "Sample Buyer Two",
    businessName: "Owner, Sample Traders",
    quote: "We received multiple competitive quotes and saved both time and costs.",
    rating: 5,
  },
  {
    id: "sample-3",
    name: "Sample Buyer Three",
    businessName: "Director, Sample Enterprises",
    quote: "Excellent platform to connect with genuine suppliers. Very easy to use.",
    rating: 5,
  },
];
