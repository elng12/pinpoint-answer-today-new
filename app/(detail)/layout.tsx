import "./detail.css";
import type { ReactNode } from "react";
import { Footer } from "@/components/site/layout/Footer";
import { NavBar } from "@/components/site/layout/NavBar";
import { getRecentEntries } from "@/lib/puzzles/data";

export default async function DetailLayout({ children }: { children: ReactNode }) {
  const recentEntries = await getRecentEntries(10);

  return (
    <>
      <NavBar isDetailPage />
      {children}
      <Footer recentEntries={recentEntries} isDetailPage />
    </>
  );
}
