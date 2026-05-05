import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Exam Vault",
  description: "Secure, server-authoritative exam simulation for serious practice.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-ZA">
      <body>{children}</body>
    </html>
  );
}
