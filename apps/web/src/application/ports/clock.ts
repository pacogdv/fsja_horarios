/**
 * Puerto del reloj (specs/03-tasks.md T1.10 y T1.12): permite probar caducidades sin esperar.
 */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = Object.freeze({ now: () => new Date() });
