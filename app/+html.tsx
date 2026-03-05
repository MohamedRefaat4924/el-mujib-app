import { ScrollViewStyleReset } from "expo-router/html";
import type { PropsWithChildren } from "react";

/**
 * Custom HTML template for the web build.
 * Adds PWA support (manifest, meta tags) and prevents zoom on text inputs.
 */
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />

        {/* Prevent zoom on text input focus (iOS Safari) */}
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover"
        />

        {/* PWA Meta Tags */}
        <meta name="theme-color" content="#1A6B3C" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="El Mujib" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="application-name" content="El Mujib" />
        <meta name="description" content="El Mujib WhatsApp Chat" />

        {/* PWA Manifest */}
        <link rel="manifest" href="/manifest.json" />

        {/* Apple Touch Icons */}
        <link rel="apple-touch-icon" href="/icon-192.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/icon-192.png" />

        {/* Prevent zoom on double-tap and pinch */}
        <style
          dangerouslySetInnerHTML={{
            __html: `
              /* Prevent zoom on input focus (iOS Safari) */
              input, textarea, select {
                font-size: 16px !important;
              }
              /* Prevent double-tap zoom */
              * {
                touch-action: manipulation;
              }
              /* Prevent text selection zoom on iOS */
              body {
                -webkit-text-size-adjust: 100%;
                text-size-adjust: 100%;
              }
              /* PWA standalone mode adjustments */
              @media all and (display-mode: standalone) {
                body {
                  -webkit-user-select: none;
                  user-select: none;
                }
              }
            `,
          }}
        />

        <ScrollViewStyleReset />
      </head>
      <body>{children}</body>
    </html>
  );
}
