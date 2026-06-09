// =====================================================================
// SoundSnap — POST /auth/signout
// =====================================================================
// Server route that ends the Supabase session and redirects home.
// Invoked from a <form action="/auth/signout" method="POST"> in the
// nav (no client JS needed).
// =====================================================================

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  await supabase.auth.signOut()

  const url = request.nextUrl.clone()
  url.pathname = '/'
  url.search = ''
  return NextResponse.redirect(url, { status: 303 })
}
