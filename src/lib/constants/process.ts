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
    title: "Get Multiple Quotes",
    description: "Receive offers from verified suppliers.",
    icon: FileText,
  },
  {
    step: 3,
    title: "Compare & Choose",
    description: "Evaluate and select the best offer.",
    icon: ListChecks,
  },
  {
    step: 4,
    title: "Connect & Grow",
    description: "Directly connect and do business.",
    icon: Handshake,
  },
];
