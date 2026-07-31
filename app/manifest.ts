import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "香港現在適合出門嗎？",
    short_name: "香港出門",
    description: "把香港官方天氣與空氣質素資料，整理成容易理解的即時外出建議。",
    lang: "zh-Hant-HK",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#061827",
    theme_color: "#061827",
    icons: [
      {
        src: "/icons/pwa-192-v1.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/pwa-512-v1.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/pwa-maskable-512-v1.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/apple-touch-icon-v1.png",
        sizes: "180x180",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
