/**
 * Helpers for preserving user local timezone offsets when passing timestamps to ml_service.
 */

const parseOffsetMinutesFromIso = (value) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.endsWith("Z") || trimmed.endsWith("z")) return 0;
  const match = trimmed.match(/([+-])(\d{2}):?(\d{2})$/);
  if (!match) return null;
  const sign = match[1] === "-" ? -1 : 1;
  const hours = Number(match[2]);
  const mins = Number(match[3]);
  return sign * (hours * 60 + mins);
};

const formatLocalIso = (date, offsetMinutes = 0) => {
  const d = date instanceof Date ? date : new Date(date);
  const offset = Number.isFinite(offsetMinutes) ? Math.trunc(offsetMinutes) : 0;
  if (offset === 0) return d.toISOString();

  const shifted = new Date(d.getTime() + offset * 60_000);
  const sign = offset >= 0 ? "+" : "-";
  const abs = Math.abs(offset);
  const hh = String(Math.floor(abs / 60)).padStart(2, "0");
  const mm = String(abs % 60).padStart(2, "0");
  return `${shifted.toISOString().slice(0, 19)}${sign}${hh}:${mm}`;
};

module.exports = { parseOffsetMinutesFromIso, formatLocalIso };
