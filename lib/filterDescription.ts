import { FilterCriteria } from "./types";

export function buildFilterDescription(c: FilterCriteria): string {
  const parts: string[] = [];
  if (c.dayOfWeek !== null) {
    const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    parts.push(`Day: ${names[c.dayOfWeek]}`);
  }
  if (c.gapDirection !== "any") parts.push(`Gap: ${c.gapDirection}`);
  if (c.direction !== "any") parts.push(`Direction: ${c.direction}`);
  if (c.prevDayDirection !== "any") parts.push(`Prev day: ${c.prevDayDirection}`);
  if (c.minGapPercent > 0) parts.push(`Min gap: ${c.minGapPercent}%`);
  if (c.maxGapPercent > 0) parts.push(`Max gap: ${c.maxGapPercent}%`);
  if (c.minRangePercent > 0) parts.push(`Min range: ${c.minRangePercent}%`);
  if (c.maxRangePercent > 0) parts.push(`Max range: ${c.maxRangePercent}%`);
  if (c.minChangePercent > 0) parts.push(`Min change: ${c.minChangePercent}%`);
  if (c.maxChangePercent > 0) parts.push(`Max change: ${c.maxChangePercent}%`);
  if (c.dateFrom) parts.push(`From: ${c.dateFrom}`);
  if (c.dateTo) parts.push(`To: ${c.dateTo}`);
  return parts.length > 0 ? parts.join(", ") : "No filters (all days)";
}
