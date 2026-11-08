import type { Metadata, Viewport } from "next";
import "@fontsource/lilita-one/400.css";
import "@fontsource/nunito/700.css";
import "@fontsource/nunito/800.css";
import "@fontsource/nunito/900.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Golden Brick Club",
  description: "The Atlanta United prediction league.",
  appleWebApp: {
    capable: true,
    title: "Golden Brick",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#1b1426" },
    { media: "(prefers-color-scheme: light)", color: "#fff1d6" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
