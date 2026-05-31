import type { ReactNode } from "react";
import { Footer } from "@/components/layout/Footer";
import { NavBar } from "@/components/layout/NavBar";

export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <NavBar />
      {children}
      <Footer />
    </>
  );
}
