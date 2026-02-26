import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Exécuter sur toutes les routes pour rafraîchir la session à chaque requête (évite la déconnexion au changement de page)
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"] };

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
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
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Rafraîchir la session (permet de prolonger la connexion au changement de page)
  const { data: { user } } = await supabase.auth.getUser();

  const isPublicAdmin =
    path === "/admin/connexion" || path === "/admin/inscription";
  if (path.startsWith("/admin") && !isPublicAdmin && !user) {
    return NextResponse.redirect(new URL("/admin/connexion", request.url));
  }

  return response;
}
