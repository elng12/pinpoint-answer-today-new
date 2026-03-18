import type { ReactNode } from "react";
import { Footer } from "@/components/site/layout/Footer";
import { NavBar } from "@/components/site/layout/NavBar";
import { getRecentEntries } from "@/lib/puzzles/data";

export default async function SiteLayout({ children }: { children: ReactNode }) {
  const recentEntries = await getRecentEntries(5);

  return (
    <>
      <NavBar />
      {children}
      <Footer recentEntries={recentEntries} />
    </>
  );
}
