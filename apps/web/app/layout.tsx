import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { MotionConfig } from "motion/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider, THEME_BOOT_SCRIPT } from "@/components/shell/ThemeProvider";
import { ProfileProvider } from "@/components/shell/ProfileProvider";
import { CommandLineProvider } from "@/components/shell/CommandLine";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Trust Me Bro", template: "%s · Trust Me Bro" },
  description: "Prediction markets give you a number and say trust me bro. We show you the receipts.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body className="h-full overflow-hidden">
        <MotionConfig reducedMotion="user">
          <ThemeProvider>
            <ProfileProvider>
              <TooltipProvider delay={250}>
                <CommandLineProvider>{children}</CommandLineProvider>
              </TooltipProvider>
            </ProfileProvider>
          </ThemeProvider>
        </MotionConfig>
      </body>
    </html>
  );
}
