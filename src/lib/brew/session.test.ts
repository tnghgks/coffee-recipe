import { describe, expect, it } from "vitest";

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
} from "./session";

describe("brew session", () => {
  it("counts elapsed time from the start instant, not from ticks", () => {
    const running = startSession(idleSession, 1_000);
    expect(running.status).toBe("running");
    expect(elapsedMs(running, 1_000)).toBe(0);
    expect(elapsedMs(running, 46_000)).toBe(45_000);
  });

  it("does not count time while paused", () => {
    let session = startSession(idleSession, 0);
    session = pauseSession(session, 10_000); // ran 10s
    expect(session.status).toBe("paused");
    expect(elapsedMs(session, 999_999)).toBe(10_000); // frozen while paused

    session = resumeSession(session, 60_000); // paused for 50s
    expect(elapsedMs(session, 65_000)).toBe(15_000); // 10s + 5s
  });

  it("survives multiple pause/resume cycles", () => {
    let session = startSession(idleSession, 0);
    session = pauseSession(session, 1_000);
    session = resumeSession(session, 5_000);
    session = pauseSession(session, 7_500);
    session = resumeSession(session, 20_000);
    expect(elapsedMs(session, 21_000)).toBe(1_000 + 2_500 + 1_000);
  });

  it("keeps time correct across a long gap (e.g. tab in background)", () => {
    const session = startSession(idleSession, 0);
    // no intermediate ticks at all
    expect(elapsedMs(session, 125_000)).toBe(125_000);
  });

  it("toggles start → pause → resume and ignores taps when finished", () => {
    let session = toggleSession(idleSession, 0);
    expect(session.status).toBe("running");
    session = toggleSession(session, 3_000);
    expect(session.status).toBe("paused");
    session = toggleSession(session, 4_000);
    expect(session.status).toBe("running");

    const finished = finishSession(session, 5_000);
    expect(toggleSession(finished, 6_000)).toBe(finished);
  });

  it("waits at 0:00 when ready and starts the clock on the tap", () => {
    const ready = readySession(idleSession);
    expect(ready.status).toBe("ready");
    expect(elapsedMs(ready, 30_000)).toBe(0); // opening the brew screen doesn't start the clock
    expect(pauseSession(ready, 30_000)).toBe(ready);
    expect(finishSession(ready, 30_000)).toBe(ready);
    expect(completeIfDue(ready, 999_999, 1_000)).toBe(ready);

    const running = toggleSession(ready, 30_000);
    expect(running.status).toBe("running");
    expect(elapsedMs(running, 35_000)).toBe(5_000);
    expect(readySession(running)).toBe(running);
  });

  it("ignores transitions that don't apply", () => {
    expect(pauseSession(idleSession, 10)).toBe(idleSession);
    expect(resumeSession(idleSession, 10)).toBe(idleSession);
    expect(finishSession(idleSession, 10)).toBe(idleSession);
    const running = startSession(idleSession, 0);
    expect(startSession(running, 5)).toBe(running);
    expect(resumeSession(running, 5)).toBe(running);
  });

  it("finishes early from paused, keeping the elapsed time", () => {
    let session = startSession(idleSession, 0);
    session = pauseSession(session, 90_000);
    session = finishSession(session, 200_000);
    expect(session.status).toBe("finished");
    expect(elapsedMs(session, 300_000)).toBe(90_000);
  });

  describe("completeIfDue", () => {
    const endMs = 165_000; // 2:45

    it("keeps running before the end", () => {
      const running = startSession(idleSession, 0);
      expect(completeIfDue(running, 164_999, endMs)).toBe(running);
    });

    it("switches to finished after the last step, clamped to the end time", () => {
      const running = startSession(idleSession, 0);
      const done = completeIfDue(running, 170_321, endMs); // checked late
      expect(done.status).toBe("finished");
      expect(elapsedMs(done, 999_999)).toBe(endMs);
    });

    it("accounts for pauses when deciding", () => {
      let session = startSession(idleSession, 0);
      session = pauseSession(session, 100_000);
      session = resumeSession(session, 130_000);
      expect(completeIfDue(session, 190_000, endMs).status).toBe("running"); // 160s brewed
      expect(completeIfDue(session, 195_000, endMs).status).toBe("finished"); // 165s brewed
    });

    it("does not finish a paused session", () => {
      let session = startSession(idleSession, 0);
      session = pauseSession(session, 200_000);
      expect(completeIfDue(session, 300_000, endMs)).toBe(session);
    });
  });
});
