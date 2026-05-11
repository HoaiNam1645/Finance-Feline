import { NextResponse } from "next/server";

export function ok<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

export function fail(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export function forbidden() {
  return fail("Forbidden", 403);
}

export function unauthorized() {
  return fail("Unauthorized", 401);
}
