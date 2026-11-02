import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Smart Plant Monitor",
    short_name: "Pflanzen",
    description: "Feuchte, Licht und Gießempfehlungen für deine Zimmerpflanzen",
    start_url: "/",
    display: "standalone",
    background_color: "#fafaf9",
    theme_color: "#059669",
    lang: "de",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
