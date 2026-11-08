import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Golden Brick Club",
    short_name: "Golden Brick",
    description: "The Atlanta United prediction league.",
    start_url: "/",
    display: "standalone",
    background_color: "#1b1426",
    theme_color: "#1b1426",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
  };
}
