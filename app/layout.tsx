import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { DirectionProvider } from "@/components/ui/direction";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { getBaseUrl } from "@/lib/seo";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: getBaseUrl(),
  title: {
    default: "Bug Media Finance - Hệ thống quản lý thu chi nội bộ",
    template: "%s | Bug Media Finance",
  },
  description: "Hệ thống quản lý thu chi, phê duyệt mua sắm và báo cáo tài chính theo team.",
  applicationName: "Bug Media Finance",
  keywords: ["quản lý thu chi", "dashboard tài chính", "phê duyệt mua sắm", "bug media finance"],
  openGraph: {
    type: "website",
    locale: "vi_VN",
    siteName: "Bug Media Finance",
    title: "Bug Media Finance - Hệ thống quản lý thu chi nội bộ",
    description: "Hệ thống quản lý thu chi, phê duyệt mua sắm và báo cáo tài chính theo team.",
    url: getBaseUrl(),
  },
  twitter: {
    card: "summary",
    title: "Bug Media Finance - Hệ thống quản lý thu chi nội bộ",
    description: "Hệ thống quản lý thu chi, phê duyệt mua sắm và báo cáo tài chính theo team.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ThemeProvider>
          <DirectionProvider dir="ltr">
            <TooltipProvider delayDuration={150}>
              {children}
              <Toaster richColors />
            </TooltipProvider>
          </DirectionProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
