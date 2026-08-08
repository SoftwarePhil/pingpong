import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import { AuthProvider } from "../components/AuthProvider";
import { ThemeProvider } from "../components/ThemeProvider";
import { SettingsMenu } from "../components/SettingsMenu";

export const metadata: Metadata = {
  title: "Ping Pong Tracker",
  description: "Track ping pong games for your weekly group",
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
    <html lang="en" suppressHydrationWarning>
      <head>
        <Script id="theme-init" strategy="beforeInteractive">{themeInitScript}</Script>
      </head>
      <body className="antialiased">
        <ThemeProvider>
          <AuthProvider>
            {children}
            <SettingsMenu />
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
