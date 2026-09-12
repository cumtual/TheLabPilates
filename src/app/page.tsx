import Navbar from "@/components/layout/Navbar";
import Hero from "@/components/sections/Hero";
import Philosophy from "@/components/sections/Philosophy";
import MatPilatesInfo from "@/components/sections/MatPilatesInfo";
import Barre from "@/components/sections/Barre";
import HathaYoga from "@/components/sections/HathaYoga";
import Pricing from "@/components/sections/Pricing";
import MembershipBenefits from "@/components/sections/MembershipBenefits";
import Schedule from "@/components/sections/Schedule";
import Location from "@/components/sections/Location";
import Footer from "@/components/layout/Footer";

// ISR: regenerate the landing (and its schedule query) at most every 5 minutes.
// On-demand revalidation is also triggered by class/enrollment mutations.
export const revalidate = 300;

export default function Home() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SportsActivityLocation",
    name: "The Lab Pilates Studio",
    description:
      "Estudio boutique de Mat Pilates, Barre y Hatha Yoga en Huajuapan de León, Oaxaca.",
    url: "https://thelabpilatesstudio.com.mx",
    // telephone: "+529531234567",
    email: "info@thelabpilatesstudio.com.mx",
    address: {
      "@type": "PostalAddress",
      streetAddress: "Matamoros & Calle Prolongación de Micaela Galindo, centro",
      addressLocality: "Huajuapan de León",
      addressRegion: "Oaxaca",
      addressCountry: "MX",
    },
    openingDate: "2026-08",
    sameAs: [],
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Navbar />
      <main>
        <Hero />
        <Philosophy />
        <MatPilatesInfo />
        <Barre />
        <HathaYoga />
        <Pricing />
        <MembershipBenefits />
        <Schedule />
        <Location />
      </main>
      <Footer />
      <div className="grain" />
    </>
  );
}
