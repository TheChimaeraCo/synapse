import type { Metadata } from "next";
import { Toaster } from "sonner";
import { Providers } from "./providers";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import "./globals.css";

const metadataBase = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000");
  } catch {
    return new URL("http://localhost:3000");
  }
})();

export const metadata: Metadata = {
  metadataBase,
  title: "Synapse Hub - AI Gateway Management",
  description: "Self-hosted AI gateway for managing conversations, models, and channels across multiple platforms.",
  openGraph: {
    title: "Synapse Hub - AI Gateway Management",
    description: "Self-hosted AI gateway for managing conversations, models, and channels across multiple platforms.",
    siteName: "Synapse Hub",
    type: "website",
    images: [{ url: "/icon-512.png", width: 512, height: 512, alt: "Synapse Hub" }],
  },
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1" />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#0a0a0f" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
      </head>
      <body className="font-sans antialiased overscroll-none overflow-hidden bg-gradient-to-br from-[#0a0a12] via-[#0d0d1a] to-[#0a0f18]">
        <Providers>
          <ErrorBoundary>
            {children}
          </ErrorBoundary>
          <Toaster theme="dark" richColors position="bottom-right" />
        </Providers>
      </body>
    </html>
  );
}
