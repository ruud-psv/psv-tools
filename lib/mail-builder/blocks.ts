import type { Template } from "@/components/mail-builder-form";

export type BlockType =
  | "hero"
  | "greeting"
  | "text-blocks"
  | "footer"
  | "fanstore-nav"
  | "psvplay-video"
  | "business-sponsor"
  | "enquete-cta"
  | "phoxy-cta"
  | "prematch-images";

export const BLOCK_LABELS: Record<BlockType, string> = {
  "hero":              "Hero",
  "greeting":          "Aanhef",
  "text-blocks":       "Tekstblokken",
  "footer":            "Footer",
  "fanstore-nav":      "FANstore navigatie",
  "psvplay-video":     "PSV Play video's",
  "business-sponsor":  "Sponsorbalk",
  "enquete-cta":       "Enquête CTA",
  "phoxy-cta":         "Phoxy CTA-afbeelding",
  "prematch-images":   "Pre-match afbeeldingen",
};

export const TEMPLATE_BLOCKS: Record<Template, BlockType[]> = {
  fanstore:     ["hero", "greeting", "text-blocks", "footer"],
  kaartverkoop: ["hero", "greeting", "text-blocks", "footer"],
  soccerschool: ["hero", "greeting", "text-blocks", "footer"],
  tours:        ["hero", "greeting", "text-blocks", "footer"],
  partnerships: ["hero", "greeting", "text-blocks", "footer"],
  business:     ["hero", "business-sponsor", "greeting", "text-blocks", "footer"],
  enquete:      ["hero", "enquete-cta", "text-blocks", "footer"],
  fcpsvo12:     ["hero", "greeting", "text-blocks", "footer"],
  fcpsvo16:     ["hero", "greeting", "text-blocks", "footer"],
  phoxy:        ["hero", "phoxy-cta", "text-blocks", "footer"],
  psvplay:      ["hero", "psvplay-video", "footer"],
  prematch:     ["prematch-images"],
};
