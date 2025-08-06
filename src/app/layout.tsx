import "@/styles/globals.css";
import Kbar from "@/app/mail/components/kbar";
import { ClerkProvider } from "@clerk/nextjs";

import { GeistSans } from "geist/font/sans";
import { type Metadata } from "next";

import { TRPCReactProvider } from "@/trpc/react";
import { ThemeProvider } from "@/components/theme-provicer";
import { Toaster } from "sonner";

export const metadata: Metadata = {
  title: "Normal Human",
  icons: [{ rel: "icon", url: "/favicon.ico" }],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const hasClerkKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && 
                      process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY !== "";

  if (hasClerkKey) {
    return (
      <ClerkProvider>
        <html lang="en" className={`${GeistSans.variable}`}>
          <body>
            <ThemeProvider attribute='class' defaultTheme='system' enableSystem disableTransitionOnChange>
              <TRPCReactProvider>
                <Kbar>
                  {children}
                </Kbar>
              </TRPCReactProvider>
              <Toaster />
            </ThemeProvider>
          </body>
        </html>
      </ClerkProvider>
    );
  }

  // Fallback without authentication
  return (
    <html lang="en" className={`${GeistSans.variable}`}>
      <body>
        <ThemeProvider attribute='class' defaultTheme='system' enableSystem disableTransitionOnChange>
          <TRPCReactProvider>
            <Kbar>
              {children}
            </Kbar>
          </TRPCReactProvider>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
