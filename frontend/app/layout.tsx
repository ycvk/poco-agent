import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/shared/theme-provider";
import { fallbackLng } from "@/lib/i18n/settings";
import { Toaster } from "@/components/ui/sonner";

export const metadata: Metadata = {
  title: "Poco",
  description: "A multi-service AI agent execution platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang={fallbackLng}
      suppressHydrationWarning
      className="h-full"
    >
      <body
        className="antialiased h-full"
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          storageKey="poco-theme"
          disableTransitionOnChange
        >
          {children}
          <Toaster position="top-right" />
        </ThemeProvider>
      </body>
    </html>
  );
}
