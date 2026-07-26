import type { Metadata } from "next";
import { playfair, inter } from "@/lib/fonts";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://thelabpilatesstudio.com.mx"),
  title: {
    default: "The Lab Pilates | Estudio de Mat Pilates, Barre y Yoga en Huajuapan de León",
    template: "%s | The Lab Pilates",
  },
  description:
    "Estudio boutique de Mat Pilates, Barre y Hatha Yoga en Huajuapan de León, Oaxaca. Clases en grupos reducidos con coaches certificados. Fortalece cuerpo y mente en un espacio diseñado para tu bienestar.",
  keywords: [
    "pilates huajuapan",
    "mat pilates oaxaca",
    "barre huajuapan de león",
    "yoga huajuapan",
    "hatha yoga oaxaca",
    "estudio pilates",
    "the lab pilates",
    "clases pilates huajuapan",
    "bienestar huajuapan de león",
    "ejercicio huajuapan",
  ],
  authors: [{ name: "The Lab Pilates Studio" }],
  creator: "The Lab Pilates Studio",
  publisher: "The Lab Pilates Studio",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  openGraph: {
    title: "The Lab Pilates | Mat Pilates, Barre y Yoga en Huajuapan de León",
    description:
      "Estudio boutique de Mat Pilates, Barre y Hatha Yoga. Clases en grupos reducidos con coaches certificados en Huajuapan de León, Oaxaca.",
    type: "website",
    url: "https://thelabpilatesstudio.com.mx",
    locale: "es_MX",
    siteName: "The Lab Pilates",
    images: [
      {
        url: "/images/TheLabPilatesStudioLogo.png",
        width: 1200,
        height: 630,
        alt: "The Lab Pilates Studio - Interior del estudio",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "The Lab Pilates | Mat Pilates, Barre y Yoga",
    description:
      "Estudio boutique en Huajuapan de León. Fortalece cuerpo y mente en un espacio diseñado para tu bienestar.",
    images: ["/images/TheLabPilatesStudioLogo.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  alternates: {
    canonical: "/",
  },
  category: "fitness",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${playfair.variable} ${inter.variable} h-full antialiased`}
      data-scroll-behavior="smooth"
      suppressHydrationWarning
    >
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
          rel="stylesheet"
        />
      </head>
      <body
        className="min-h-full flex flex-col bg-background font-body text-soft-charcoal overflow-x-hidden"
        suppressHydrationWarning
      >
        {children}
      </body>
    </html>
  );
}
