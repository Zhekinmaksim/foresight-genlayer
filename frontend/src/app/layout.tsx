import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Foresight markets",
  description: "Self-settling prediction markets — GenLayer Intelligent Contracts",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
