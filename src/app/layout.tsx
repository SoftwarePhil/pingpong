import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ping Pong Tracker",
  description: "Track ping pong games for your weekly group",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
