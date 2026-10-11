"use client";

import { useSyncExternalStore } from "react";

/** Learn progress, kept in this browser only: which modules were read and how each quick check went. */
export interface ModuleProgress {
  read?: boolean;
  quiz?: { right: number; of: number };
}
type Progress = Record<string, ModuleProgress>;

const KEY = "tmb-learn-progress";
const listeners = new Set<() => void>();
let cache: Progress | null = null;

function read(): Progress {
  if (cache) return cache;
  try {
    cache = JSON.parse(localStorage.getItem(KEY) || "{}") as Progress;
  } catch {
    cache = {};
  }
  return cache;
}

function write(next: Progress) {
  cache = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {}
  listeners.forEach((l) => l());
}

export function markRead(id: string) {
  const p = read();
  if (p[id]?.read) return;
  write({ ...p, [id]: { ...p[id], read: true } });
}

export function saveQuiz(id: string, right: number, of: number) {
  const p = read();
  write({ ...p, [id]: { ...p[id], read: true, quiz: { right, of } } });
}

export function resetProgress() {
  write({});
}

/** A module counts as done once its quick check has been passed (at least half right). */
export const isDone = (m?: ModuleProgress) => Boolean(m?.quiz && m.quiz.right * 2 >= m.quiz.of);

const EMPTY: Progress = {};
export function useProgress(): Progress {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    read,
    () => EMPTY,
  );
}
