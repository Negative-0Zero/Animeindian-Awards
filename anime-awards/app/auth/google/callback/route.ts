import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const origin = requestUrl.origin

  let html = '<html><body style="background:#0a0a0a; color:white; font-family:monospace; padding:20px;">'

  try {
    html += '<h1>🔍 Google OAuth Callback Debug</h1>'

    if (!code) {
      html += '<p style="color:#ff6b6b;">❌ No code received</p>'
      html += '</body></html>'
      return new NextResponse(html, { headers: { 'Content-Type': 'text/html' } })
    }
    html += `<p>✅ Code received: ${code.substring(0, 20)}...</p>`

    // Environment variables
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    html += '<h2>📋 Environment Variables:</h2>'
    html += `<p>GOOGLE_CLIENT_ID: ${clientId ? '✅ Set' : '❌ Missing'}</p>`
    html += `<p>GOOGLE_CLIENT_SECRET: ${clientSecret ? '✅ Set' : '❌ Missing'}</p>`
    html += `<p>SUPABASE_URL: ${supabaseUrl ? '✅ Set' : '❌ Missing'}</p>`
    html += `<p>SUPABASE_ANON_KEY: ${supabaseKey ? '✅ Set' : '❌ Missing'}</p>`

    if (!clientId || !clientSecret || !supabaseUrl || !supabaseKey) {
      html += '<p style="color:#ff6b6b;">❌ Missing environment variables – check Vercel</p>'
      html += '</body></html>'
      return new NextResponse(html, { headers: { 'Content-Type': 'text/html' } })
    }

    // Exchange code for token
    html += '<h2>🔄 Exchanging code for ID token...</h2>'
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

    const tokenData = await tokenRes.json()
    const idToken = tokenData.id_token
    const error = tokenData.error

    if (error || !idToken) {
      html += `<p style="color:#ff6b6b;">❌ Google token exchange failed: ${error || 'No id_token'}</p>`
      html += `<pre>${JSON.stringify(tokenData, null, 2)}</pre>`
      html += '</body></html>'
      return new NextResponse(html, { headers: { 'Content-Type': 'text/html' } })
    }
    html += '<p style="color:#6bc9ff;">✅ ID token received</p>'

    // Create Supabase client
    html += '<h2>🔐 Creating Supabase session...</h2>'
    const cookieStore = await cookies()
    const supabase = createServerClient(supabaseUrl, supabaseKey, {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        set(name: string, value: string, options: any) {
          // We'll set cookies via response later
        },
        remove(name: string, options: any) {
          // We'll remove via response later
        },
      },
    })

    // Attempt sign in
    const { data, error: supabaseError } = await supabase.auth.signInWithIdToken({
      provider: 'google',
      token: idToken,
    })

    if (supabaseError) {
      html += `<p style="color:#ff6b6b;">❌ Supabase sign in error:</p>`
      html += `<pre>${JSON.stringify(supabaseError, null, 2)}</pre>`
      html += '<p style="color:#ff9999;">🔧 Most common cause: Google provider not enabled in Supabase Auth OR wrong Client ID/Secret.</p>'
      html += '<p>👉 Go to Supabase Dashboard → Authentication → Providers → Google → toggle ON and paste your Client ID/Secret.</p>'
      html += '</body></html>'
      return new NextResponse(html, { headers: { 'Content-Type': 'text/html' } })
    }

    if (!data.session) {
      html += '<p style="color:#ff6b6b;">❌ No session returned</p>'
      html += '</body></html>'
      return new NextResponse(html, { headers: { 'Content-Type': 'text/html' } })
    }

    html += '<p style="color:#6bc9ff;">✅ Supabase session created!</p>'
    html += `<p>User ID: ${data.user.id}</p>`
    html += `<p>Email: ${data.user.email || 'NULL'}</p>`
    html += `<p>Created at: ${data.user.created_at}</p>`

    // Set session cookie manually
    const projectRef = supabaseUrl.match(/https:\/\/(.+)\.supabase\.co/)?.[1]
    const cookieName = `sb-${projectRef}-auth-token`

    const response = NextResponse.redirect(`${origin}?login=success`)
    response.cookies.set({
      name: cookieName,
      value: JSON.stringify(data.session),
      path: '/',
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7,
    })

    html += '<p style="color:#6bc9ff;">✅ Session cookie set, redirecting...</p>'
    html += '</body></html>'

    // Return the HTML page with the response
    return new NextResponse(html, { headers: { 'Content-Type': 'text/html' } })
    // (We'll handle redirect separately, but for debug we show the page)
  } catch (err: any) {
    html += `<p style="color:#ff6b6b;">❌ Unexpected error: ${err.message || err}</p>`
    html += '</body></html>'
    return new NextResponse(html, { headers: { 'Content-Type': 'text/html' } })
  }
}
