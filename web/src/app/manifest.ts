import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Mo'sSmartPlantCare",
    short_name: "Mo'sPlantCare",
    description: "Feuchte, Licht und Gießempfehlungen für deine Zimmerpflanzen",
    start_url: "/",
    display: "standalone",
    background_color: "#f7f6f1",
    theme_color: "#1f5835",
    lang: "de",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
