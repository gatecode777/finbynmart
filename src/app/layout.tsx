import type { Metadata } from "next";
import { Anton, Montserrat } from "next/font/google";
import { AnnouncementBar } from "@/components/layout/AnnouncementBar";
import { MainHeader } from "@/components/layout/MainHeader";
import { CategoryNavigation } from "@/components/layout/CategoryNavigation";
import { Footer } from "@/components/layout/Footer";
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
      <body>
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>
        <AnnouncementBar />
        <MainHeader />
        <CategoryNavigation />
        <main id="main-content">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
