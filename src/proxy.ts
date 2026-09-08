import { NextResponse, type NextRequest } from "next/server";

export const LANG_HEADER = "x-rental-lang";

/**
 * Two jobs, both about getting request context to the right place.
 *
 * 1. Host-based tenant resolution. The canonical URL shape is
 *    `/{agencySlug}/...`; this rewrites `{slug}.{APP_ROOT_DOMAIN}/...` onto it so
 *    one set of pages serves both without duplicating routes.
 *
 * 2. Language forwarding. Layouts do not receive `searchParams`, but the public
 *    site's layout needs the chosen language to set `lang`/`dir` and translate
 *    its own chrome. The choice is copied from the query string into a request
 *    header, which a layout *can* read.
 *
 * Custom domains are resolved in the page layer, not here: the proxy runs on the
 * edge runtime where Prisma is unavailable, and a database lookup per request
 * would be the wrong thing to put in front of every asset anyway.
 */
export function proxy(request: NextRequest) {
  const headers = new Headers(request.headers);

  const lang = request.nextUrl.searchParams.get("lang");
  if (lang) headers.set(LANG_HEADER, lang);

  const rootDomain = process.env.APP_ROOT_DOMAIN;
  const host = request.headers.get("host")?.split(":")[0]?.toLowerCase();

  const shouldRewriteHost =
    rootDomain && host && host !== rootDomain && host.endsWith(`.${rootDomain}`);

  if (!shouldRewriteHost) {
    return NextResponse.next({ request: { headers } });
  }

  const slug = host.slice(0, -(rootDomain.length + 1));
  if (!slug || slug === "www" || slug.includes(".")) {
    return NextResponse.next({ request: { headers } });
  }

  const { pathname } = request.nextUrl;
  if (pathname === `/${slug}` || pathname.startsWith(`/${slug}/`)) {
    return NextResponse.next({ request: { headers } });
  }

  const url = request.nextUrl.clone();
  url.pathname = `/${slug}${pathname === "/" ? "" : pathname}`;
  return NextResponse.rewrite(url, { request: { headers } });
}

export const config = {
  // Everything except Next internals, API routes and files with an extension.
  matcher: ["/((?!_next/|api/|.*\\.[\\w]+$).*)"],
};
