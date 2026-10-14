export type { ContainerStatus, WasteStatus } from "@/lib/statuses";

/** MoH colour codes for waste categories (always shown with text, never colour alone). */
export type MohColor = "YELLOW" | "RED" | "BLUE" | "BROWN" | "BLACK" | "WHITE";

export type WasteCategoryCode =
  "INFECTIOUS" | "SHARPS" | "PATHOLOGICAL" | "PHARMACEUTICAL" | "CHEMICAL" | "GENERAL";
