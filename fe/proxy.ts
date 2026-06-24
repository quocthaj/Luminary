import { auth } from '@/auth';

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const isTestMode = req.nextUrl.searchParams.get('test_mode') === 'true' || req.cookies.get('test_mode')?.value === 'true';
  const isProtectedPage = req.nextUrl.pathname.startsWith('/library') || req.nextUrl.pathname.startsWith('/explore');
  const isProtectedApi = req.nextUrl.pathname.startsWith('/api/preview') && !req.nextUrl.pathname.startsWith('/api/preview/mock-');

  if ((isProtectedPage || isProtectedApi) && !isLoggedIn && !isTestMode) {
    if (isProtectedApi) {
      return new Response(JSON.stringify({ error: 'Chưa đăng nhập. Vui lòng đăng nhập để truy cập tài liệu.' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    // Redirect unauthenticated library views to homepage where the login triggers
    return Response.redirect(new URL('/?login_required=true', req.nextUrl));
  }
});

export const config = {
  matcher: ['/library/:path*', '/explore/:path*', '/api/preview/:path*'],
};
