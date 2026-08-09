import type { MetadataRoute } from 'next'

/**
 * The web app manifest.
 *
 * The share target is what lets a student send an announcement straight from a
 * group chat into OneTUP. Android honours it; iOS Safari does not, so the
 * onboarding surfaces paste and screenshot as the primary path there rather
 * than leaving a student wondering why the share sheet has no OneTUP in it.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'OneTUP',
    short_name: 'OneTUP',
    description: 'One app for your TUP student life.',
    id: '/today',
    start_url: '/today',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#f5f4f2',
    theme_color: '#f5f4f2',
    categories: ['education', 'productivity'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: "Today", short_name: 'Today', url: '/today' },
      { name: 'Add a deadline', short_name: 'Deadline', url: '/deadlines/new' },
      { name: 'Campus', short_name: 'Campus', url: '/campus' },
    ],
    share_target: {
      action: '/share',
      method: 'POST',
      enctype: 'multipart/form-data',
      params: {
        title: 'title',
        text: 'text',
        url: 'url',
        files: [
          {
            name: 'image',
            accept: ['image/png', 'image/jpeg', 'image/webp', 'image/heic'],
          },
        ],
      },
    },
  }
}
