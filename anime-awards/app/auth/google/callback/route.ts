import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const origin = requestUrl.origin

  if (!code) {
    return NextResponse.redirect(`${origin}?error=missing_code`)
  }

  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!clientId || !clientSecret || !supabaseUrl || !supabaseKey) {
    console.error('❌ Missing environment variables')
    return NextResponse.redirect(`${origin}?error=missing_env`)
  }

  try {
    // 1. Exchange Google code for ID token
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: 'https://animeindian-awards.vercel.app/auth/google/callback',
        grant_type: 'authorization_code',
      }),
    })

    const { id_token, error } = await tokenRes.json()
    if (error || !id_token) {
      console.error('❌ Google token error:', error)
      return NextResponse.redirect(`${origin}?error=auth_failed`)
    }

    // 2. Create Supabase server client
    const cookieStore = await cookies()
    const supabase = createServerClient(supabaseUrl, supabaseKey, {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        set() {
          // We will set cookies manually via response – leave empty
        },
        remove() {
          // We will remove cookies manually via response – leave empty
        },
      },
    })

    // 3. Sign in with the ID token
    const { data, error: supabaseError } = await supabase.auth.signInWithIdToken({
      provider: 'google',
      token: id_token,
    })

    if (supabaseError || !data.session) {
      console.error('❌ Supabase sign in error:', supabaseError)
      return NextResponse.redirect(`${origin}?error=login_failed`)
    }

    console.log('✅ Supabase session created for user:', data.user?.id)

    // 4. Extract project reference from Supabase URL
    const projectRef = supabaseUrl.match(/https:\/\/(.+)\.supabase\.co/)?.[1]
    const cookieName = `sb-${projectRef}-auth-token`

    // 5. Create redirect response
    const response = NextResponse.redirect(`${origin}?login=success`)

    // 6. Set the session cookie manually (this is the key fix)
    response.cookies.set({
      name: cookieName,
      value: JSON.stringify(data.session),
      path: '/',
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 1 week
    })

    console.log('✅ Session cookie set manually')
    return response
  } catch (err) {
    console.error('❌ Callback error:', err)
    return NextResponse.redirect(`${origin}?error=unknown`)
  }
}
