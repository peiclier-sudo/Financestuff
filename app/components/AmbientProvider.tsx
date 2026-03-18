"use client";

import { useTimeOfDay } from "@/app/hooks/useTimeOfDay";

export default function AmbientProvider({ children }: { children: React.ReactNode }) {
  useTimeOfDay();
  return <>{children}</>;
}
