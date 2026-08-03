import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "../components/AuthProvider";

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
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
