import type { PageProps } from '../types'

export default function WaitingRoom({ onNext }: PageProps) {
  return (
    <>
      <h1>대기실</h1>
      <button type="button" onClick={onNext}>메뉴 소거 시작</button>
    </>
  )
}
