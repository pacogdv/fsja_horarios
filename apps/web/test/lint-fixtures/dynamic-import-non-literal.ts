export function loadModule(name: string) {
  return import(`../${name}`);
}
