import type { Clock } from "@/application/ports/clock";
import { overlaps } from "@/domain/time/interval";

export const systemClock: Clock = { now: () => new Date() };
export const check = overlaps;
