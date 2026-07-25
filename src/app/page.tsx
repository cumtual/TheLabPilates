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

export default function Home() {
  return (
    <>
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
