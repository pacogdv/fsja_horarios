// @vitest-environment node
/**
 * T1.10 — Reloj del sistema (puerto `Clock`).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { systemClock } from "./clock";

describe("systemClock", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("devuelve la hora actual del sistema en cada llamada", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-24T08:00:00.000Z"));
    expect(systemClock.now()).toEqual(new Date("2026-11-24T08:00:00.000Z"));
    vi.setSystemTime(new Date("2026-11-24T09:30:00.000Z"));
    expect(systemClock.now()).toEqual(new Date("2026-11-24T09:30:00.000Z"));
  });

  it("no se puede sustituir en tiempo de ejecución", () => {
    expect(Object.isFrozen(systemClock)).toBe(true);
  });
});
