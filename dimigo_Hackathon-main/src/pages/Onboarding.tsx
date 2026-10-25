import { useState } from 'react'
const asset = (name: string) => `${import.meta.env.BASE_URL}images/${encodeURIComponent(name)}`
export default function Onboarding({ demo, localAuth, ready, busy, error, onStart, onLocalLogin, onMerchantDemo }: {
  demo: boolean; localAuth: boolean; ready: boolean; busy: boolean; error: string
  onStart: (name: string) => void; onLocalLogin: (email: string, password: string) => void; onMerchantDemo: () => void
}) {
  const [input, setInput] = useState('')
  const [password, setPassword] = useState('')
  const [panel, setPanel] = useState(false)
  const [notice, setNotice] = useState('')
  return <main className="onboarding start-screen" style={{ backgroundImage: `url("${asset('background.png')}")` }}>
    <img className="start-logo" src={asset('logo_loading_page.png')} alt="시로 XIRO" />
    <div className="start-actions">
      <div className="socials">{[
        ['카카오', 'kakao logo.png'], ['Google', 'google logo.png'],
        ['네이버', 'naver logo.png'], ['Apple', 'apple logo.png'],
      ].map(([label, image]) => <button key={label} className="social" aria-label={`${label} 로그인 안내`} onClick={() => setNotice(demo ? '소셜 로그인은 준비 중이에요. 게스트로 시작할 수 있어요.' : '소셜 로그인은 준비 중이에요. 이메일로 로그인해 주세요.')}><img src={asset(image)} alt="" /></button>)}</div>
      <p className="start-notice" role="status">{error || notice}</p>
      <button className="primary" disabled={!ready || (!demo && !localAuth)} onClick={() => setPanel(true)}>이메일로 로그인하기</button>
      {demo && <button className="guest-link" disabled={busy} onClick={() => onStart('게스트')}>게스트로 시작하기</button>}
    </div>
    {panel && <div className="panel-backdrop"><section className="demo-panel" role="dialog" aria-modal="true" aria-labelledby="entry-title">
      <button className="panel-close" aria-label="닫기" onClick={() => setPanel(false)}>×</button>
      <h2 id="entry-title">{demo ? '닉네임으로 시작하기' : '이메일로 로그인하기'}</h2><p>{demo ? '닉네임을 입력해 주세요.' : '계정 정보를 입력해 주세요.'}</p>
      {error && <p className="start-login-error" role="alert">{error}</p>}
      <form onSubmit={event => { event.preventDefault(); if (demo && input.trim()) onStart(input.trim()); else if (localAuth && input.trim()) onLocalLogin(input.trim(), password) }}>
        <label htmlFor="start-login-id">{demo ? '닉네임' : '이메일'}</label><input id="start-login-id" type={demo ? 'text' : 'email'} autoFocus maxLength={demo ? 20 : 254} autoComplete={demo ? 'nickname' : 'username'} value={input} onChange={event => setInput(event.target.value)} required />
        {!demo && <><label htmlFor="start-login-password">비밀번호</label><input id="start-login-password" type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} required /></>}
        <button className="primary" type="submit" disabled={busy}>{busy ? '로그인 중…' : '시작하기'}</button>
      </form>
      {demo && <button className="start-merchant-link" disabled={busy} onClick={onMerchantDemo}>사장님 시연 시작</button>}
    </section></div>}
  </main>
}
