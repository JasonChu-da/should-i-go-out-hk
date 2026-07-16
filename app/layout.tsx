import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "香港現在適合出門嗎？",
  description: "把香港官方天氣與空氣質素資料，整理成容易理解的即時外出建議。",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#061827" },
    { media: "(prefers-color-scheme: dark)", color: "#061827" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="zh-Hant-HK" data-weather-motion="on" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{document.documentElement.dataset.weatherMotion=localStorage.getItem('weather-scene-motion:v1')==='off'?'off':'on'}catch(e){}",
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
