import type { Metadata } from "next";
import "@hypercore/ui/styles/globals.css";
import localFont from "next/font/local";

const switzer = localFont({
  src: "./fonts/Switzer-Variable.ttf",
  variable: "--font-switzer",
});

const jetbrainsMono = localFont({
  src: "./fonts/JetBrainsMono-Variable.ttf",
  variable: "--font-jetbrains-mono",
});

export const metadata: Metadata = {
  title: "HyperCore",
  description: "A Volunteer Computing Architecture for Serverless Function Execution at the Network Edge",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${switzer.className} ${jetbrainsMono.variable}`}>{children}</body>
    </html>
  );
}
