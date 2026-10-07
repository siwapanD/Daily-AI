import { NextResponse, type NextRequest } from "next/server";

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

/**
 * Single-user protection:
 *  - /api/health is public (for Docker/reverse-proxy health checks)
 *  - /api/jobs/* accepts `Authorization: Bearer $CRON_SECRET`
 *  - everything else requires HTTP Basic Auth when APP_PASSWORD is set (any username)
 */
export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname === "/api/health") return NextResponse.next();

  const auth = req.headers.get("authorization") ?? "";
  const cron = process.env.CRON_SECRET;
  if (pathname.startsWith("/api/jobs/") && cron && auth.startsWith("Bearer ") && timingSafeEqual(auth.slice(7), cron)) {
    return NextResponse.next();
  }

  const password = process.env.APP_PASSWORD;
  if (!password) return NextResponse.next();
  if (auth.startsWith("Basic ")) {
    try {
      const decoded = atob(auth.slice(6));
      const pass = decoded.slice(decoded.indexOf(":") + 1);
      if (timingSafeEqual(pass, password)) return NextResponse.next();
    } catch {}
  }
  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="DAILY AI", charset="UTF-8"' },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
