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

  // Environment variables check
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!clientId || !clientSecret || !supabaseUrl || !supabaseKey) {
    console.error('❌ Missing env vars')
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

    // 2. Create a response – we will attach cookies to it
    const response = NextResponse.redirect(`${origin}?login=success`)

    // 3. Create Supabase server client that writes cookies to the response
    const cookieStore = await cookies()
    const supabase = createServerClient(supabaseUrl, supabaseKey, {
      cookies: {
        // Read from request cookies
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        // Write to response cookies (CRITICAL)
        set(name: string, value: string, options: any) {
          response.cookies.set({ name, value, ...options })
        },
        remove(name: string, options: any) {
          response.cookies.set({ name, value: '', ...options })
        },
      },
    })

    // 4. Sign in with the ID token – this will trigger the set() method above
    const { data, error: supabaseError } = await supabase.auth.signInWithIdToken({
      provider: 'google',
      token: id_token,
    })

    if (supabaseError || !data.session) {
      console.error('❌ Supabase sign in error:', supabaseError)
      return NextResponse.redirect(`${origin}?error=login_failed`)
    }

    console.log('✅ User logged in:', data.user?.id)
    console.log('✅ Session cookie should be set via response')

    // 5. Return the response with cookies already attached
    return response
  } catch (err) {
    console.error('❌ Callback error:', err)
    return NextResponse.redirect(`${origin}?error=unknown`)
  }
  }
