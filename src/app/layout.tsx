import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Toaster } from "sonner";
import { ServiceWorker } from "@/components/service-worker";
import { ThemeProvider } from "@/components/ui/theme";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

/** Il nome del prodotto, scritto una volta sola. Lo usano i metadata qui sotto
 *  e l'intestazione delle schermate di accesso (src/app/(auth)/layout.tsx).
 *  «Turni» resta il nome della pagina dei turni: sono due cose diverse.
 *  L'unica copia che non puo' importarlo e' public/manifest.webmanifest, che e'
 *  JSON: se cambia qui, va cambiato anche la'. */
export const NOME_PRODOTTO = "DenkiShift";

export const metadata: Metadata = {
  title: NOME_PRODOTTO,
  description: "Pianificazione turni per squadre e aziende.",
  manifest: "/manifest.webmanifest",
  applicationName: NOME_PRODOTTO,
  icons: {
    icon: [
      { url: "/icone/icona-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icone/icona-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icone/icona-180.png", sizes: "180x180", type: "image/png" }],
  },
  // iOS non legge il manifest: lo schermo intero e il nome sotto l'icona si
  // chiedono con questi meta tag, non con il file.
  appleWebApp: {
    capable: true,
    title: NOME_PRODOTTO,
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#e9ebf0" },
    { media: "(prefers-color-scheme: dark)", color: "#08080a" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning: next-themes scrive la classe del tema
    // sull'<html> prima che React idrati, quindi server e client differiscono
    // di proposito su quell'attributo.
    <html lang="it" className={inter.variable} suppressHydrationWarning>
      <body className="min-h-app bg-canvas text-text antialiased">
        <ThemeProvider>
          {children}
          <ServiceWorker />
          <Toaster
            position="top-center"
            toastOptions={{
              className:
                "!bg-surface !text-text !border-border !rounded-xl !shadow-float",
            }}
          />
        </ThemeProvider>
      </body>
    </html>
  );
}
