import type { PageProps } from '../types'

export default function CreateParty({ onNext }: PageProps) {
  return (
    <>
      <h1>파티 생성</h1>
      <button type="button" onClick={onNext}>대기실로 이동</button>
    </>
  )
}
