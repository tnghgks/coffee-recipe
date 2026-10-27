import { createStore } from "zustand/vanilla";

import {
  completeIfDue,
  elapsedMs,
  finishSession,
  idleSession,
  pauseSession,
  readySession,
  resumeSession,
  startSession,
  toggleSession,
  type BrewSession,
} from "@/lib/brew";

/** Thin wrapper: all timing rules live in src/lib/brew/session.ts; the store only supplies `now`. */
export type BrewStore = {
  session: BrewSession;
  /** Prep → brew screen; the clock waits for `start`/`toggle`. */
  ready: () => void;
  start: () => void;
  pause: () => void;
  resume: () => void;
  toggle: () => void;
  finish: () => void;
  reset: () => void;
  /** Call on every frame; finishes the session once `endMs` of brewing has elapsed. */
  completeIfDue: (endMs: number) => void;
  elapsedMs: () => number;
};

export type Clock = () => number;

const monotonicClock: Clock = () => performance.now();

export function createBrewStore(now: Clock = monotonicClock) {
  return createStore<BrewStore>()((set, get) => {
    const apply = (transition: (session: BrewSession, now: number) => BrewSession) => {
      const current = get().session;
      const next = transition(current, now());
      if (next !== current) set({ session: next });
    };

    return {
      session: idleSession,
      ready: () => apply(readySession),
      start: () => apply(startSession),
      pause: () => apply(pauseSession),
      resume: () => apply(resumeSession),
      toggle: () => apply(toggleSession),
      finish: () => apply(finishSession),
      reset: () => set({ session: idleSession }),
      completeIfDue: (endMs) => apply((session, t) => completeIfDue(session, t, endMs)),
      elapsedMs: () => elapsedMs(get().session, now()),
    };
  });
}
