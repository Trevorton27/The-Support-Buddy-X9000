import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { ThemeProvider } from "@/components/theme-provider";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "The Support Buddy X9000",
  description: "AI-powered support mission control with intelligent work prioritization and multi-agent investigation",
};

// Runs synchronously before React hydration to prevent flash of wrong theme
const themeScript = `(function(){var t=localStorage.getItem('theme');if(t!=='light'){document.documentElement.classList.add('dark')}})()`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider>
      <html lang="en" suppressHydrationWarning>
        <head>
          <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        </head>
        <body className={inter.className}>
          <ThemeProvider>{children}</ThemeProvider>
          <Analytics />
        </body>
      </html>
    </ClerkProvider>
  );
}
