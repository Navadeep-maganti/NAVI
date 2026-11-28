export const getTimezoneOffsetMinutes = (date: Date = new Date()): number =>
  -date.getTimezoneOffset();

export const toLocalIsoString = (date: Date = new Date()): string => {
  const offsetMin = -date.getTimezoneOffset();
  const sign = offsetMin >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMin);
  const hh = String(Math.floor(abs / 60)).padStart(2, "0");
  const mm = String(abs % 60).padStart(2, "0");
  const shifted = new Date(date.getTime() + offsetMin * 60_000);
  return `${shifted.toISOString().slice(0, 19)}${sign}${hh}:${mm}`;
};
