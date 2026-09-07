import type { Metadata } from 'next'
import { ClassroomMembers } from '@/components/classroom/classroom-members'

export const metadata: Metadata = { title: 'Members' }

export default function ClassroomMembersPage() {
  return <ClassroomMembers />
}
