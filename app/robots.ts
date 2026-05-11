import type { MetadataRoute } from "next";
import { getBaseUrl } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  const base = getBaseUrl();

  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/login"],
        disallow: [
          "/api/",
          "/dashboard",
          "/transactions",
          "/purchase-requests",
          "/categories",
          "/payment-accounts",
          "/users",
          "/settings",
          "/logs",
        ],
      },
    ],
    sitemap: `${base.origin}/sitemap.xml`,
  };
}
