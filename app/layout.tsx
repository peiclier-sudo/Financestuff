import type { Metadata } from "next";
import "./globals.css";
import AmbientProvider from "./components/AmbientProvider";

export const metadata: Metadata = {
  title: "NDX Day Filter",
  description: "Filter and explore NASDAQ trading days by pattern criteria",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
      </head>
      <body>
        <AmbientProvider>{children}</AmbientProvider>
      </body>
    </html>
  );
}
