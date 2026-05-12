import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { jwtVerify, SignJWT } from "jose";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";

const encoder = new TextEncoder();
const SESSION_COOKIE = "finance_session";

export type SessionUser = {
  id: string;
  email: string;
  fullName: string;
  roles: string[];
};

type SessionPayload = {
  sub: string;
  email: string;
  fullName: string;
  roles: string[];
};

export async function verifyPassword(plain: string, hashed: string) {
  return bcrypt.compare(plain, hashed);
}

export async function createSessionToken(user: SessionUser) {
  return new SignJWT({ email: user.email, fullName: user.fullName, roles: user.roles })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime("12h")
    .sign(encoder.encode(env.jwtSecret));
}

export async function setSessionCookie(token: string) {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE === "true",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) {
    return null;
  }

  try {
    const { payload } = await jwtVerify(token, encoder.encode(env.jwtSecret));
    const userId = String(payload.sub);
    if (!userId) {
      return null;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        roles: {
          include: {
            role: true,
          },
        },
      },
    });
    if (!user || user.status !== "ACTIVE") {
      return null;
    }

    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      roles: user.roles.map((entry: (typeof user.roles)[number]) => entry.role.code),
    };
  } catch {
    return null;
  }
}

export async function requireSessionUser() {
  const user = await getSessionUser();
  if (!user) {
    throw new Error("Unauthorized");
  }
  return user;
}

export async function loginWithPassword(email: string, password: string): Promise<SessionUser | null> {
  const user = await prisma.user.findUnique({
    where: { email },
    include: {
      roles: {
        include: {
          role: true,
        },
      },
    },
  });

  if (!user) {
    return null;
  }
  if (user.status !== "ACTIVE") {
    return null;
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    return null;
  }

  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    roles: user.roles.map((entry: (typeof user.roles)[number]) => entry.role.code),
  };
}

export function toSessionPayload(user: SessionUser): SessionPayload {
  return {
    sub: user.id,
    email: user.email,
    fullName: user.fullName,
    roles: user.roles,
  };
}
