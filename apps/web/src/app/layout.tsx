import type { Metadata } from "next";
import { connection } from "next/server";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "FSJA Horarios",
  description: "Generación y gestión de horarios escolares.",
};

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  // Renderizado por petición en toda la app: Next.js solo pone el nonce de la CSP (src/proxy.ts) en los
  // scripts de páginas dinámicas; los de una página prerenderizada los bloquearía la CSP (02 §5.5).
  await connection();
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
