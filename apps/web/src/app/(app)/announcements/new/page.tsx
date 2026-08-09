import type { Metadata } from 'next'
import { ShareIntake } from '@/components/announcements/share-intake'

export const metadata: Metadata = { title: 'Share an announcement' }

export default function ShareAnnouncementPage() {
  return <ShareIntake />
}
