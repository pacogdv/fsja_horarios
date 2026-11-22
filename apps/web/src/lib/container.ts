/**
 * Composition root (specs/02-architecture-plan.md §1.2).
 *
 * Es el único módulo de app/ui/lib autorizado a importar `src/infrastructure`: instancia los
 * adaptadores y los entrega a los casos de uso a través de sus puertos. Se irá completando en las
 * tareas que introducen cada adaptador (T1.9 en adelante).
 */
export type Container = Readonly<Record<string, never>>;

export function createContainer(): Container {
  return Object.freeze({});
}
