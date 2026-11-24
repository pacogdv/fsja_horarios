import type { Metadata } from "next";
import localFont from "next/font/local";
import { cookies } from "next/headers";
import { connection } from "next/server";
import type { ReactNode } from "react";
import { parseThemePreference, THEME_COOKIE, themeAttribute } from "@/ui/layout/theme";
import "./globals.css";

// Inter autoalojada (02 §6.2; ADR-0010): sin CDN, así que basta con `font-src 'self'`. El subconjunto latino
// cubre el español (á, é, ñ, ü, ¿, ¡).
const inter = localFont({
  src: "../../node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2",
  weight: "100 900",
  style: "normal",
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "FSJA Horarios",
  description: "Generación y gestión de horarios escolares.",
};

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  // Renderizado por petición en toda la app: Next.js solo pone el nonce de la CSP (src/proxy.ts) en los
  // scripts de páginas dinámicas; los de una página prerenderizada los bloquearía la CSP (02 §5.5).
  await connection();
  // El tema elegido se pinta desde el servidor: sin parpadeo al cargar (02 §6.2).
  const theme = parseThemePreference((await cookies()).get(THEME_COOKIE)?.value);
  return (
    <html lang="es" data-theme={themeAttribute(theme)} className={inter.variable}>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
