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

  // Environment variables (with runtime check)
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!clientId || !clientSecret || !supabaseUrl || !supabaseKey) {
    console.error('Missing environment variables')
    return NextResponse.redirect(`${origin}?error=missing_env`)
  }

  try {
    // 1. Exchange Google code for ID token
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId!,           // ✅ non‑null assertion – safe because we checked above
        client_secret: clientSecret!,   // ✅ non‑null assertion
        redirect_uri: 'https://animeindian-awards.vercel.app/auth/google/callback',
        grant_type: 'authorization_code',
      }),
    })

    const { id_token, error } = await tokenResponse.json()
    if (error || !id_token) {
      console.error('❌ Google token exchange error:', error)
      return NextResponse.redirect(`${origin}?error=auth_failed`)
    }

    // 2. Create Supabase server client
    const cookieStore = await cookies()
    const supabase = createServerClient(
      supabaseUrl!,
      supabaseKey!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value
          },
          set(name: string, value: string, options: any) {
            try {
              cookieStore.set({ name, value, ...options })
            } catch (err) {}
          },
          remove(name: string, options: any) {
            try {
              cookieStore.set({ name, value: '', ...options })
            } catch (err) {}
          },
        },
      }
    )

    // 3. Sign in with ID token
    const { data, error: supabaseError } = await supabase.auth.signInWithIdToken({
      provider: 'google',
      token: id_token,
    })

    if (supabaseError) {
      console.error('❌ Supabase sign in error:', supabaseError)
      return NextResponse.redirect(`${origin}?error=login_failed`)
    }

    console.log('✅ User signed in:', data.user?.id)
    return NextResponse.redirect('https://animeindian-awards.vercel.app')
  } catch (err) {
    console.error('❌ Callback error:', err)
    return NextResponse.redirect(`${origin}?error=unknown`)
  }
}
