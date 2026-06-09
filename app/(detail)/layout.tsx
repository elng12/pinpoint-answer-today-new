import "./detail.css";
import type { ReactNode } from "react";
import { Footer } from "@/components/layout/Footer";
import { NavBar } from "@/components/layout/NavBar";

export default async function DetailLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <NavBar isDetailPage />
      {children}
      <Footer isDetailPage />
    </>
  );
}
