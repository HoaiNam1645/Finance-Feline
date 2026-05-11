import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

const SESSION_COOKIE = "finance_session";
const encoder = new TextEncoder();

async function getRolesFromToken(token: string) {
  try {
    const secret = process.env.JWT_SECRET ?? "change-me-in-production";
    const { payload } = await jwtVerify(token, encoder.encode(secret));
    return Array.isArray(payload.roles) ? payload.roles.map(String) : [];
  } catch {
    return [];
  }
}

export async function middleware(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const hasSession = Boolean(token);
  const { pathname } = request.nextUrl;

  // Receipt files are stored under /public/uploads and must stay publicly readable
  // so Next.js image optimizer can fetch them reliably.
  if (pathname.startsWith("/uploads/")) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api") && !pathname.startsWith("/api/auth") && !hasSession) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (pathname.startsWith("/login") && hasSession) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  if (!pathname.startsWith("/api") && pathname !== "/login" && !hasSession) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (token && !pathname.startsWith("/api") && pathname !== "/login") {
    const roles = await getRolesFromToken(token);
    const isAccountantOnly = roles.includes("ACCOUNTANT") && !roles.includes("ADMIN");
    const isEmployeeOnly = roles.includes("EMPLOYEE") && !roles.includes("ADMIN") && !roles.includes("ACCOUNTANT");
    const restrictedPaths = ["/settings", "/categories", "/logs", "/users"];
    if (isEmployeeOnly && restrictedPaths.some((path) => pathname.startsWith(path))) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
    if (isAccountantOnly && (pathname.startsWith("/settings") || pathname.startsWith("/users"))) {
      return NextResponse.redirect(new URL("/transactions", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
