import type { Metadata } from 'next'
import { ClassroomCreate } from '@/components/classroom/classroom-create'

export const metadata: Metadata = { title: 'Start a classroom' }

export default function ClassroomNewPage() {
  return <ClassroomCreate />
}
