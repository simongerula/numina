import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Inter is vendored in ./fonts (SIL OFL, see Inter-OFL-LICENSE.txt) so the
// build makes zero network requests — nothing is fetched from Google.
const inter = localFont({
  src: "./fonts/InterVariable.woff2",
  variable: "--font-inter",
  weight: "100 900",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Numina | Local money tracker",
  description:
    "A private, local-first money tracker. No cloud, no login, no telemetry.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} h-full`}
      suppressHydrationWarning
    >
      <body className="min-h-full antialiased">{children}</body>
    </html>
  );
}
