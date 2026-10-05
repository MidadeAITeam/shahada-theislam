// Display helpers: names of languages and countries, times and ages, in the interface language.
import { lang, t } from "./i18n.js";

const cache = new Map();
function displayNames(type) {
  const key = `${lang.value}:${type}`;
  if (!cache.has(key)) {
    try { cache.set(key, new Intl.DisplayNames([lang.value], { type })); } catch { cache.set(key, null); }
  }
  return cache.get(key);
}

export function langName(code) {
  if (!code) return "—";
  try { return displayNames("language")?.of(code) ?? code; } catch { return code; }
}

export function countryName(code) {
  if (!code) return null;
  try { return displayNames("region")?.of(code.toUpperCase()) ?? code; } catch { return code; }
}

/** Flag emoji from a two-letter country code (purely decorative). */
export function flag(code) {
  if (!code || !/^[A-Za-z]{2}$/.test(code)) return "";
  return String.fromCodePoint(...[...code.toUpperCase()].map((c) => 0x1f1a5 + c.charCodeAt(0)));
}

/** The service stores UTC timestamps as "YYYY-MM-DD HH:MM:SS". */
export function parseTime(s) {
  if (!s) return null;
  const d = new Date(String(s).replace(" ", "T") + (String(s).endsWith("Z") ? "" : "Z"));
  return Number.isNaN(d.getTime()) ? null : d;
}

export function dateTime(s) {
  const d = parseTime(s);
  if (!d) return "—";
  return new Intl.DateTimeFormat(lang.value === "ar" ? "ar-u-nu-latn" : "en-GB", { dateStyle: "medium", timeStyle: "short" }).format(d);
}

export function clock(d) {
  return new Intl.DateTimeFormat(lang.value === "ar" ? "ar-u-nu-latn" : "en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(d);
}

export function ageShort(minutes) {
  const m = Math.max(0, Math.round(minutes ?? 0));
  if (m < 1) return t("ageNow");
  if (m < 60) return t("ageMin", { n: m });
  if (m < 60 * 24) return t("ageHour", { n: Math.floor(m / 60) });
  return t("ageDay", { n: Math.floor(m / 1440) });
}

export function ageSince(s) {
  const d = parseTime(s);
  return d ? (Date.now() - d.getTime()) / 60000 : 0;
}

export function duration(minutes) {
  if (minutes == null) return null;
  return minutes < 90 ? t("minutes", { n: Math.round(minutes) }) : t("hours", { n: Math.round(minutes / 6) / 10 });
}

export function firstLine(text, max = 140) {
  const line = String(text ?? "").split(/\r?\n/).find((l) => l.trim()) ?? "";
  return line.length > max ? line.slice(0, max - 1).trimEnd() + "…" : line;
}

/** One letter for an avatar: skips titles such as «المرشد» and parenthesised notes. */
export function initial(name) {
  const titles = new Set(["المرشد", "المرشدة", "مشرف", "مشرفة", "الأخ", "الأخت", "المتابعة"]);
  const words = String(name ?? "").replace(/\(.*?\)/g, "").trim().split(/\s+/).filter(Boolean);
  return (words.find((w) => !titles.has(w)) ?? words[0] ?? "?")[0];
}
