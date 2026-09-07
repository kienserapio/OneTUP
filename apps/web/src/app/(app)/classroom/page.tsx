import type { Metadata } from 'next'
import { ClassroomView } from '@/components/classroom/classroom-view'

export const metadata: Metadata = { title: 'Classroom' }

export default function ClassroomPage() {
  return <ClassroomView />
}
