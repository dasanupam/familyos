import { clsx } from "clsx";
import { twMerge } from "tailwind-merge"

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

// Re-exports for convenience
export { formatINR, formatINRFull, formatINRCompact } from "@/lib/api";
