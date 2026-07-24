import type { Metadata } from "next";
import { playfair, inter } from "@/lib/fonts";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://thelabpilates.com"),
  title: "The Lab Pilates | Estudio de Mat Pilates en Huajuapan de León",
  description:
    "Descubre Mat Pilates en The Lab Pilates. Clases grupales e individuales en un espacio diseñado para tu bienestar físico y mental. Reserva tu clase hoy.",
  openGraph: {
    title: "The Lab Pilates | Estudio de Mat Pilates",
    description:
      "Descubre Mat Pilates en The Lab Pilates. Clases grupales e individuales en un espacio diseñado para tu bienestar físico y mental.",
    type: "website",
    url: "https://thelabpilates.com",
    locale: "es_ES",
    siteName: "The Lab Pilates",
  },
  robots: {
    index: true,
    follow: true,
  },
  alternates: {
    canonical: "/",
  },
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
