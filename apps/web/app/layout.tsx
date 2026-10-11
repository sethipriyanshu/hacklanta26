import type { Metadata } from "next";
import { Jost, Public_Sans } from "next/font/google";
import { MotionConfig } from "motion/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider, THEME_BOOT_SCRIPT } from "@/components/shell/ThemeProvider";
import { CommandLineProvider } from "@/components/shell/CommandLine";
import "./globals.css";

const jost = Jost({ variable: "--font-jost", subsets: ["latin"] });
const reading = Public_Sans({ variable: "--font-reading", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Trust Me Bro", template: "%s · Trust Me Bro" },
  description: "Prediction markets give you a number and say trust me bro. We show you the receipts.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning className={`${jost.variable} ${reading.variable} dark antialiased`} data-theme="dark">
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body className="min-h-dvh">
        <MotionConfig reducedMotion="user">
          <ThemeProvider>
            
              <TooltipProvider delay={250}>
                <CommandLineProvider>{children}</CommandLineProvider>
              </TooltipProvider>
            
          </ThemeProvider>
        </MotionConfig>
      </body>
    </html>
  );
}
