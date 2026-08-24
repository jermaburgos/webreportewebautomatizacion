import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MI Dashboard",
  description: "Panel de ejecuciones y reportes conectado a Supabase",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className="h-full antialiased">
      <body className="min-h-full overflow-x-hidden bg-slate-950 text-slate-100">{children}</body>
    </html>
  );
}
