"use client";

import { useEffect } from "react";

/**
 * Circadian ambient system — shifts the background hue based on time of day.
 * Matches trader circadian rhythms:
 *   6-9am:    hue 30  (warm amber — pre-market)
 *   9am-3pm:  hue 215 (cool blue — market hours, focused)
 *   3-6pm:    hue 250 (purple dusk — market close)
 *   6pm-6am:  hue 270 (deep indigo — off-hours)
 */
function getAmbientHue(): number {
  const h = new Date().getHours();
  if (h >= 6 && h < 9) return 30;
  if (h >= 9 && h < 15) return 215;
  if (h >= 15 && h < 18) return 250;
  return 270;
}

export function useTimeOfDay() {
  useEffect(() => {
    const apply = () => {
      document.documentElement.style.setProperty("--ambient-hue", String(getAmbientHue()));
    };
    apply();
    const interval = setInterval(apply, 15 * 60 * 1000); // every 15 min
    return () => clearInterval(interval);
  }, []);
}
