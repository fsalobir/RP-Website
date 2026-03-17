import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

export const config = {
  matcher: ["/admin/:path*"],
};

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const isPublicAdmin = path === "/admin/connexion" || path === "/admin/inscription";

  const response = NextResponse.next();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!isPublicAdmin && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/admin/connexion";
    url.searchParams.set("redirect", path);
    return NextResponse.redirect(url);
  }

  return response;
}

