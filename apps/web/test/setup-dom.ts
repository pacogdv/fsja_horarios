/**
 * Preparación de los tests unitarios (jsdom): matchers de jest-dom (`toBeInTheDocument`, `toBeChecked`…) y
 * desmontaje de los componentes de React Testing Library tras cada test, porque Vitest no usa globales.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
});
