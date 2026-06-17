import type { Metadata } from "next";
import { FormFieldHelpRuntime } from "@/components/form-field-help-runtime";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://examvault.tutor-mcp.com"),
  applicationName: "Exam Vault",
  title: {
    default: "Exam Vault",
    template: "%s | Exam Vault",
  },
  description:
    "Server-authoritative exam delivery, private uploads, marking, annotation, and released feedback for serious assessment practice.",
  icons: {
    icon: "/icon.svg",
  },
  openGraph: {
    title: "Exam Vault",
    description:
      "Secure timed exam delivery, root-question uploads, marking, annotation, and feedback release in one private workspace.",
    url: "https://examvault.tutor-mcp.com",
    siteName: "Exam Vault",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Exam Vault",
    description:
      "Server-authoritative exam simulation, uploads, marking, annotation, and released feedback.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-ZA">
      <body>
        <FormFieldHelpRuntime />
        {children}
      </body>
    </html>
  );
}
