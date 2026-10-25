import type { PageProps } from '../types'

export default function Home({ onNext }: PageProps) {
  return (
    <>
      <h1>시로</h1>
      <button type="button" onClick={onNext}>파티 만들기</button>
    </>
  )
}
