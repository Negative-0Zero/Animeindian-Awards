import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const origin = requestUrl.origin

  // 1. No code → error
  if (!code) {
    return NextResponse.redirect(`${origin}?error=missing_code`)
  }

  // 2. Validate environment variables
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!clientId || !clientSecret || !supabaseUrl || !supabaseKey) {
    console.error('❌ Missing env vars')
    return NextResponse.redirect(`${origin}?error=missing_env`)
  }

  try {
    // 3. Exchange code for Google ID token
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

    // 4. Create Supabase server client – **this exact pattern sets cookies**
    const cookieStore = await cookies()
    const supabase = createServerClient(supabaseUrl, supabaseKey, {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        set(name: string, value: string, options: any) {
          try {
            cookieStore.set({ name, value, ...options })
          } catch {
            // Ignore – called from Server Component
          }
        },
        remove(name: string, options: any) {
          try {
            cookieStore.set({ name, value: '', ...options })
          } catch {
            // Ignore
          }
        },
      },
    })

    // 5. Sign in with the ID token
    const { data, error: supabaseError } = await supabase.auth.signInWithIdToken({
      provider: 'google',
      token: id_token,
    })

    if (supabaseError) {
      console.error('❌ Supabase sign in error:', supabaseError)
      return NextResponse.redirect(`${origin}?error=login_failed`)
    }

    // 6. Success – redirect with a success flag
    console.log('✅ User logged in:', data.user?.id)
    return NextResponse.redirect(`${origin}?login=success`)
  } catch (err) {
    console.error('❌ Callback error:', err)
    return NextResponse.redirect(`${origin}?error=unknown`)
  }
}
