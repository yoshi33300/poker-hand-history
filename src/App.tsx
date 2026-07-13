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
  // Hand being edited in the form; null means the form is creating a new one.
  const [editingHand, setEditingHand] = useState<Hand | null>(null)
  const [refreshToken, setRefreshToken] = useState(0)

  function openHand(hand: Hand) {
    setSelectedHand(hand)
    setView('replay')
  }

  function startNewHand() {
    setEditingHand(null)
    setView('form')
  }

  function startEditHand(hand: Hand) {
    setEditingHand(hand)
    setView('form')
  }

  function handleSaved(hand: Hand) {
    setRefreshToken((t) => t + 1)
    setSelectedHand(hand)
    setView('replay')
  }

  function handleCancelForm() {
    setView(editingHand ? 'replay' : 'list')
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>♠ Poker Hand History</h1>
        <nav className="app-nav">
          <button type="button" className={view === 'list' ? 'active' : ''} onClick={() => setView('list')}>
            ハンド一覧
          </button>
          <button type="button" className={view === 'form' ? 'active' : ''} onClick={startNewHand}>
            + 新規記録
          </button>
        </nav>
      </header>

      <main className="app-main">
        {view === 'list' && <HandList refreshToken={refreshToken} onOpen={openHand} />}
        {view === 'form' && (
          <HandForm
            key={editingHand?.id ?? 'new'}
            hand={editingHand ?? undefined}
            onSaved={handleSaved}
            onCancel={handleCancelForm}
          />
        )}
        {view === 'replay' && selectedHand && (
          <HandReplayer hand={selectedHand} onBack={() => setView('list')} onEdit={startEditHand} />
        )}
      </main>
    </div>
  )
}

export default App
