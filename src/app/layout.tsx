import type { Metadata } from "next";
import { Anton, Montserrat } from "next/font/google";
import { AnnouncementBar } from "@/components/layout/AnnouncementBar";
import { MainHeader } from "@/components/layout/MainHeader";
import { CategoryNavigation } from "@/components/layout/CategoryNavigation";
import { Footer } from "@/components/layout/Footer";
import { SiteChrome } from "@/components/layout/SiteChrome";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { ToastHost } from "@/components/ui/Toast";
import "./globals.css";

const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-montserrat",
  display: "swap",
});

const anton = Anton({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-anton",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Finbyn Mart — India's Trusted B2B Marketplace",
  description:
    "Connect with verified manufacturers, suppliers, wholesalers and exporters across India. Get the best prices, compare quotes and grow your business with trusted partners.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${montserrat.variable} ${anton.variable}`}>
      {/* Extensions (password managers, dark-mode tools) often add attributes to <body> before hydration. */}
      <body suppressHydrationWarning>
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>
        <SiteChrome
          top={
            <>
              <AnnouncementBar />
              <MainHeader />
              <CategoryNavigation />
            </>
          }
          bottom={<Footer />}
        >
          {children}
        </SiteChrome>
        <ToastHost />
        <SpeedInsights />
      </body>
    </html>
  );
}
