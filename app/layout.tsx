import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PSV Tools",
  description: "PSV content platform",
  icons: {
    icon: "https://www.psv.nl/upload/23adcb48-abc3-487f-9158-6bc7822599a6_PSV_logo_color.svg",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="nl">
      <body className="min-h-screen bg-background text-foreground antialiased">
        {children}
      </body>
    </html>
  );
}
