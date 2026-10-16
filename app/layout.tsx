import type { Metadata } from "next";
import "./globals.css";
import "./brand.css";
export const viewport = { width: "device-width", initialScale: 1, themeColor: "#142c45" };

export const metadata: Metadata = {
  title: "Ewidora — Mały biznes. Jasne finanse.",
  description: "Sprzedaż, wydatki, klienci i podsumowanie PIT-36. Prosta ewidencja działalności nierejestrowanej, dostępna na każdym urządzeniu.",
  applicationName: "Ewidora",
  openGraph: {
    title: "Ewidora — Mały biznes. Jasne finanse.",
    description: "Przychody, wydatki, klienci i PIT-36. Twoja działalność nierejestrowana pod kontrolą.",
    locale: "pl_PL",
    type: "website",
  },
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
