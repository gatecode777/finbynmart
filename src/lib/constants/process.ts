import { ClipboardList, FileText, ListChecks, Handshake } from "lucide-react";
import type { ProcessStep } from "@/types";

export const HOW_IT_WORKS: ProcessStep[] = [
  {
    step: 1,
    title: "Post Your Requirement",
    description: "Tell us what you need.",
    icon: ClipboardList,
  },
  {
    step: 2,
    title: "Receive Quotes",
    description: "Suppliers can respond with quotations.",
    icon: FileText,
  },
  {
    step: 3,
    title: "Compare & Choose",
    description: "Review the offers you receive and choose.",
    icon: ListChecks,
  },
  {
    step: 4,
    title: "Discuss & Confirm",
    description: "Talk to suppliers and confirm an accepted quotation.",
    icon: Handshake,
  },
];
