const dateTime = new Intl.DateTimeFormat("pl-PL", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const date = new Intl.DateTimeFormat("pl-PL", { day: "numeric", month: "short", year: "numeric" });

export const formatDateTime = (iso: string | null | undefined) => (iso ? dateTime.format(new Date(iso)) : "");
export const formatDate = (iso: string | null | undefined) => (iso ? date.format(new Date(iso)) : "");

export const fileSize = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

export const personName = (p: { first_name: string; last_name: string } | null) => (p ? `${p.first_name} ${p.last_name}` : "Ocena automatyczna");

/** Polish plural: plural(2, "etap", "etapy", "etapów") → "2 etapy", plural(5, …) → "5 etapów". */
export function plural(n: number, one: string, few: string, many: string) {
  const d = n % 10;
  const t = n % 100;
  const word = n === 1 ? one : d >= 2 && d <= 4 && (t < 12 || t > 14) ? few : many;
  return `${n} ${word}`;
}
