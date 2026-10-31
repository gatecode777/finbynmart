import type { Metadata } from "next";
import { Playfair_Display, Poppins } from "next/font/google";
import { AnnouncementBar } from "@/components/layout/AnnouncementBar";
import { MainHeader } from "@/components/layout/MainHeader";
import { CategoryNavigation } from "@/components/layout/CategoryNavigation";
import { Footer } from "@/components/layout/Footer";
import "./globals.css";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-poppins",
  display: "swap",
});

const playfair = Playfair_Display({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-playfair",
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
    <html lang="en">
      <body className={`${poppins.variable} ${playfair.variable}`}>
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
