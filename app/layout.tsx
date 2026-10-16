import type { Metadata } from "next";
import "./globals.css";
export const viewport = { width: "device-width", initialScale: 1, themeColor: "#23765b" };

export const metadata: Metadata = {
  title: "Mała Księga — Twoja działalność, pod kontrolą",
  description: "Sprzedaż, wydatki, klienci i podsumowanie PIT-36. Prosta ewidencja działalności nierejestrowanej, dostępna na każdym urządzeniu.",
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
    <html lang="pl">
      <body className="antialiased">{children}</body>
    </html>
  );
}
