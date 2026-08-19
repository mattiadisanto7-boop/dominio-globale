import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Dominio Globale",
  description: "Gioco online di conquista strategica per 2–6 giocatori.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="it">
      <body>{children}</body>
    </html>
  );
}
