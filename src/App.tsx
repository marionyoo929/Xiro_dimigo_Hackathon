import { useState } from 'react'
import Home from './pages/Home'
import CreateParty from './pages/CreateParty'
import WaitingRoom from './pages/WaitingRoom'
import MenuVote from './pages/MenuVote'
import Result from './pages/Result'
import Onboarding from './pages/Onboarding'
import { sampleParty, type Party } from './data/sampleParty'
import './styles/onboarding.css'

type Screen = 'start' | 'home' | 'party' | 'waiting' | 'vote' | 'result'
const isSampleRoute = import.meta.env.DEV && window.location.pathname === '/dev/sample-party/menu'
const activePartyKey = 'xiro.active-party.v1'
const screenKey = 'xiro.screen.v1'
const participantKey = 'xiro.participant.v1'
function readParty(): Party | null {
  try {
    const saved = JSON.parse(sessionStorage.getItem(activePartyKey) || 'null') as Party | null
    if (saved && !saved.candidateSetVersion && saved.place === sampleParty.place && saved.radiusKm === sampleParty.radiusKm && saved.budgetMax === 16000 && saved.candidates?.length === 4) {
      const updated = { ...saved, budgetMax: sampleParty.budgetMax, candidates: sampleParty.candidates, candidateSetVersion: sampleParty.candidateSetVersion }
      sessionStorage.setItem(activePartyKey, JSON.stringify(updated))
      return updated
    }
    return saved
  } catch { return null }
}
function readParticipantId(): string {
  if (isSampleRoute) return 'sample-participant-01'
  try {
    const saved = sessionStorage.getItem(participantKey)
    if (saved) return saved
    const id = crypto.randomUUID()
    sessionStorage.setItem(participantKey, id)
    return id
  } catch { return crypto.randomUUID() }
}
export default function App() {
  const [screen, setCurrentScreen] = useState<Screen>(() => {
    if (isSampleRoute) return 'vote'
    try {
      const saved = sessionStorage.getItem(screenKey) as Screen | null
      if ((saved === 'waiting' || saved === 'vote') && !readParty()) return 'start'
      return saved || 'start'
    } catch { return 'start' }
  })
  const [party, setParty] = useState<Party | null>(() => isSampleRoute ? sampleParty : readParty())
  const [participantId] = useState(readParticipantId)
  const [nickname, setNickname] = useState(() => { try { return localStorage.getItem('xiro.nickname') || '게스트' } catch { return '게스트' } })
  const navigate = (next: Screen) => { setCurrentScreen(next); if (!isSampleRoute) { try { sessionStorage.setItem(screenKey, next) } catch { /* Navigation still works. */ } } }
  const createParty = () => {
    const next = { ...sampleParty, id: crypto.randomUUID(), sample: false }
    setParty(next)
    try { sessionStorage.setItem(activePartyKey, JSON.stringify(next)) } catch { /* Current session still works. */ }
    navigate('waiting')
  }
  if (screen === 'start') return <Onboarding onStart={name => { setNickname(name); try { localStorage.setItem('xiro.nickname', name) } catch { /* Current session still works. */ } navigate('party') }} />
  if (screen === 'home') return <main className="page"><Home onNext={() => navigate('party')} /></main>
  if (screen === 'party') return <main className="page"><CreateParty onNext={createParty} /></main>
  if (screen === 'waiting') return <main className="page"><WaitingRoom party={party || sampleParty} onNext={() => navigate('vote')} /></main>
  if (screen === 'vote') return <MenuVote party={party || sampleParty} participantId={participantId} nickname={nickname} onBack={() => navigate('waiting')} onHome={() => navigate('home')} />
  return <main className="page"><Result onNext={() => navigate('home')} /></main>
}
