import { useEffect, useState } from 'react'

type Theme = 'dark' | 'light'

type Song = {
  code: string
  title: string
  artist: string
  category: string
}

const songs: Song[] = [
  { code: '1001', title: 'Through the Fire', artist: 'Karaoke Version', category: 'Power Ballads' },
  { code: '1002', title: 'Yesterday Once More', artist: 'Classic Collection', category: 'Retro Hits' },
  { code: '1003', title: 'My Way', artist: 'Premium Karaoke', category: 'OPM Essentials' },
  { code: '1004', title: 'Bohemian Rhapsody', artist: 'Arena Anthems', category: 'Rock Legends' },
  { code: '1005', title: 'Dancing Queen', artist: 'Disco Forever', category: 'Party Favorites' },
  { code: '1006', title: 'A Whole New World', artist: 'Duet Classics', category: 'Duets' },
]

const themePreferenceKey = 'jr-karaoke-theme'

function getInitialTheme(): Theme {
  if (typeof window === 'undefined') {
    return 'dark'
  }

  const savedTheme = window.localStorage.getItem(themePreferenceKey)
  if (savedTheme === 'dark' || savedTheme === 'light') {
    return savedTheme
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export default function App() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme)
  const [songCode, setSongCode] = useState('')
  const [selectedSong, setSelectedSong] = useState<Song>(songs[0])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    window.localStorage.setItem(themePreferenceKey, theme)
  }, [theme])

  const filteredSongs = songs.filter((song) => {
    const term = songCode.trim().toLowerCase()

    if (!term) {
      return true
    }

    return (
      song.code.includes(term) ||
      song.title.toLowerCase().includes(term) ||
      song.artist.toLowerCase().includes(term)
    )
  })

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div>
          <p className="eyebrow">JR Karaoke Hub</p>
          <h1>Browse the catalog</h1>
          <p className="sidebar-copy">
            This foundation is ready for YouTube login, karaoke playback, and numeric song selection.
          </p>
        </div>

        <label className="search-panel" htmlFor="song-search">
          <span>Song number or title</span>
          <input
            id="song-search"
            type="text"
            inputMode="numeric"
            placeholder="Enter 1001 or search title"
            value={songCode}
            onChange={(event) => setSongCode(event.target.value)}
          />
        </label>

        <div className="song-list">
          {filteredSongs.map((song) => (
            <button
              key={song.code}
              type="button"
              className={`song-card${selectedSong.code === song.code ? ' active' : ''}`}
              onClick={() => setSelectedSong(song)}
            >
              <span className="song-code">{song.code}</span>
              <span className="song-title">{song.title}</span>
              <span className="song-meta">
                {song.artist} • {song.category}
              </span>
            </button>
          ))}
        </div>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <div>
            <p className="eyebrow">Foundation Step</p>
            <h2>React frontend shell</h2>
          </div>

          <button
            type="button"
            className="theme-toggle"
            onClick={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
          >
            {theme === 'dark' ? 'Light mode' : 'Dark mode'}
          </button>
        </header>

        <section className="player-card">
          <div className="player-copy">
            <p className="eyebrow">Selected song</p>
            <h3>{selectedSong.title}</h3>
            <p>
              {selectedSong.artist} • Code {selectedSong.code}
            </p>
          </div>

          <div className="video-placeholder">
            <span>YouTube karaoke player goes here</span>
          </div>
        </section>

        <section className="feature-grid">
          <article className="feature-card">
            <p className="eyebrow">Next</p>
            <h3>Google / YouTube sign-in gate</h3>
            <p>We’ll require account sign-in before users can enter the karaoke player flow.</p>
          </article>

          <article className="feature-card">
            <p className="eyebrow">Next</p>
            <h3>YouTube-powered playback</h3>
            <p>Embeddable karaoke videos will be loaded through the YouTube player API.</p>
          </article>

          <article className="feature-card">
            <p className="eyebrow">Next</p>
            <h3>Platinum-style numeric mode</h3>
            <p>Song codes already work in the UI and can expand into a keypad or remote-style entry.</p>
          </article>
        </section>
      </main>
    </div>
  )
}
