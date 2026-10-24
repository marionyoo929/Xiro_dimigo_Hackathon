import type { PageProps } from '../types'

export default function MenuVote({ onNext }: PageProps) {
  return (
    <>
      <h1>메뉴 소거</h1>
      <button type="button" onClick={onNext}>결과 보기</button>
    </>
  )
}
