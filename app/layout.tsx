import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NASDAQ Day Filter",
  description: "Filter and explore NASDAQ trading days by pattern criteria",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
