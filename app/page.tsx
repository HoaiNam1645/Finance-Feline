import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Trang chủ",
  description: "Trang điều hướng vào dashboard tài chính.",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function HomePage() {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }
  redirect("/dashboard");
}
