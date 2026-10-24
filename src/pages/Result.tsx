import type { PageProps } from '../types'

export default function Result({ onNext }: PageProps) {
  return (
    <>
      <h1>결과</h1>
      <button type="button" onClick={onNext}>홈으로 돌아가기</button>
    </>
  )
}
