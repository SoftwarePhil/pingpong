import type { Metadata } from "next";
import { Archivo } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { AuthProvider } from "../components/AuthProvider";
import { ThemeProvider } from "../components/ThemeProvider";
import { SiteHeader } from "../components/SiteHeader";
import { ConfirmProvider } from "../components/ConfirmDialog";
import { BouncingBall } from "../components/BouncingBall";

// One variable family: its width axis gives both the wide display headings
// and the condensed scoreboard digits.
const archivo = Archivo({
  subsets: ["latin"],
  axes: ["wdth"],
  variable: "--font-archivo",
  display: "swap",
});

export const metadata: Metadata = {
  title: "pingpong.beer",
  description: "Weekly ping pong tournaments, tracked.",
};

const themeInitScript = `(() => {
  try {
    const storedTheme = window.localStorage.getItem('pingpong-theme');
    const theme = storedTheme === 'light' || storedTheme === 'dark'
      ? storedTheme
      : 'light';
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  } catch {}
})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={archivo.variable} suppressHydrationWarning>
      <head>
        <Script id="theme-init" strategy="beforeInteractive">{themeInitScript}</Script>
      </head>
      <body className="antialiased">
        <ThemeProvider>
          <AuthProvider>
            <ConfirmProvider>
              <BouncingBall />
              <SiteHeader />
              {children}
            </ConfirmProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
