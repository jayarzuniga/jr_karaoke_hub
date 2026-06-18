import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { songs, type Song } from './data/songs'

type Theme = 'dark' | 'light'

type CurrentPerformance = {
  song: Song
}

type QueueEntry = {
  id: string
  song: Song
}

type AuthUser = {
  email: string
  name: string
  picture: string
}

type GoogleCredentialResponse = {
  credential: string
}

type GoogleAccounts = {
  id: {
    disableAutoSelect: () => void
    initialize: (config: {
      client_id: string
      callback: (response: GoogleCredentialResponse) => void
    }) => void
    prompt: () => void
    renderButton: (
      parent: HTMLElement,
      options: {
        theme: 'outline' | 'filled_black'
        size: 'large'
        shape: 'pill' | 'rectangular'
        text: 'signin_with' | 'continue_with'
        width?: number
      },
    ) => void
  }
}

declare global {
  interface Window {
    google?: {
      accounts: GoogleAccounts
    }
  }
}

const themePreferenceKey = 'jr-karaoke-theme'
const authStorageKey = 'jr-karaoke-user'
const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID
const googleScriptId = 'google-identity-services'

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

function getStoredUser(): AuthUser | null {
  if (typeof window === 'undefined') {
    return null
  }

  const rawUser = window.localStorage.getItem(authStorageKey)
  if (!rawUser) {
    return null
  }

  try {
    return JSON.parse(rawUser) as AuthUser
  } catch {
    return null
  }
}

function parseJwtProfile(credential: string): AuthUser | null {
  const sections = credential.split('.')
  if (sections.length < 2) {
    return null
  }

  try {
    const base64 = sections[1].replace(/-/g, '+').replace(/_/g, '/')
    const decoded = window.atob(base64)
    const payload = JSON.parse(decoded) as {
      email?: string
      name?: string
      picture?: string
    }

    if (!payload.email || !payload.name) {
      return null
    }

    return {
      email: payload.email,
      name: payload.name,
      picture: payload.picture ?? '',
    }
  } catch {
    return null
  }
}

function loadGoogleScript(): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.resolve()
  }

  if (window.google?.accounts?.id) {
    return Promise.resolve()
  }

  const existingScript = document.getElementById(googleScriptId) as HTMLScriptElement | null
  if (existingScript) {
    return new Promise((resolve, reject) => {
      existingScript.addEventListener('load', () => resolve(), { once: true })
      existingScript.addEventListener('error', () => reject(new Error('Failed to load Google script')), {
        once: true,
      })
    })
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.id = googleScriptId
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.defer = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Failed to load Google script'))
    document.head.appendChild(script)
  })
}

function buildYoutubeEmbedUrl(videoId: string) {
  const params = new URLSearchParams({
    autoplay: '1',
    controls: '1',
    rel: '0',
    playsinline: '1',
    enablejsapi: '1',
  })

  if (typeof window !== 'undefined') {
    params.set('origin', window.location.origin)
  }

  return `https://www.youtube.com/embed/${videoId}?${params.toString()}`
}

function createQueueEntry(song: Song): QueueEntry {
  return {
    id: `${song.code}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    song,
  }
}

function getRandomSuggestedSongs(excludedVideoIds: string[], count: number) {
  const availableSongs = songs.filter((song) => !excludedVideoIds.includes(song.youtubeId))
  const sourceSongs = availableSongs.length ? availableSongs : songs

  const shuffledSongs = [...sourceSongs]

  for (let index = shuffledSongs.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1))
    ;[shuffledSongs[index], shuffledSongs[randomIndex]] = [shuffledSongs[randomIndex], shuffledSongs[index]]
  }

  return shuffledSongs.slice(0, Math.min(count, shuffledSongs.length))
}

function getSuggestionExclusions(currentSong: Song, queueEntries: QueueEntry[], currentSuggestions: Song[], skipIndex?: number) {
  const exclusions = new Set<string>([currentSong.youtubeId])

  queueEntries.forEach((entry) => exclusions.add(entry.song.youtubeId))
  currentSuggestions.forEach((song, index) => {
    if (index !== skipIndex) {
      exclusions.add(song.youtubeId)
    }
  })

  return [...exclusions]
}

type SongListItemProps = {
  song: Song
  isActive: boolean
  showActions: boolean
  onSelect: (song: Song) => void
  onPlay: (song: Song) => void
  onQueue: (song: Song) => void
}

function SongListItem({ song, isActive, showActions, onSelect, onPlay, onQueue }: SongListItemProps) {
  const titleRef = useRef<HTMLSpanElement | null>(null)
  const textRef = useRef<HTMLSpanElement | null>(null)
  const [overflowShift, setOverflowShift] = useState(0)

  useEffect(() => {
    const titleElement = titleRef.current
    const textElement = textRef.current

    if (!titleElement || !textElement) {
      return
    }

    const updateOverflow = () => {
      const nextOverflowShift = Math.max(0, Math.ceil(textElement.scrollWidth - titleElement.clientWidth))
      setOverflowShift(nextOverflowShift)
    }

    updateOverflow()

    const resizeObserver =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => updateOverflow()) : null

    resizeObserver?.observe(titleElement)
    resizeObserver?.observe(textElement)

    window.addEventListener('resize', updateOverflow)

    return () => {
      resizeObserver?.disconnect()
      window.removeEventListener('resize', updateOverflow)
    }
  }, [song.artist, song.duration, song.title])

  return (
    <div className={`song-card-shell${isActive ? ' active' : ''}`}>
      <button type="button" className="song-card" onClick={() => onSelect(song)}>
        <span className={`song-title${overflowShift > 0 ? ' is-overflowing' : ''}`} ref={titleRef}>
          <span
            className="song-title-text"
            ref={textRef}
            style={{ '--marquee-shift': `${overflowShift}px` } as CSSProperties}
          >
            <span className="song-title-main">{song.title}</span>
            <span className="song-title-divider"> - </span>
            <span className="song-title-details">
              {song.artist} - {song.duration}
            </span>
          </span>
        </span>
      </button>

      {showActions ? (
        <div className="song-card-popup">
          <button type="button" className="primary-button song-popup-button" onClick={() => onPlay(song)}>
            Play
          </button>
          <button type="button" className="secondary-button song-popup-button" onClick={() => onQueue(song)}>
            Queue
          </button>
        </div>
      ) : null}
    </div>
  )
}

export default function App() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme)
  const [browseTerm, setBrowseTerm] = useState('')
  const [selectedSong, setSelectedSong] = useState<Song>(songs[0])
  const [actionSongId, setActionSongId] = useState<string | null>(null)
  const [currentPerformance, setCurrentPerformance] = useState<CurrentPerformance>({
    song: songs[0],
  })
  const [queue, setQueue] = useState<QueueEntry[]>([])
  const [suggestedSongs, setSuggestedSongs] = useState<Song[]>(() => getRandomSuggestedSongs([songs[0].youtubeId], 3))
  const [user, setUser] = useState<AuthUser | null>(getStoredUser)
  const [authStatus, setAuthStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [authError, setAuthError] = useState('')
  const googleButtonRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    window.localStorage.setItem(themePreferenceKey, theme)
  }, [theme])

  useEffect(() => {
    if (user) {
      window.localStorage.setItem(authStorageKey, JSON.stringify(user))
      return
    }

    window.localStorage.removeItem(authStorageKey)
  }, [user])

  useEffect(() => {
    if (!googleClientId || user) {
      return
    }

    let cancelled = false

    setAuthStatus('loading')
    setAuthError('')

    loadGoogleScript()
      .then(() => {
        if (cancelled || !window.google?.accounts?.id || !googleButtonRef.current) {
          return
        }

        window.google.accounts.id.initialize({
          client_id: googleClientId,
          callback: (response) => {
            const parsedUser = parseJwtProfile(response.credential)

            if (!parsedUser) {
              setAuthStatus('error')
              setAuthError('Google sign-in succeeded, but we could not read the profile details.')
              return
            }

            setUser(parsedUser)
            setAuthStatus('ready')
          },
        })

        googleButtonRef.current.innerHTML = ''
        window.google.accounts.id.renderButton(googleButtonRef.current, {
          theme: theme === 'dark' ? 'filled_black' : 'outline',
          size: 'large',
          shape: 'pill',
          text: 'continue_with',
          width: 280,
        })

        window.google.accounts.id.prompt()
        setAuthStatus('ready')
      })
      .catch(() => {
        if (cancelled) {
          return
        }

        setAuthStatus('error')
        setAuthError('Google sign-in could not be loaded. Check your internet connection and app setup.')
      })

    return () => {
      cancelled = true
    }
  }, [theme, user])

  const filteredSongs = songs.filter((song) => {
    const term = browseTerm.trim().toLowerCase()

    if (!term) {
      return true
    }

    return song.title.toLowerCase().includes(term) || song.artist.toLowerCase().includes(term)
  })

  const currentSongEmbedUrl = buildYoutubeEmbedUrl(currentPerformance.song.youtubeId)

  function signOut() {
    window.google?.accounts.id.disableAutoSelect()
    setUser(null)
    setAuthStatus('idle')
    setAuthError('')
  }

  function selectSong(song: Song) {
    setSelectedSong(song)
    setActionSongId((current) => (current === song.youtubeId ? null : song.youtubeId))
  }

  function playSongNow(song: Song) {
    setCurrentPerformance({
      song,
    })
    setSelectedSong(song)
    setActionSongId(null)
  }

  function addSongToQueue(song: Song) {
    setQueue((currentQueue) => [...currentQueue, createQueueEntry(song)])
    setSelectedSong(song)
    setActionSongId(null)
  }

  function playNextQueuedSong() {
    const nextEntry = queue[0]

    if (!nextEntry) {
      return
    }

    setQueue((currentQueue) => currentQueue.slice(1))
    playSongNow(nextEntry.song)
  }

  function removeQueuedSong(index: number) {
    const queuedSong = queue[index]

    if (!queuedSong) {
      return
    }

    setQueue((currentQueue) => currentQueue.filter((_, queueIndex) => queueIndex !== index))
  }

  function playSpecificQueuedSong(index: number) {
    const queuedSong = queue[index]

    if (!queuedSong) {
      return
    }

    setQueue((currentQueue) => currentQueue.filter((_, queueIndex) => queueIndex !== index))
    playSongNow(queuedSong.song)
  }

  function replaceSuggestedSong(index: number) {
    setSuggestedSongs((currentSuggestions) => {
      const replacement = getRandomSuggestedSongs(
        getSuggestionExclusions(currentPerformance.song, queue, currentSuggestions, index),
        1,
      )[0]

      if (!replacement) {
        return currentSuggestions
      }

      return currentSuggestions.map((song, suggestionIndex) =>
        suggestionIndex === index ? replacement : song,
      )
    })
  }

  function playSuggestedSong(index: number) {
    const suggestedSong = suggestedSongs[index]

    if (!suggestedSong) {
      return
    }

    playSongNow(suggestedSong)
  }

  function queueSuggestedSong(index: number) {
    const suggestedSong = suggestedSongs[index]

    if (!suggestedSong) {
      return
    }

    setQueue((currentQueue) => [...currentQueue, createQueueEntry(suggestedSong)])
    setSelectedSong(suggestedSong)
    setActionSongId(null)
    setSuggestedSongs((currentSuggestions) => {
      const replacement = getRandomSuggestedSongs(
        getSuggestionExclusions(
          currentPerformance.song,
          [...queue, { id: `suggestion-${suggestedSong.youtubeId}`, song: suggestedSong }],
          currentSuggestions,
          index,
        ),
        1,
      )[0]

      if (!replacement) {
        return currentSuggestions
      }

      return currentSuggestions.map((song, suggestionIndex) =>
        suggestionIndex === index ? replacement : song,
      )
    })
  }

  useEffect(() => {
    setSuggestedSongs(
      getRandomSuggestedSongs(getSuggestionExclusions(currentPerformance.song, queue, [], undefined), 3),
    )
  }, [currentPerformance.song.youtubeId])

  if (!user) {
    return (
      <div className="auth-shell">
        <div className="auth-panel">
          <div className="auth-topbar">
            <div>
              <p className="eyebrow">JR Karaoke Hub</p>
              <h1>Sign in before the music starts</h1>
            </div>

            <button
              type="button"
              className="theme-toggle"
              onClick={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
            >
              {theme === 'dark' ? 'Light mode' : 'Dark mode'}
            </button>
          </div>

          <section className="hero-card">
            <div className="hero-copy">
              <p className="eyebrow">YouTube-Powered Karaoke</p>
              <h2>Google sign-in is the gate into the karaoke catalog</h2>
              <p>
                Users sign in with Google first, then the app can move into YouTube-backed browsing,
                playback, queueing, and numeric song selection.
              </p>
            </div>

            <div className="auth-card">
              <p className="eyebrow">Access</p>
              <h3>Continue with Google</h3>
              <p className="auth-copy">
                This frontend is prepared for Google Identity Services. After sign-in, users enter the
                karaoke browser and player shell.
              </p>

              {googleClientId ? (
                <div className="auth-actions">
                  <div ref={googleButtonRef} className="google-button-slot" />
                  <p className="helper-text">
                    Use a Google account that can access YouTube. Only embeddable YouTube videos can be
                    played in the app.
                  </p>
                </div>
              ) : (
                <div className="setup-notice">
                  <p className="setup-title">Setup needed</p>
                  <p>
                    Add `VITE_GOOGLE_CLIENT_ID` to your local `.env` file to enable the Google sign-in
                    button.
                  </p>
                  <code className="env-snippet">VITE_GOOGLE_CLIENT_ID=your-google-web-client-id</code>
                </div>
              )}

              {authStatus === 'loading' ? <p className="helper-text">Loading Google sign-in...</p> : null}
              {authError ? <p className="error-text">{authError}</p> : null}
            </div>
          </section>

          <section className="feature-grid">
            <article className="feature-card">
              <p className="eyebrow">Ready</p>
              <h3>Dark and light mode</h3>
              <p>The theme toggle works before and after sign-in so the whole experience stays consistent.</p>
            </article>

            <article className="feature-card">
              <p className="eyebrow">Ready</p>
              <h3>Login-first experience</h3>
              <p>The app now blocks the catalog until a Google sign-in completes successfully.</p>
            </article>

            <article className="feature-card">
              <p className="eyebrow">Ready</p>
              <h3>YouTube playback foundation</h3>
              <p>The main app already supports embedded YouTube playback once the user enters the catalog.</p>
            </article>
          </section>
        </div>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div>
          <p className="eyebrow">JR Karaoke Hub</p>
          <h1>TV Karaoke Deck</h1>
          <p className="sidebar-copy">Pick a song, then choose Play or Queue.</p>
        </div>

        <div className="catalog-stats">
          <div className="stat-card">
            <span className="stat-value">{songs.length}</span>
            <span className="stat-label">Songs</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{queue.length}</span>
            <span className="stat-label">Queue</span>
          </div>
        </div>

        <label className="search-panel" htmlFor="song-search">
          <span>Search by title or artist</span>
          <input
            id="song-search"
            type="text"
            inputMode="search"
            placeholder="Search the karaoke catalog"
            value={browseTerm}
            onChange={(event) => setBrowseTerm(event.target.value)}
          />
        </label>

        <section className="selection-card">
          <div>
            <p className="eyebrow">Selected song</p>
            <h3>{selectedSong.title}</h3>
            <p className="selection-copy">{selectedSong.artist} - {selectedSong.duration}</p>
          </div>
        </section>

        <div className="song-list-block">
          <div className="song-list-header">
            <p className="eyebrow">Song list</p>
            <span className="song-list-count">{filteredSongs.length} results</span>
          </div>

          <div className="song-list">
            {filteredSongs.map((song) => (
              <SongListItem
                key={song.code}
                song={song}
                isActive={selectedSong.youtubeId === song.youtubeId || actionSongId === song.youtubeId}
                showActions={actionSongId === song.youtubeId}
                onSelect={selectSong}
                onPlay={playSongNow}
                onQueue={addSongToQueue}
              />
            ))}
          </div>
        </div>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <div>
            <p className="eyebrow">Signed In</p>
          </div>

          <div className="topbar-actions">
            <button
              type="button"
              className="theme-toggle"
              onClick={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
            >
              {theme === 'dark' ? 'Light mode' : 'Dark mode'}
            </button>

            <button type="button" className="secondary-button" onClick={signOut}>
              Sign out
            </button>
          </div>
        </header>

        <section className="tv-stage-layout">
          <section className="player-card player-card--tv">
            <div className="player-copy">
              <p className="eyebrow">Now playing</p>
              <h3>{currentPerformance.song.title}</h3>
              <p>{currentPerformance.song.artist} - {currentPerformance.song.duration}</p>
            </div>

            <div className="player-actions">
              <button type="button" className="primary-button" onClick={playNextQueuedSong} disabled={!queue.length}>
                Play next in queue
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={() => addSongToQueue(currentPerformance.song)}
              >
                Re-queue current song
              </button>
            </div>

            <div className="video-frame video-frame--tv">
              <iframe
                key={currentPerformance.song.youtubeId}
                title={`${currentPerformance.song.title} YouTube player`}
                src={currentSongEmbedUrl}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
                referrerPolicy="strict-origin-when-cross-origin"
              />
            </div>
          </section>

          <aside className="tv-side-stack">
            <article className="feature-card queue-card">
              <div className="queue-header">
                <div>
                  <p className="eyebrow">Queue</p>
                  <h3>Up next</h3>
                </div>

                <span className="queue-count">{queue.length} songs</span>
              </div>

              {queue.length ? (
                <div className="queue-list">
                  {queue.map((song, index) => (
                    <div key={song.id} className="queue-item">
                      <div className="queue-song-copy">
                        <strong className="queue-title">{song.song.title}</strong>
                        <span className="queue-meta">
                          {song.song.artist} - {song.song.duration}
                        </span>
                      </div>

                      <div className="queue-actions">
                        <button
                          type="button"
                          className="secondary-button queue-button"
                          onClick={() => playSpecificQueuedSong(index)}
                        >
                          Play
                        </button>
                        <button
                          type="button"
                          className="ghost-button queue-button"
                          onClick={() => removeQueuedSong(index)}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="empty-state">The queue is empty. Add songs from the list to line up the next track.</p>
              )}
            </article>

            <article className="feature-card queue-card">
              <p className="eyebrow">Suggestions</p>
              <h3>Try these next</h3>
              <div className="suggestion-list">
                {suggestedSongs.map((suggestedSong, index) => (
                  <div key={suggestedSong.youtubeId} className="suggestion-card">
                    <strong>{suggestedSong.title}</strong>
                    <span className="song-meta">
                      {suggestedSong.artist} - {suggestedSong.duration}
                    </span>
                    <div className="suggestion-actions">
                      <button
                        type="button"
                        className="primary-button suggestion-button"
                        onClick={() => playSuggestedSong(index)}
                      >
                        Play
                      </button>
                      <button
                        type="button"
                        className="secondary-button suggestion-button"
                        onClick={() => queueSuggestedSong(index)}
                      >
                        Queue
                      </button>
                      <button
                        type="button"
                        className="ghost-button suggestion-button"
                        onClick={() => replaceSuggestedSong(index)}
                      >
                        Change
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </article>
          </aside>
        </section>
      </main>
    </div>
  )
}
