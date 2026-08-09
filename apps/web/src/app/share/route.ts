import { NextResponse } from 'next/server'
import { contentHash } from '@onetup/core'
import { currentUser, supabaseServer } from '@/lib/supabase/server'

/**
 * The Web Share Target landing point.
 *
 * Android's share sheet POSTs here with whatever the student selected in their
 * group chat. The content is parked as a submission and the browser is sent on
 * to the review screen — a POST cannot render the review directly, and a
 * student who just tapped "share" should not land on a spinner.
 *
 * iOS Safari has no Share Target at all, which is why /announcements/new exists
 * and why onboarding surfaces paste and screenshot as the primary path there.
 */
export async function POST(request: Request) {
  const origin = new URL(request.url).origin
  const user = await currentUser()

  if (!user) {
    return NextResponse.redirect(new URL('/sign-in?next=/announcements/new', origin), 303)
  }

  const form = await request.formData().catch(() => null)
  if (!form) {
    return NextResponse.redirect(new URL('/announcements/new', origin), 303)
  }

  const text = [form.get('title'), form.get('text'), form.get('url')]
    .filter((part): part is string => typeof part === 'string' && part.length > 0)
    .join('\n')

  const image = form.get('image')
  const hasImage = image instanceof File && image.size > 0

  if (!text.trim() && !hasImage) {
    return NextResponse.redirect(new URL('/announcements/new', origin), 303)
  }

  const supabase = await supabaseServer()

  let imagePath: string | null = null
  if (hasImage) {
    const file = image as File
    const path = `${user.id}/${crypto.randomUUID()}`
    const { error } = await supabase.storage
      .from('announcement-images')
      .upload(path, file, { contentType: file.type, upsert: false })
    if (!error) imagePath = path
  }

  const { data: submission } = await supabase
    .from('announcement_submissions')
    .insert({
      user_id: user.id,
      raw_content: text.slice(0, 8000) || null,
      image_path: imagePath,
      source: 'share_target',
      content_hash: contentHash(text),
      status: 'proposed',
    })
    .select('id')
    .single()

  const destination = submission
    ? `/announcements/new?submission=${submission.id}`
    : '/announcements/new'

  return NextResponse.redirect(new URL(destination, origin), 303)
}
