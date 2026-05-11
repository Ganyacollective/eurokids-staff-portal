import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Eurokids Staff Portal",
  description: "Payroll, attendance, and leave management for Eurokids JMD Enclave.",
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
