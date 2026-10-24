import { useState } from 'react'
import Home from './pages/Home'
import CreateParty from './pages/CreateParty'
import WaitingRoom from './pages/WaitingRoom'
import MenuVote from './pages/MenuVote'
import Result from './pages/Result'

const pages = [Home, CreateParty, WaitingRoom, MenuVote, Result]

export default function App() {
  const [pageIndex, setPageIndex] = useState(0)
  const Page = pages[pageIndex]

  return (
    <main className="page">
      <Page onNext={() => setPageIndex((current) => (current + 1) % pages.length)} />
    </main>
  )
}
