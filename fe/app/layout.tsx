import type { Metadata } from "next";
import { Fraunces, Be_Vietnam_Pro } from "next/font/google";
import "./globals.css";
import { ThemeToggle } from "../components/ThemeToggle";

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  style: ["normal", "italic"],
  weight: ["300", "400", "700"],
});

const beVietnamPro = Be_Vietnam_Pro({
  variable: "--font-be-vietnam",
  subsets: ["latin", "vietnamese"],
  weight: ["300", "400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "VietAI Scholar",
  description: "Dịch tài liệu học thuật PDF sang tiếng Việt với AI",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="vi"
      className={`${fraunces.variable} ${beVietnamPro.variable} h-full`}
      suppressHydrationWarning
    >
      <head>
        {/* Apply saved theme before first paint — prevents flash (rendering-hydration-no-flicker) */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(localStorage.getItem('theme')==='light')document.documentElement.classList.add('light')}catch(_){}`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">
        <ThemeToggle />
        {children}
      </body>
    </html>
  );
}
