import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const session = request.cookies.get("psv_session");
  const { pathname } = request.nextUrl;

  const isLoginPage = pathname === "/login";
  const isApiRoute = pathname.startsWith("/api/");

  // Always allow API routes through
  if (isApiRoute) return NextResponse.next();

  // Redirect unauthenticated users to login
  if (!session && !isLoginPage) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Redirect authenticated users away from login
  if (session && isLoginPage) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|fonts|images).*)",
  ],
};
