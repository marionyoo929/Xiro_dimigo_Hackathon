import { useState } from 'react'
const asset = (name: string) => `${import.meta.env.BASE_URL}images/${encodeURIComponent(name)}`
export default function Onboarding({ onStart }: { onStart: (name: string) => void }) {
  const [input, setInput] = useState('')
  const [panel, setPanel] = useState(false)
  const [notice, setNotice] = useState('')
  return <main className="onboarding start-screen" style={{ backgroundImage: `url("${asset('background.png')}")` }}>
    <img className="start-logo" src={asset('logo_loading_page.png')} alt="시로 XIRO" />
    <div className="start-actions">
      <div className="socials">{[
        ['카카오', 'kakao logo.png'], ['Google', 'google logo.png'],
        ['네이버', 'naver logo.png'], ['Apple', 'apple logo.png'],
      ].map(([label, image]) => <button key={label} className="social" aria-label={`${label} 로그인 안내`} onClick={() => setNotice('소셜 로그인은 준비 중이에요. 게스트로 시작할 수 있어요.')}><img src={asset(image)} alt="" /></button>)}</div>
      <p className="start-notice" role="status">{notice}</p>
      <button className="primary" onClick={() => setPanel(true)}>이메일로 로그인하기</button>
      <button className="guest-link" onClick={() => onStart('게스트')}>게스트로 시작하기</button>
    </div>
    {panel && <div className="panel-backdrop"><section className="demo-panel" role="dialog" aria-modal="true" aria-labelledby="entry-title">
      <button className="panel-close" aria-label="닫기" onClick={() => setPanel(false)}>×</button>
      <h2 id="entry-title">닉네임으로 시작하기</h2><p>닉네임을 입력해 주세요.</p>
      <form onSubmit={event => { event.preventDefault(); if (input.trim()) onStart(input.trim()) }}><label htmlFor="nickname">닉네임</label><input id="nickname" autoFocus maxLength={20} value={input} onChange={event => setInput(event.target.value)} required /><button className="primary" type="submit">시작하기</button></form>
    </section></div>}
  </main>
}
