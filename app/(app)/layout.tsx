import type { Metadata } from "next";
import { MainSidebar } from "@/components/app/main-sidebar";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
    },
  },
};

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <MainSidebar>{children}</MainSidebar>;
}
