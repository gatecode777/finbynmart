import {
  Factory,
  Store,
  HardHat,
  HeartPulse,
  Tractor,
  GraduationCap,
  BedDouble,
  Briefcase,
} from "lucide-react";
import type { IndustrySolution } from "@/types";

export const INDUSTRY_SOLUTIONS: IndustrySolution[] = [
  { id: "manufacturing", name: "Manufacturing", href: "/industries/manufacturing", icon: Factory, tint: "navy" },
  { id: "retail-wholesale", name: "Retail & Wholesale", href: "/industries/retail-wholesale", icon: Store, tint: "blue" },
  { id: "construction", name: "Construction", href: "/industries/construction", icon: HardHat, tint: "slate" },
  { id: "healthcare", name: "Healthcare", href: "/industries/healthcare", icon: HeartPulse, tint: "blue" },
  { id: "agriculture", name: "Agriculture", href: "/industries/agriculture", icon: Tractor, tint: "navy" },
  { id: "education", name: "Education", href: "/industries/education", icon: GraduationCap, tint: "slate" },
  { id: "hospitality", name: "Hospitality", href: "/industries/hospitality", icon: BedDouble, tint: "blue" },
  { id: "services", name: "Services", href: "/industries/services", icon: Briefcase, tint: "navy" },
];
