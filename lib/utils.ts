import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function ageFromIso(iso: string | undefined, now: Date = new Date()): number | null {
  if (!iso) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return null;
  const birthYear = Number(match[1]);
  const birthMonth = Number(match[2]);
  const birthDay = Number(match[3]);
  const check = new Date(Date.UTC(birthYear, birthMonth - 1, birthDay));
  if (
    check.getUTCFullYear() !== birthYear
    || check.getUTCMonth() !== birthMonth - 1
    || check.getUTCDate() !== birthDay
  ) return null;
  let age = now.getFullYear() - birthYear;
  const m = now.getMonth() + 1 - birthMonth;
  if (m < 0 || (m === 0 && now.getDate() < birthDay)) age -= 1;
  return age;
}

export function formatViewerCount(n: number): string {
  if (n < 1000) return String(n);
  if (n < 10_000) return (n / 1000).toFixed(1) + "K";
  if (n < 1_000_000) return Math.round(n / 1000) + "K";
  return (n / 1_000_000).toFixed(1) + "M";
}
