import { useState } from 'react'
import HandForm from './components/HandForm'
import HandList from './components/HandList'
import HandReplayer from './components/HandReplayer'
import type { Hand } from './types'
import './App.css'

type View = 'list' | 'form' | 'replay'

function App() {
  const [view, setView] = useState<View>('list')
  const [selectedHand, setSelectedHand] = useState<Hand | null>(null)
  const [refreshToken, setRefreshToken] = useState(0)

  function openHand(hand: Hand) {
    setSelectedHand(hand)
    setView('replay')
  }

  function handleSaved() {
    setRefreshToken((t) => t + 1)
    setView('list')
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>♠ Poker Hand History</h1>
        <nav className="app-nav">
          <button type="button" className={view === 'list' ? 'active' : ''} onClick={() => setView('list')}>
            ハンド一覧
          </button>
          <button type="button" className={view === 'form' ? 'active' : ''} onClick={() => setView('form')}>
            + 新規記録
          </button>
        </nav>
      </header>

      <main className="app-main">
        {view === 'list' && <HandList refreshToken={refreshToken} onOpen={openHand} />}
        {view === 'form' && <HandForm onSaved={handleSaved} />}
        {view === 'replay' && selectedHand && (
          <HandReplayer hand={selectedHand} onBack={() => setView('list')} />
        )}
      </main>
    </div>
  )
}

export default App
