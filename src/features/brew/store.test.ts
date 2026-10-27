import { describe, expect, it } from "vitest";

import { createBrewStore } from "./store";

function setup() {
  let t = 0;
  const store = createBrewStore(() => t);
  return {
    store,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

describe("brew store", () => {
  it("runs, pauses and resumes using the injected clock", () => {
    const { store, advance } = setup();
    store.getState().toggle(); // start
    advance(10_000);
    store.getState().toggle(); // pause
    advance(30_000);
    expect(store.getState().elapsedMs()).toBe(10_000);

    store.getState().toggle(); // resume
    advance(5_000);
    expect(store.getState().elapsedMs()).toBe(15_000);
    expect(store.getState().session.status).toBe("running");
  });

  it("finishes after the last step when checked each frame", () => {
    const { store, advance } = setup();
    store.getState().start();
    advance(164_000);
    store.getState().completeIfDue(165_000);
    expect(store.getState().session.status).toBe("running");

    advance(2_000);
    store.getState().completeIfDue(165_000);
    expect(store.getState().session.status).toBe("finished");
    expect(store.getState().elapsedMs()).toBe(165_000);
  });

  it("does not notify subscribers when nothing changes", () => {
    const { store } = setup();
    let notifications = 0;
    store.subscribe(() => notifications++);
    store.getState().pause(); // idle: no-op
    store.getState().completeIfDue(1_000); // idle: no-op
    expect(notifications).toBe(0);
  });

  it("does not count time while ready", () => {
    const { store, advance } = setup();
    store.getState().ready();
    advance(20_000);
    expect(store.getState().session.status).toBe("ready");
    expect(store.getState().elapsedMs()).toBe(0);

    store.getState().toggle(); // the tap that starts the clock
    advance(3_000);
    expect(store.getState().elapsedMs()).toBe(3_000);
  });

  it("resets to idle", () => {
    const { store, advance } = setup();
    store.getState().start();
    advance(1_000);
    store.getState().reset();
    expect(store.getState().session.status).toBe("idle");
    expect(store.getState().elapsedMs()).toBe(0);
  });

  it("keeps separate instances independent", () => {
    const a = setup();
    const b = setup();
    a.store.getState().start();
    expect(b.store.getState().session.status).toBe("idle");
  });
});
