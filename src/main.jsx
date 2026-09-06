import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { createRoot } from "react-dom/client"
import {
  ArrowLeft,
  ArrowRight,
  Eye,
  EyeOff,
  Heart,
  ListMusic,
  LogOut,
  MoreVertical,
  Pause,
  Play,
  Search,
  Shuffle,
  SkipBack,
  SkipForward,
  Trash2,
  GripVertical,
  X,
} from "lucide-react"
import "./styles.css"

const CLIENT = "TeslaNavidrome"
const API_VERSION = "1.16.1"
const STORAGE_KEY = "teslaNavidromeState"
const THEME_KEY = "teslaNavidromeTheme"
const SKIP_STATS_KEY = "teslaNavidromeSkipStats"
const USER_PROFILES_KEY = "teslaNavidromeUserProfiles"
const CURRENT_AUTH_KEY = "teslaNavidromeCurrentAuth"
const MIN_FUTURE = 8
const MAX_HISTORY = 200
const ALBUM_PAGE_SIZE = 4
const ARTIST_PAGE_SIZE = 4
const ALBUM_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("")

function emptyAuthState() {
  return {
    jwt: "",
    username: "",
    salt: "",
    subsonicToken: "",
    name: "",
    isAuthenticated: false,
  }
}

function normalizeAuthProfile(profile) {
  if (!profile?.username) {
    return emptyAuthState()
  }
  const username = profile.username || ""
  const name = profile.name || username
  const jwt = profile.jwt || profile.token || ""
  const salt = profile.salt || profile.subsonicSalt || profile["subsonic-salt"] || ""
  const subsonicToken = profile.subsonicToken || profile["subsonic-token"] || ""
  return {
    ...profile,
    jwt,
    token: profile.token || jwt,
    userId: profile.userId || profile.id || "",
    username,
    name,
    salt,
    subsonicToken,
    isAuthenticated: profile.isAuthenticated !== false && Boolean(username && salt && subsonicToken),
  }
}

function authState() {
  try {
    const profile = JSON.parse(localStorage.getItem(CURRENT_AUTH_KEY) || "null")
    if (profile?.username) return normalizeAuthProfile(profile)
  } catch {
    localStorage.removeItem(CURRENT_AUTH_KEY)
  }
  return normalizeAuthProfile(loadUserProfiles()[0])
}

function currentAuthProfile() {
  const auth = authState()
  if (!auth.username) return null
  return normalizeAuthProfile(auth)
}

function loadUserProfiles() {
  try {
    const profiles = JSON.parse(localStorage.getItem(USER_PROFILES_KEY) || "[]")
    return Array.isArray(profiles) ? profiles.filter((profile) => profile?.username) : []
  } catch {
    return []
  }
}

function saveUserProfiles(profiles) {
  localStorage.setItem(USER_PROFILES_KEY, JSON.stringify(profiles))
}

function removeUserProfile(username) {
  const nextProfiles = loadUserProfiles().filter((profile) => profile.username !== username)
  saveUserProfiles(nextProfiles)
  return nextProfiles
}

function saveCurrentAuthProfile(profile) {
  localStorage.setItem(CURRENT_AUTH_KEY, JSON.stringify(normalizeAuthProfile(profile)))
}

function rememberCurrentAuthProfile(profile = currentAuthProfile()) {
  if (!profile) return loadUserProfiles()
  const normalizedProfile = normalizeAuthProfile(profile)
  saveCurrentAuthProfile(normalizedProfile)
  const profiles = loadUserProfiles().filter((item) => item.username !== profile.username)
  const nextProfiles = [{ ...normalizedProfile, savedAt: Date.now() }, ...profiles]
  saveUserProfiles(nextProfiles)
  return nextProfiles
}

function activateUserProfile(profile) {
  saveCurrentAuthProfile(profile)
}

function storeAuth(data) {
  const profile = normalizeAuthProfile({
    jwt: data.token || "",
    token: data.token || "",
    userId: data.id || "",
    id: data.id || "",
    name: data.name || data.username,
    username: data.username,
    avatar: data.avatar || "",
    role: data.isAdmin ? "admin" : "regular",
    salt: data.subsonicSalt,
    subsonicToken: data.subsonicToken,
    isAuthenticated: true,
  })
  rememberCurrentAuthProfile(profile)
}

function clearAuth() {
  localStorage.removeItem(CURRENT_AUTH_KEY)
}

function subsonicUrl(command, params = {}, auth = authState()) {
  const query = new URLSearchParams({
    u: auth.username,
    t: auth.subsonicToken,
    s: auth.salt,
    v: API_VERSION,
    c: CLIENT,
    f: "json",
  })
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue
    if (Array.isArray(value)) {
      value.forEach((item) => query.append(key, item))
    } else {
      query.append(key, value)
    }
  }
  return `/rest/${command}.view?${query.toString()}`
}

async function subsonic(command, params, auth) {
  const response = await fetch(subsonicUrl(command, params, auth))
  const json = await response.json()
  const payload = json["subsonic-response"]
  if (!response.ok || payload?.status === "failed") {
    throw new Error(payload?.error?.message || response.statusText)
  }
  return payload
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00"
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${String(secs).padStart(2, "0")}`
}

function normalizeSong(song) {
  return {
    id: song.id,
    title: song.title || "Untitled",
    artist: song.artist || song.albumArtist || "Unknown Artist",
    album: song.album || "",
    albumId: song.albumId || "",
    artistId: song.artistId || "",
    duration: song.duration || 0,
    coverArt: song.coverArt,
    starred: Boolean(song.starred),
  }
}

function normalizePlaylist(playlist) {
  return {
    id: playlist.id,
    name: playlist.name || "Playlist",
    songCount: playlist.songCount || 0,
    duration: playlist.duration || 0,
    coverArt: playlist.coverArt,
    owner: playlist.owner || "",
  }
}

function normalizeAlbum(album) {
  return {
    id: album.id,
    name: album.name || album.title || "Album",
    artist: album.artist || album.albumArtist || "",
    songCount: album.songCount || 0,
    coverArt: album.coverArt,
  }
}

function normalizeArtist(artist) {
  return {
    id: artist.id || artist.name,
    name: artist.name || "Artists",
    albumCount: artist.albumCount || 0,
  }
}

function matchesPlaylistQuery(playlist, query) {
  const normalizedQuery = query.trim().toLocaleLowerCase()
  if (!normalizedQuery) return false
  if ("playlist".startsWith(normalizedQuery)) return true
  return playlist.name.toLocaleLowerCase().includes(normalizedQuery)
}

function stateStorageKey(username) {
  return username ? `${STORAGE_KEY}:${username}` : STORAGE_KEY
}

function loadSavedState(username = authState().username) {
  try {
    const userKey = stateStorageKey(username)
    let raw = username ? localStorage.getItem(userKey) : localStorage.getItem(STORAGE_KEY)
    if (!raw && username) {
      raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        localStorage.setItem(userKey, raw)
        localStorage.removeItem(STORAGE_KEY)
      }
    }
    raw ||= "{}"
    const saved = JSON.parse(raw)
    // Keep existing sessions created before the English terminology change.
    const history = Array.isArray(saved.history) ? saved.history : saved.verlauf
    if (!Array.isArray(history)) return null
    return {
      history: history.slice(-MAX_HISTORY - MIN_FUTURE),
      currentIndex: Math.max(-1, Number(saved.currentIndex ?? -1)),
      position: Number(saved.position || 0),
      wasPlaying: Boolean(saved.wasPlaying),
    }
  } catch {
    return null
  }
}

function saveState({ history, currentIndex, position, wasPlaying, username }) {
  localStorage.setItem(
    stateStorageKey(username),
    JSON.stringify({
      history: history.slice(-MAX_HISTORY - MIN_FUTURE),
      currentIndex,
      position,
      wasPlaying,
      savedAt: Date.now(),
    }),
  )
}

function loadSkipStats() {
  try {
    return JSON.parse(localStorage.getItem(SKIP_STATS_KEY) || "{}")
  } catch {
    return {}
  }
}

function saveSkipStats(stats) {
  localStorage.setItem(SKIP_STATS_KEY, JSON.stringify(stats))
}

function App() {
  const initialAuth = useMemo(authState, [])
  const savedState = useMemo(() => loadSavedState(initialAuth.username), [initialAuth.username])
  const [auth, setAuth] = useState(initialAuth)
  const [query, setQuery] = useState("")
  const [songs, setSongs] = useState([])
  const [playlistResults, setPlaylistResults] = useState([])
  const [albumResults, setAlbumResults] = useState([])
  const [artistResults, setArtistResults] = useState([])
  const [resultTitle, setResultTitle] = useState("Results")
  const [playlistView, setPlaylistView] = useState(null)
  // Stack of result pages so Back can restore the exact page we came from.
  const [viewStack, setViewStack] = useState([])
  const [searchMode, setSearchMode] = useState("home")
  const [history, setHistory] = useState(savedState?.history || [])
  const [currentIndex, setCurrentIndex] = useState(savedState?.currentIndex ?? -1)
  // Explicit queue for ordered album/playlist playback.
  // history remains the random/history queue.
  const [playbackQueue, setPlaybackQueue] = useState([])
  const [playbackQueueIndex, setPlaybackQueueIndex] = useState(-1)
  const [isPlaying, setIsPlaying] = useState(false)
  const [status, setStatus] = useState("")
  const [time, setTime] = useState({ current: savedState?.position || 0, duration: 0 })
  const [theme, setTheme] = useState(localStorage.getItem(THEME_KEY) || "auto")
  const [showPassword, setShowPassword] = useState(false)
  const [menu, setMenu] = useState(null)
  const [playlists, setPlaylists] = useState([])
  const [userProfiles, setUserProfiles] = useState(loadUserProfiles)
  const [newPlaylistName, setNewPlaylistName] = useState("")
  const [dragState, setDragState] = useState(null)
  const [albumPage, setAlbumPage] = useState({ offset: 0, totalSize: 0, hasNext: false, loading: false })
  const [artistPage, setArtistPage] = useState({ offset: 0, hasNext: false, loading: false })
  const audioRef = useRef(null)
  const searchInputRef = useRef(null)
  const currentRowRef = useRef(null)
  const pendingSeekRef = useRef(savedState?.position || 0)
  const didRestorePositionRef = useRef(false)
  const didLoadInitialResultsRef = useRef(false)
  const randomRefillRunning = useRef(false)
  const skipStatsRef = useRef(loadSkipStats())
  const playStartRef = useRef({ songId: "", startedAt: 0, duration: 0 })
  const playbackQueueRef = useRef({ songs: [], index: -1, isOrderedPlayback: false })
  const albumLoadRef = useRef(false)
  const artistLoadRef = useRef(false)
  const artistCatalogRef = useRef([])

  const playbackQueueActive = playbackQueue.length > 0 && playbackQueueIndex >= 0
  const currentSong = playbackQueueActive
    ? playbackQueue[playbackQueueIndex]
    : currentIndex >= 0
      ? history[currentIndex]
      : null
  const futureCount = Math.max(0, history.length - currentIndex - 1)
  const canUseApi = auth.username && auth.subsonicToken && auth.salt
  const isEditablePlaylist = playlistView?.type === "playlist"

  function startPlaybackQueue(queue, index) {
    const orderedSongs = [...queue]
    playbackQueueRef.current = { songs: orderedSongs, index, isOrderedPlayback: true }
    setPlaybackQueue(orderedSongs)
    setPlaybackQueueIndex(index)
  }

  function clearPlaybackQueue() {
    playbackQueueRef.current = { songs: [], index: -1, isOrderedPlayback: false }
    setPlaybackQueue([])
    setPlaybackQueueIndex(-1)
  }

  async function loadAlbumPage(offset, knownTotalSize = albumPage.totalSize) {
    if (albumLoadRef.current) return

    albumLoadRef.current = true
    setAlbumPage((page) => ({ ...page, loading: true }))
    try {
      const data = await subsonic(
        "getAlbumList2",
        {
          type: "alphabeticalByName",
          size: ALBUM_PAGE_SIZE,
          offset,
        },
        auth,
      )
      const albums = (data.albumList2?.album || []).map(normalizeAlbum)
      const totalSize = Number(data.albumList2?.totalSize || 0) || knownTotalSize
      setAlbumResults(albums)
      setAlbumPage({
        offset,
        totalSize,
        hasNext:
          albums.length === ALBUM_PAGE_SIZE &&
          (totalSize === 0 || offset + albums.length < totalSize),
        loading: false,
      })
      window.requestAnimationFrame(() => {
        document.querySelector(".songList")?.scrollTo({ top: 0, behavior: "auto" })
      })
    } catch (err) {
      setStatus(err.message)
      setAlbumPage((page) => ({ ...page, loading: false }))
    } finally {
      albumLoadRef.current = false
    }
  }

  async function jumpToAlbumLetter(letter) {
    if (albumLoadRef.current) return

    setMenu(null)
    albumLoadRef.current = true
    setAlbumPage((page) => ({ ...page, loading: true }))
    try {
      let totalSize = albumPage.totalSize
      if (!totalSize) {
        let lastKnownAlbum = 0
        let firstPossibleEmpty = 1

        // Navidrome does not always return totalSize. Find the first empty
        // offset with logarithmic probes, without storing album pages.
        while (true) {
          const data = await subsonic(
            "getAlbumList2",
            { type: "alphabeticalByName", size: 1, offset: firstPossibleEmpty },
            auth,
          )
          if (!(data.albumList2?.album || []).length) break
          lastKnownAlbum = firstPossibleEmpty
          firstPossibleEmpty *= 2
        }

        let low = lastKnownAlbum + 1
        let high = firstPossibleEmpty
        while (low < high) {
          const midpoint = Math.floor((low + high) / 2)
          const data = await subsonic(
            "getAlbumList2",
            { type: "alphabeticalByName", size: 1, offset: midpoint },
            auth,
          )
          if ((data.albumList2?.album || []).length) low = midpoint + 1
          else high = midpoint
        }
        totalSize = low
      }

      let low = 0
      let high = totalSize - 1
      let matchOffset = totalSize - 1

      // Find the first alphabetically matching album without retaining the
      // intermediate records in the browser.
      while (low <= high) {
        const midpoint = Math.floor((low + high) / 2)
        const data = await subsonic(
          "getAlbumList2",
          { type: "alphabeticalByName", size: 1, offset: midpoint },
          auth,
        )
        const name = normalizeAlbum(data.albumList2?.album?.[0] || {}).name.trim()
        if (name.localeCompare(letter, undefined, { sensitivity: "base" }) < 0) {
          low = midpoint + 1
        } else {
          matchOffset = midpoint
          high = midpoint - 1
        }
      }

      albumLoadRef.current = false
      // Start this page at the match itself, so the selected letter is the
      // first visible album rather than appearing at the bottom of a page.
      await loadAlbumPage(matchOffset, totalSize)
    } catch (err) {
      setStatus(err.message)
      setAlbumPage((page) => ({ ...page, loading: false }))
    } finally {
      albumLoadRef.current = false
    }
  }

  async function loadArtistCatalog() {
    const data = await subsonic("getArtists", {}, auth)
    // getArtists is Navidrome's alphabetical index. Search results are
    // relevance-ranked, which made the previous A-Z navigation unreliable.
    artistCatalogRef.current = (data.artists?.index || [])
      .flatMap((index) => index.artist || [])
      .map(normalizeArtist)
      .filter((artist) => artist.albumCount > 0)
      .sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: "base", numeric: true }))
  }

  async function loadArtistPage(offset) {
    if (artistLoadRef.current) return

    artistLoadRef.current = true
    setArtistPage((page) => ({ ...page, loading: true }))
    try {
      if (!artistCatalogRef.current.length) await loadArtistCatalog()
      const artists = artistCatalogRef.current.slice(offset, offset + ARTIST_PAGE_SIZE)
      setArtistResults(artists)
      setArtistPage({ offset, hasNext: offset + artists.length < artistCatalogRef.current.length, loading: false })
      window.requestAnimationFrame(() => {
        document.querySelector(".songList")?.scrollTo({ top: 0, behavior: "auto" })
      })
    } catch (err) {
      setStatus(err.message)
      setArtistPage((page) => ({ ...page, loading: false }))
    } finally {
      artistLoadRef.current = false
    }
  }

  async function jumpToArtistLetter(letter) {
    if (artistLoadRef.current) return

    setMenu(null)
    artistLoadRef.current = true
    setArtistPage((page) => ({ ...page, loading: true }))
    try {
      if (!artistCatalogRef.current.length) await loadArtistCatalog()
      const matchOffset = artistCatalogRef.current.findIndex(
        (artist) => artist.name.localeCompare(letter, undefined, { sensitivity: "base" }) >= 0,
      )

      artistLoadRef.current = false
      // Start this page at the matching artist for the same top-of-page
      // behavior as the Albums browser.
      await loadArtistPage(Math.max(0, matchOffset))
    } catch (err) {
      setStatus(err.message)
      setArtistPage((page) => ({ ...page, loading: false }))
    } finally {
      artistLoadRef.current = false
    }
  }

  const streamUrl = useMemo(() => {
    if (!currentSong || !canUseApi) return ""
    return subsonicUrl("stream", { id: currentSong.id, maxBitRate: 320 }, auth)
  }, [auth, canUseApi, currentSong])

  const addRandomFuture = useCallback(
    async (count = MIN_FUTURE) => {
      if (!canUseApi || randomRefillRunning.current) return []
      randomRefillRunning.current = true
      try {
        const data = await subsonic("getRandomSongs", { size: count }, auth)
        const randomSongs = (data.randomSongs?.song || []).map(normalizeSong)
        if (randomSongs.length) {
          setHistory((items) => [...items, ...randomSongs])
        }
        return randomSongs
      } catch (err) {
        setStatus(err.message)
        return []
      } finally {
        randomRefillRunning.current = false
      }
    },
    [auth, canUseApi],
  )

  function recordSkip(songId, playedSeconds, durationSeconds) {
    if (!songId || !Number.isFinite(playedSeconds) || !Number.isFinite(durationSeconds) || durationSeconds <= 0) return
    const ratio = playedSeconds / durationSeconds
    if (ratio <= 0.1 || ratio >= 0.5) return
    const nextStats = {
      ...skipStatsRef.current,
      [songId]: {
        skips: (skipStatsRef.current[songId]?.skips || 0) + 1,
        lastRatio: ratio,
        lastSkippedAt: Date.now(),
      },
    }
    skipStatsRef.current = nextStats
    saveSkipStats(nextStats)
  }

  function markCurrentSongSkip() {
    const audio = audioRef.current
    const songId = currentSong?.id || playStartRef.current.songId
    if (!songId || !audio) return
    recordSkip(songId, audio.currentTime || 0, audio.duration || currentSong?.duration || playStartRef.current.duration)
    playStartRef.current = { songId: "", startedAt: 0, duration: 0 }
  }

  const next = useCallback(async () => {
    // Album/playlist playback is independent of the random/history queue.
    const orderedQueue = playbackQueueRef.current
    if (orderedQueue.isOrderedPlayback) {
      if (
        orderedQueue.songs.length &&
        orderedQueue.index >= 0 &&
        orderedQueue.index < orderedQueue.songs.length - 1
      ) {
        markCurrentSongSkip()
        const nextIndex = orderedQueue.index + 1
        playbackQueueRef.current = { ...orderedQueue, index: nextIndex }
        setPlaybackQueueIndex(nextIndex)
      }
      return
    }

    // Normal/radio playback uses the random/history queue.
    markCurrentSongSkip()
    const currentFutureCount = Math.max(0, history.length - currentIndex - 1)
    const added = currentIndex >= 0 && currentFutureCount < MIN_FUTURE
      ? await addRandomFuture(MIN_FUTURE - currentFutureCount)
      : []
    const availableLength = history.length + added.length
    setCurrentIndex((idx) => {
      if (idx < 0) return idx
      return Math.min(availableLength - 1, idx + 1)
    })
  }, [
    addRandomFuture,
    currentIndex,
    currentSong,
    history.length,
  ])

  const previous = useCallback(() => {
    const audio = audioRef.current
    if (audio && audio.currentTime > 3) {
      audio.currentTime = 0
      setTime((value) => ({ ...value, current: 0 }))
      return
    }

    markCurrentSongSkip()

    const orderedQueue = playbackQueueRef.current
    if (orderedQueue.isOrderedPlayback) {
      if (orderedQueue.songs.length && orderedQueue.index > 0) {
        const previousIndex = orderedQueue.index - 1
        playbackQueueRef.current = { ...orderedQueue, index: previousIndex }
        setPlaybackQueueIndex(previousIndex)
      }
      return
    }

    const currentFutureCount = Math.max(0, history.length - currentIndex - 1)
    if (currentIndex >= 0 && currentFutureCount < MIN_FUTURE) {
      addRandomFuture(MIN_FUTURE - currentFutureCount)
    }
    setCurrentIndex((idx) => Math.max(0, idx - 1))
  }, [
    addRandomFuture,
    currentIndex,
    currentSong,
    history.length,
  ])

  const togglePlayback = useCallback(async () => {
    const audio = audioRef.current
    if (!audio) return
    if (!currentSong && songs.length) {
      if (playlistView?.type === "album" || playlistView?.type === "playlist") {
        markCurrentSongSkip()
        startPlaybackQueue(songs, 0)
      } else {
        insertAndPlay(songs[0])
      }
      return
    }
    if (audio.paused) {
      await audio.play()
    } else {
      audio.pause()
    }
  }, [currentSong, songs])

  useEffect(() => {
    if (auth.isAuthenticated && canUseApi) {
      setUserProfiles(rememberCurrentAuthProfile())
      subsonic("ping", {}, auth).catch(() => {
        setStatus("Login found, but API access failed. Please log in again.")
      })
    }
  }, [auth, canUseApi])

  useEffect(() => {
    if (!auth.isAuthenticated || !auth.username) return
    const nextSavedState = loadSavedState(auth.username)
    setHistory(nextSavedState?.history || [])
    setCurrentIndex(nextSavedState?.currentIndex ?? -1)
    clearPlaybackQueue()
    setTime({ current: nextSavedState?.position || 0, duration: 0 })
    pendingSeekRef.current = nextSavedState?.position || 0
    didRestorePositionRef.current = false
    didLoadInitialResultsRef.current = false
    setSongs([])
    setPlaylistResults([])
    setAlbumResults([])
    setArtistResults([])
    setPlaylistView(null)
    setViewStack([])
    artistCatalogRef.current = []
    setArtistPage({ offset: 0, hasNext: false, loading: false })
    setResultTitle("Results")
    setQuery("")
    setSearchMode("home")
  }, [auth.username])

  useEffect(() => {
    if (playlistView) return

    if (!query.trim() || !canUseApi) {
      // Do not clear the current result page here. In particular, the
      // Artists page has no query and playlistView is null. Clearing these
      // arrays here was exactly why Back restored Artists and then they
      // immediately disappeared on the next render.
      return
    }

    // The search result DOM has not been rendered yet at this point, so
    // resetting scroll here is too early. The result-list effect below
    // resets it after React has rendered the new results.
    const handle = window.setTimeout(async () => {
      try {
        setStatus("Searching...")
        const [data, playlistData] = await Promise.all([
          subsonic(
            "search3",
            {
              query,
              artistCount: 0,
              albumCount: 4,
              songCount: 40,
            },
            auth,
          ),
          subsonic("getPlaylists", {}, auth),
        ])
        setSongs((data.searchResult3?.song || []).map(normalizeSong))
        setAlbumResults((data.searchResult3?.album || []).map(normalizeAlbum))
        setArtistResults([])
        setResultTitle("Results")
        setPlaylistResults(
          (playlistData.playlists?.playlist || [])
            .map(normalizePlaylist)
            .filter((playlist) => matchesPlaylistQuery(playlist, query)),
        )
        setStatus("")
      } catch (err) {
        setStatus(err.message)
      }
    }, 250)
    return () => window.clearTimeout(handle)
  }, [auth, canUseApi, playlistView, query])

  useEffect(() => {
    if (!canUseApi || didLoadInitialResultsRef.current || playlistView || query.trim()) return
    didLoadInitialResultsRef.current = true
    randomPlay()
  }, [canUseApi, playlistView, query])

  useEffect(() => {
    if (playlistView || !query.trim() || !canUseApi) return

    // Run after the search results have been rendered. This is deliberately
    // separate from the search request above: resetting before the results
    // exist can be undone when React replaces the old Albums/Artists DOM.
    const handle = window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" })
      document.documentElement.scrollTop = 0
      document.body.scrollTop = 0

      // If the application is being displayed inside a scrolling container,
      // scroll the first result itself to the top as well.
      const firstResult = document.querySelector(
        ".songList > .songRow"
      )

      if (firstResult) {
        firstResult.scrollIntoView({
          block: "start",
          behavior: "auto",
        })
      }
    })

    return () => window.cancelAnimationFrame(handle)
  }, [
    albumResults,
    artistResults,
    canUseApi,
    playlistResults,
    playlistView,
    query,
    songs,
  ])


  useEffect(() => {
    if (currentIndex <= MAX_HISTORY || history.length <= MAX_HISTORY + MIN_FUTURE) return
    const drop = currentIndex - MAX_HISTORY
    setHistory((items) => items.slice(drop))
    setCurrentIndex((idx) => idx - drop)
  }, [currentIndex, history.length])

  useEffect(() => {
    if (!auth.username) return
    saveState({
      history,
      currentIndex,
      position: audioRef.current?.currentTime || time.current || 0,
      wasPlaying: isPlaying,
      username: auth.username,
    })
  }, [auth.username, currentIndex, isPlaying, time.current, history])

  useEffect(() => {
    currentRowRef.current?.scrollIntoView({ block: "center", behavior: "smooth" })
  }, [currentIndex])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem(THEME_KEY, theme)
  }, [theme])

  useEffect(() => {
    if (searchMode !== "search") return
    window.setTimeout(() => searchInputRef.current?.focus(), 0)
  }, [searchMode])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    const onTime = () => {
      setTime({ current: audio.currentTime || 0, duration: audio.duration || currentSong?.duration || 0 })
    }
    const onLoaded = () => {
      if (pendingSeekRef.current > 0 && Number.isFinite(audio.duration)) {
        audio.currentTime = Math.min(pendingSeekRef.current, Math.max(0, audio.duration - 1))
        pendingSeekRef.current = 0
      }
    }
    const onEnded = () => next()
    const onPlay = () => {
      playStartRef.current = {
        songId: currentSong?.id || "",
        startedAt: audio.currentTime || 0,
        duration: audio.duration || currentSong?.duration || 0,
      }
      setIsPlaying(true)
    }
    const onPause = () => setIsPlaying(false)
    audio.addEventListener("timeupdate", onTime)
    audio.addEventListener("durationchange", onTime)
    audio.addEventListener("loadedmetadata", onLoaded)
    audio.addEventListener("ended", onEnded)
    audio.addEventListener("play", onPlay)
    audio.addEventListener("pause", onPause)
    return () => {
      audio.removeEventListener("timeupdate", onTime)
      audio.removeEventListener("durationchange", onTime)
      audio.removeEventListener("loadedmetadata", onLoaded)
      audio.removeEventListener("ended", onEnded)
      audio.removeEventListener("play", onPlay)
      audio.removeEventListener("pause", onPause)
    }
  }, [currentSong?.duration, currentSong?.id, next])

  useEffect(() => {
    const previousSong = playStartRef.current
    if (!previousSong.songId || previousSong.songId === currentSong?.id) return
    recordSkip(previousSong.songId, time.current, time.duration || previousSong.duration)
    playStartRef.current = { songId: "", startedAt: 0, duration: 0 }
  }, [currentSong?.id])

  useEffect(() => {
    if (!streamUrl || !audioRef.current) return
    const shouldRestore =
      !didRestorePositionRef.current &&
      currentSong?.id === savedState?.history?.[savedState.currentIndex]?.id &&
      savedState.position > 0
    pendingSeekRef.current = shouldRestore ? savedState.position : 0
    didRestorePositionRef.current = true
    audioRef.current.removeAttribute("poster")
    audioRef.current.src = streamUrl
    audioRef.current.play().catch((err) => {
      if (savedState?.wasPlaying) {
        setStatus(`Tap Play to resume: ${err.message}`)
      }
    })
  }, [currentSong?.id, savedState, streamUrl])

  useEffect(() => {
    if (!("mediaSession" in navigator)) return
    navigator.mediaSession.metadata = currentSong
      ? new MediaMetadata({
          title: currentSong.title,
          artist: currentSong.artist,
          album: currentSong.album,
        })
      : null
    const setHandler = (action, handler) => {
      try {
        navigator.mediaSession.setActionHandler(action, handler)
      } catch {
        // Some Chromium builds expose Media Session but not every action.
      }
    }
    setHandler("play", togglePlayback)
    setHandler("pause", togglePlayback)
    setHandler("previoustrack", previous)
    setHandler("nexttrack", next)
  }, [currentSong, next, previous, togglePlayback])

  useEffect(() => {
    const handleKey = (event) => {
      const tag = event.target?.tagName?.toLowerCase()
      if (tag === "input" || tag === "textarea" || event.target?.isContentEditable) return
      if (event.key === "MediaTrackNext") next()
      if (event.key === "MediaTrackPrevious") previous()
      if (event.key === "MediaPlayPause" || event.key === " ") {
        event.preventDefault()
        togglePlayback()
      }
    }
    window.addEventListener("keydown", handleKey)
    return () => window.removeEventListener("keydown", handleKey)
  }, [next, previous, togglePlayback])

  async function login(event) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    try {
      setStatus("Logging in...")
      const response = await fetch("/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: form.get("username"),
          password: form.get("password"),
        }),
      })
      if (!response.ok) throw new Error("Login failed")
      const data = await response.json()
      storeAuth(data)
      setAuth(authState())
      setStatus("")
    } catch (err) {
      setStatus(err.message)
    }
  }

  function insertAndPlay(song) {
    markCurrentSongSkip()
    setHistory((items) => {
      const index = currentIndex >= 0 ? currentIndex : -1
      return [...items.slice(0, index + 1), song, ...items.slice(index + 1)]
    })
    setCurrentIndex((idx) => idx + 1)
  }

  function playQueuedSongs(song) {
    const isCollectionView =
      playlistView?.type === "album" || playlistView?.type === "playlist"

    if (!isCollectionView) {
      clearPlaybackQueue()
      insertAndPlay(song)
      return
    }

    const songIndex = songs.findIndex((item) => item.id === song.id)
    if (songIndex < 0) {
      clearPlaybackQueue()
      insertAndPlay(song)
      return
    }

    markCurrentSongSkip()
    // Keep the complete collection in order so Previous can reach tracks
    // before the one the listener selected.
    startPlaybackQueue(songs, songIndex)
  }

  function insertAfterCurrent(song) {
    setHistory((items) => {
      const index = currentIndex >= 0 ? currentIndex : -1
      return [...items.slice(0, index + 1), song, ...items.slice(index + 1)]
    })
    if (currentIndex < 0) setCurrentIndex(0)
    setStatus(`Inserted after current song: ${song.title}`)
  }

  function playAllResults() {
    if (!songs.length) return

    markCurrentSongSkip()

    if (playlistView?.type === "album" || playlistView?.type === "playlist") {
      // Album/playlist Play All follows the displayed track order.
      startPlaybackQueue(songs, 0)
    } else {
      setHistory((items) => [...items.slice(0, currentIndex + 1), ...songs])
      setCurrentIndex((idx) => (idx < 0 ? 0 : idx + 1))
    }

    setMenu(null)
  }

  function insertAllResults() {
    if (!songs.length) return
    setHistory((items) => [...items.slice(0, currentIndex + 1), ...songs, ...items.slice(currentIndex + 1)])
    if (currentIndex < 0) setCurrentIndex(0)
    setMenu(null)
  }

  function appendAllResults() {
    if (!songs.length) return
    setHistory((items) => [...items, ...songs])
    if (currentIndex < 0) setCurrentIndex(0)
    setMenu(null)
  }

  function replaceHistoryWithResults() {
    if (!songs.length) return
    markCurrentSongSkip()
    setHistory(songs)
    setCurrentIndex(0)
    setMenu(null)
  }

  function pushCurrentView(options = {}) {
    setViewStack((stack) => [
      ...stack,
      {
        songs,
        playlistResults,
        albumResults,
        artistResults,
        resultTitle,
        playlistView,
        // Keep the selected artist ID as a stable navigation anchor.
        // Restoring the actual row is more reliable than restoring window.scrollY
        // because the list may be inside a scrolling container.
        restoreArtistId: options.restoreArtistId || null,
        restoreAlbumId: options.restoreAlbumId || null,
        artistPageOffset: artistPage.offset,
        scrollY: window.scrollY || window.pageYOffset || 0,
        // Explicitly remember what kind of page this was. In particular,
        // the root Artists page must remain identifiable even if its
        // result arrays are later cleared.
        viewType:
          playlistView?.type ||
          (artistResults.length ? "artists" :
            albumResults.length ? "albums" :
              playlistResults.length ? "playlists" :
                songs.length ? "songs" : "empty"),
      },
    ])
  }

  async function showPlaylist(playlist) {
    pushCurrentView()
    try {
      setStatus(`Loading playlist: ${playlist.name}`)
      const data = await subsonic("getPlaylist", { id: playlist.id }, auth)
      const playlistSongs = (data.playlist?.entry || []).map(normalizeSong)
      setPlaylistView({
        type: "playlist",
        id: playlist.id,
        name: playlist.name,
        previousSongs: songs,
        previousPlaylists: playlistResults,
        previousAlbums: albumResults,
        previousArtists: artistResults,
        previousTitle: resultTitle,
        previousPlaylistView: playlistView,
      })
      setSongs(playlistSongs)
      setPlaylistResults([])
      setAlbumResults([])
      setArtistResults([])
      setResultTitle(playlist.name)
      setStatus("")
    } catch (err) {
      setStatus(err.message)
    }
  }

  async function closePlaylistView() {
    // Use the current stack entry directly. The previous implementation
    // performed the restore inside setViewStack(), which made it difficult
    // to reliably determine which page was being restored.
    if (viewStack.length > 0) {
      const previous = viewStack[viewStack.length - 1]

      setSongs(previous.songs || [])
      setPlaylistResults(previous.playlistResults || [])
      setAlbumResults(previous.albumResults || [])
      setArtistResults(previous.artistResults || [])
      setResultTitle(previous.resultTitle || "Results")
      setPlaylistView(previous.playlistView || null)
      setViewStack((stack) => stack.slice(0, -1))
      setMenu(null)

      // React needs one render to put the previous list back into the DOM
      // before the browser can restore its scroll position reliably.
      // requestAnimationFrame does that after the restored page has rendered.
      const restoreArtistId = previous.restoreArtistId
      const restoreAlbumId = previous.restoreAlbumId
      const restoreScrollY = Number(previous.scrollY || 0)

      window.requestAnimationFrame(() => {
        if (restoreArtistId) {
          const rows = document.querySelectorAll(".artistRow[data-artist-id]")
          const row = Array.from(rows).find(
            (element) => String(element.dataset.artistId) === String(restoreArtistId)
          )

          if (row) {
            row.scrollIntoView({ block: "center", behavior: "auto" })
            return
          }
        }

        if (restoreAlbumId) {
          const rows = document.querySelectorAll(".albumRow[data-album-id]")
          const row = Array.from(rows).find(
            (element) => String(element.dataset.albumId) === String(restoreAlbumId)
          )

          if (row) {
            row.scrollIntoView({ block: "center", behavior: "auto" })
            return
          }
        }

        // Fallback for pages without a stable row anchor.
        window.scrollTo({ top: restoreScrollY, left: 0, behavior: "auto" })
      })

      // The Artists page is the root page. If its cached page has somehow
      // been lost, reload just that ten-item page rather than the library.
      if (
        previous.resultTitle === "Artists" &&
        !(previous.artistResults || []).length
      ) {
        try {
          setStatus("Loading artists...")
          await loadArtistPage(previous.artistPageOffset || 0)
          setStatus("")
        } catch (err) {
          setStatus(err.message)
        }
      }

      return
    }

    // Compatibility fallback for a detail view created before the stack
    // existed.
    if (!playlistView) return

    const previousTitle = playlistView.previousTitle || "Results"

    setSongs(playlistView.previousSongs || [])
    setPlaylistResults(playlistView.previousPlaylists || [])
    setAlbumResults(playlistView.previousAlbums || [])
    setArtistResults(playlistView.previousArtists || [])
    setResultTitle(previousTitle)
    setPlaylistView(playlistView.previousPlaylistView || null)
    setMenu(null)

    const restoreScrollY = Number(playlistView.previousScrollY || 0)
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: restoreScrollY, left: 0, behavior: "auto" })
    })

    // If the root Artists page was not cached, reload one page only.
    if (
      previousTitle === "Artists" &&
      !(playlistView.previousArtists || []).length
    ) {
      try {
        setStatus("Loading artists...")
        await loadArtistPage(artistPage.offset || 0)
        setStatus("")
      } catch (err) {
        setStatus(err.message)
      }
    }
  }

  async function toggleStar(song) {
    if (!song) return
    try {
      await subsonic(song.starred ? "unstar" : "star", { id: song.id }, auth)
      const update = (item) => (item.id === song.id ? { ...item, starred: !song.starred } : item)
      setSongs((items) => items.map(update))
      setHistory((items) => items.map(update))
      setPlaybackQueue((items) => items.map(update))
      playbackQueueRef.current = {
        ...playbackQueueRef.current,
        songs: playbackQueueRef.current.songs.map(update),
      }
    } catch (err) {
      setStatus(err.message)
    }
  }

  async function randomPlay() {
    try {
      setStatus("Loading random songs...")
      const data = await subsonic("getRandomSongs", { size: 30 }, auth)
      const randomSongs = (data.randomSongs?.song || []).map(normalizeSong)
      clearPlaybackQueue()
      setSongs(randomSongs)
      setPlaylistResults([])
      setAlbumResults([])
      setArtistResults([])
      setPlaylistView(null)
      setViewStack([])
      setResultTitle("Random")
      setStatus("")
    } catch (err) {
      setStatus(err.message)
    }
  }

  async function showLikedSongs() {
    try {
      setStatus("Loading liked songs...")
      const data = await subsonic("getStarred2", {}, auth)
      const likedSongs = (data.starred2?.song || []).map(normalizeSong)
      setSongs(likedSongs)
      setPlaylistResults([])
      setAlbumResults([])
      setArtistResults([])
      setPlaylistView(null)
      setViewStack([])
      setResultTitle("Liked")
      setStatus("")
    } catch (err) {
      setStatus(err.message)
    }
  }

  async function showAllPlaylists() {
    try {
      setStatus("Loading playlists...")
      const data = await subsonic("getPlaylists", {}, auth)
      setSongs([])
      setPlaylistResults((data.playlists?.playlist || []).map(normalizePlaylist))
      setAlbumResults([])
      setArtistResults([])
      setPlaylistView(null)
      setViewStack([])
      setResultTitle("Playlists")
      setStatus("")
    } catch (err) {
      setStatus(err.message)
    }
  }

  async function showAllAlbums() {
    try {
      setStatus("Loading albums...")
      setSongs([])
      setPlaylistResults([])
      setAlbumResults([])
      setArtistResults([])
      setPlaylistView(null)
      setViewStack([])
      setResultTitle("Albums")
      await loadAlbumPage(0)
      setStatus("")
    } catch (err) {
      setStatus(err.message)
    }
  }

  async function showAllArtists() {
    try {
      setStatus("Loading artists...")
      setSongs([])
      setPlaylistResults([])
      setAlbumResults([])
      setArtistResults([])
      setPlaylistView(null)
      setViewStack([])
      setResultTitle("Artists")
      artistCatalogRef.current = []
      await loadArtistCatalog()
      await loadArtistPage(0)
      setStatus("")
    } catch (err) {
      setStatus(err.message)
    }
  }

  async function showAlbumResult(album) {
    pushCurrentView({ restoreAlbumId: album.id })
    try {
      setStatus(`Loading album: ${album.name}`)
      const data = await subsonic("getAlbum", { id: album.id }, auth)
      setPlaylistView({
        type: "album",
        id: album.id,
        name: album.name,
        previousSongs: songs,
        previousPlaylists: playlistResults,
        previousAlbums: albumResults,
        previousArtists: artistResults,
        previousTitle: resultTitle,
        previousPlaylistView: playlistView,
      })
      setSongs((data.album?.song || []).map(normalizeSong))
      setPlaylistResults([])
      setAlbumResults([])
      setArtistResults([])
      setResultTitle(`Album ${album.name}`)
      setStatus("")
    } catch (err) {
      setStatus(err.message)
    }
  }

  async function showArtistResult(artist) {
    await showArtist({ artist: artist.name, artistId: artist.id })
  }

  async function showAlbum(song) {
    if (!song.albumId) {
      setStatus("No album found for this song.")
      return
    }
    pushCurrentView()
    try {
      const data = await subsonic("getAlbum", { id: song.albumId }, auth)
      setPlaylistView({
        type: "album",
        id: song.albumId,
        name: song.album || "Album",
        previousSongs: songs,
        previousPlaylists: playlistResults,
        previousAlbums: albumResults,
        previousArtists: artistResults,
        previousTitle: resultTitle,
        previousPlaylistView: playlistView,
      })
      setSongs((data.album?.song || []).map(normalizeSong))
      setPlaylistResults([])
      setAlbumResults([])
      setArtistResults([])
      setResultTitle(`Album ${song.album || ""}`.trim())
      setStatus(`Album: ${song.album}`)
      setMenu(null)
    } catch (err) {
      setStatus(err.message)
    }
  }

  async function showArtist(song) {
    if (!song.artist) {
      setStatus("No artist found for this song.")
      return
    }

    try {
      // Use Navidrome's getArtist endpoint rather than search3.
      // getArtist returns the albums belonging to this specific artist.
      const artistId = song.artistId || song.id

      if (!artistId) {
        throw new Error(`No artist ID found for ${song.artist}`)
      }

      // Save the current Artists page and the exact artist that was selected.
      pushCurrentView({ restoreArtistId: artistId })

      setStatus(`Loading artist: ${song.artist}`)

      const data = await subsonic(
        "getArtist",
        { id: artistId },
        auth,
      )

      const artistAlbums = (data.artist?.album || []).map(normalizeAlbum)

      setPlaylistView({
        type: "artist",
        id: artistId,
        name: song.artist,
        previousSongs: songs,
        previousPlaylists: playlistResults,
        previousAlbums: albumResults,
        previousArtists: artistResults,
        previousTitle: resultTitle,
        previousPlaylistView: playlistView,
      })

      // Artist view shows albums. Selecting an album then shows its tracks.
      setSongs([])
      setPlaylistResults([])
      setAlbumResults(artistAlbums)
      setArtistResults([])
      setResultTitle(`Albums by ${song.artist}`)
      setStatus("")
      setMenu(null)
    } catch (err) {
      setStatus(err.message)
    }
  }

  async function loadPlaylists() {
    try {
      const data = await subsonic("getPlaylists", {}, auth)
      setPlaylists(data.playlists?.playlist || [])
    } catch (err) {
      setStatus(err.message)
    }
  }

  async function addSongToPlaylist(playlistId, songId) {
    try {
      await subsonic("updatePlaylist", { playlistId, songIdToAdd: songId }, auth)
      setStatus("Added to playlist.")
      setMenu(null)
    } catch (err) {
      setStatus(err.message)
    }
  }

  async function addHistoryToPlaylist(playlistId) {
    if (!history.length) return
    try {
      await subsonic("updatePlaylist", { playlistId, songIdToAdd: history.map((song) => song.id) }, auth)
      setStatus("Added history to playlist.")
      setMenu(null)
    } catch (err) {
      setStatus(err.message)
    }
  }

  async function createPlaylistWithHistory() {
    if (!newPlaylistName.trim() || !history.length) return
    try {
      await subsonic("createPlaylist", { name: newPlaylistName.trim(), songId: history.map((song) => song.id) }, auth)
      setNewPlaylistName("")
      setStatus("Created playlist from history.")
      setMenu(null)
    } catch (err) {
      setStatus(err.message)
    }
  }

  async function createPlaylistWithSong(songId) {
    if (!newPlaylistName.trim()) return
    try {
      await subsonic("createPlaylist", { name: newPlaylistName.trim(), songId }, auth)
      setNewPlaylistName("")
      setStatus("Playlist created.")
      setMenu(null)
    } catch (err) {
      setStatus(err.message)
    }
  }

  async function removeFromPlaylist(index) {
    if (!isEditablePlaylist) return
    try {
      await subsonic("updatePlaylist", { playlistId: playlistView.id, songIndexToRemove: index }, auth)
      setSongs((items) => items.filter((_, itemIndex) => itemIndex !== index))
      setStatus("Removed from playlist.")
      setMenu(null)
    } catch (err) {
      setStatus(err.message)
    }
  }

  function removeFromHistory(index) {
    setHistory((items) => items.filter((_, itemIndex) => itemIndex !== index))
    setCurrentIndex((idx) => {
      if (index < idx) return idx - 1
      if (index === idx) return Math.min(idx, Math.max(0, history.length - 2))
      return idx
    })
    setMenu(null)
  }

  function removePastSongs() {
    if (currentIndex <= 0) return
    setHistory((items) => items.slice(currentIndex))
    setCurrentIndex(0)
    setMenu(null)
  }

  function removeFutureSongs() {
    if (currentIndex < 0) return
    setHistory((items) => items.slice(0, currentIndex + 1))
    setMenu(null)
  }

  function removeDislikedSongs() {
    const dislikedIds = new Set(
      Object.entries(skipStatsRef.current)
        .filter(([, stats]) => stats.skips > 0 && stats.lastRatio > 0.1 && stats.lastRatio < 0.5)
        .map(([songId]) => songId),
    )
    if (!dislikedIds.size) {
      setStatus("No unpopular songs found in history.")
      setMenu(null)
      return
    }
    setHistory((items) => {
      const currentSongId = currentSong?.id
      let removedBeforeCurrent = 0
      const filtered = items.filter((song, index) => {
        if (song.id === currentSongId) return true
        const remove = dislikedIds.has(song.id)
        if (remove && index < currentIndex) removedBeforeCurrent += 1
        return !remove
      })
      setCurrentIndex((idx) => Math.max(0, idx - removedBeforeCurrent))
      return filtered
    })
    setStatus("Removed unpopular songs from history.")
    setMenu(null)
  }

  function moveHistoryItem(fromIndex, toIndex) {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return
    setHistory((items) => {
      if (fromIndex >= items.length || toIndex >= items.length) return items
      const nextItems = [...items]
      const [moved] = nextItems.splice(fromIndex, 1)
      nextItems.splice(toIndex, 0, moved)
      return nextItems
    })
    setCurrentIndex((idx) => {
      if (idx === fromIndex) return toIndex
      if (fromIndex < idx && toIndex >= idx) return idx - 1
      if (fromIndex > idx && toIndex <= idx) return idx + 1
      return idx
    })
  }

  async function savePlaylistOrder(nextSongs) {
    if (!isEditablePlaylist) return
    try {
      await subsonic("createPlaylist", { playlistId: playlistView.id, songId: nextSongs.map((song) => song.id) }, auth)
      setStatus("Playlist reordered.")
    } catch (err) {
      setStatus(err.message)
    }
  }

  function movePlaylistItem(fromIndex, toIndex) {
    if (!isEditablePlaylist || fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return
    setSongs((items) => {
      if (fromIndex >= items.length || toIndex >= items.length) return items
      const nextItems = [...items]
      const [moved] = nextItems.splice(fromIndex, 1)
      nextItems.splice(toIndex, 0, moved)
      savePlaylistOrder(nextItems)
      return nextItems
    })
  }

  function movePlaylistToInsertIndex(fromIndex, insertIndex) {
    const boundedInsertIndex = Math.max(0, Math.min(insertIndex, songs.length))
    const toIndex = fromIndex < boundedInsertIndex ? boundedInsertIndex - 1 : boundedInsertIndex
    movePlaylistItem(fromIndex, toIndex)
  }

  function moveHistoryToInsertIndex(fromIndex, insertIndex) {
    const boundedInsertIndex = Math.max(0, Math.min(insertIndex, history.length))
    const toIndex = fromIndex < boundedInsertIndex ? boundedInsertIndex - 1 : boundedInsertIndex
    moveHistoryItem(fromIndex, toIndex)
  }

  function getHistoryInsertIndex(clientY) {
    const rows = [...document.querySelectorAll(".historyRow")]
    if (!rows.length) return 0
    for (const row of rows) {
      const rect = row.getBoundingClientRect()
      const rowIndex = Number(row.dataset.index)
      if (clientY < rect.top + rect.height / 2) return rowIndex
    }
    return rows.length
  }

  function getPlaylistInsertIndex(clientY) {
    const rows = [...document.querySelectorAll(".songRow.playlistSongRow")]
    if (!rows.length) return 0
    for (const row of rows) {
      const rect = row.getBoundingClientRect()
      const rowIndex = Number(row.dataset.index)
      if (clientY < rect.top + rect.height / 2) return rowIndex
    }
    return rows.length
  }

  function beginHistoryDrag(index, event) {
    event.preventDefault()
    const updateDrag = (clientX, clientY) => {
      setDragState({
        type: "history",
        fromIndex: index,
        insertIndex: getHistoryInsertIndex(clientY),
        x: clientX,
        y: clientY,
        song: history[index],
      })
    }
    updateDrag(event.clientX, event.clientY)

    const handleMove = (moveEvent) => {
      moveEvent.preventDefault()
      updateDrag(moveEvent.clientX, moveEvent.clientY)
    }
    const handleEnd = (upEvent) => {
      upEvent.preventDefault()
      window.removeEventListener("pointermove", handleMove)
      window.removeEventListener("pointerup", handleEnd)
      window.removeEventListener("pointercancel", handleCancel)
      const insertIndex = getHistoryInsertIndex(upEvent.clientY)
      setDragState(null)
      moveHistoryToInsertIndex(index, insertIndex)
    }
    const handleCancel = () => {
      window.removeEventListener("pointermove", handleMove)
      window.removeEventListener("pointerup", handleEnd)
      window.removeEventListener("pointercancel", handleCancel)
      setDragState(null)
    }

    window.addEventListener("pointermove", handleMove, { passive: false })
    window.addEventListener("pointerup", handleEnd, { once: true })
    window.addEventListener("pointercancel", handleCancel, { once: true })
  }

  function beginPlaylistDrag(index, event) {
    if (!isEditablePlaylist) return
    event.preventDefault()
    const updateDrag = (clientX, clientY) => {
      setDragState({
        type: "playlist",
        fromIndex: index,
        insertIndex: getPlaylistInsertIndex(clientY),
        x: clientX,
        y: clientY,
        song: songs[index],
      })
    }
    updateDrag(event.clientX, event.clientY)

    const handleMove = (moveEvent) => {
      moveEvent.preventDefault()
      updateDrag(moveEvent.clientX, moveEvent.clientY)
    }
    const handleEnd = (upEvent) => {
      upEvent.preventDefault()
      window.removeEventListener("pointermove", handleMove)
      window.removeEventListener("pointerup", handleEnd)
      window.removeEventListener("pointercancel", handleCancel)
      const insertIndex = getPlaylistInsertIndex(upEvent.clientY)
      setDragState(null)
      movePlaylistToInsertIndex(index, insertIndex)
    }
    const handleCancel = () => {
      window.removeEventListener("pointermove", handleMove)
      window.removeEventListener("pointerup", handleEnd)
      window.removeEventListener("pointercancel", handleCancel)
      setDragState(null)
    }

    window.addEventListener("pointermove", handleMove, { passive: false })
    window.addEventListener("pointerup", handleEnd, { once: true })
    window.addEventListener("pointercancel", handleCancel, { once: true })
  }


  function clearHistory() {
    setMenu(null)
    subsonic("getRandomSongs", { size: MIN_FUTURE }, auth)
      .then((data) => {
        const randomSongs = (data.randomSongs?.song || []).map(normalizeSong)
        setHistory(randomSongs)
        setCurrentIndex(randomSongs.length ? 0 : -1)
      })
      .catch((err) => setStatus(err.message))
  }

  function shuffleHistory() {
    if (currentIndex < 0) return
    const current = history[currentIndex]
    const rest = history.filter((_, index) => index !== currentIndex)
    for (let i = rest.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[rest[i], rest[j]] = [rest[j], rest[i]]
    }
    setHistory([current, ...rest])
    setCurrentIndex(0)
    setMenu(null)
  }

  function logout() {
    const nextProfiles = removeUserProfile(auth.username)
    audioRef.current?.pause()
    clearAuth()
    setUserProfiles(nextProfiles)
    if (nextProfiles.length) {
      activateUserProfile(nextProfiles[0])
      setAuth(authState())
      setMenu({ type: "user" })
      return
    }
    setAuth(authState())
    setHistory([])
    setSongs([])
    setPlaylistResults([])
    setAlbumResults([])
    setArtistResults([])
    setCurrentIndex(-1)
    setMenu(null)
  }

  function switchUser(profile) {
    if (!profile?.username) return
    audioRef.current?.pause()
    activateUserProfile(profile)
    setAuth(authState())
    setMenu(null)
  }

  function loginAnotherUser() {
    audioRef.current?.pause()
    clearAuth()
    setAuth(emptyAuthState())
    setMenu(null)
  }

  if (!auth.isAuthenticated || !canUseApi) {
    return (
      <main className="loginScreen">
        <section className="loginPanel">
          <p className="eyebrow">Tesla Navidrome</p>
          <h1>Login</h1>
          <form onSubmit={login}>
            <input name="username" autoComplete="username" placeholder="Username" />
            <div className="passwordField">
              <input
                name="password"
                autoComplete="current-password"
                placeholder="Password"
                type={showPassword ? "text" : "password"}
              />
              <button type="button" onClick={() => setShowPassword((value) => !value)} aria-label="Show password">
                {showPassword ? <EyeOff size={28} /> : <Eye size={28} />}
              </button>
            </div>
            <button type="submit">Log in</button>
          </form>
          <p className="status">{status || "Log in with a Navidrome user."}</p>
        </section>
      </main>
    )
  }

  return (
    <main className="app">
      <audio ref={audioRef} preload="auto" />
      {dragState?.song && (
        <div
          className="dragGhost"
          style={{
            left: `${Math.max(8, Math.min(dragState.x + 18, window.innerWidth - 390))}px`,
            top: `${Math.max(8, Math.min(dragState.y + 18, window.innerHeight - 90))}px`,
          }}
        >
          <strong>{dragState.song.title}</strong>
          <span>{dragState.song.artist}</span>
        </div>
      )}
      <header className="playerBar">
        <div className="transportControls">
          <button className="iconButton" type="button" onClick={previous} aria-label="Back">
            <SkipBack size={34} />
          </button>
          <button className="playButton" type="button" onClick={togglePlayback} aria-label="Play pause">
            {isPlaying ? <Pause size={40} /> : <Play size={40} />}
          </button>
          <button className="iconButton" type="button" onClick={next} aria-label="Next">
            <SkipForward size={34} />
          </button>
        </div>
        <div className="nowPlaying">
          <strong>{currentSong?.title || "Ready"}</strong>
          <span>{currentSong ? `${currentSong.artist} - ${currentSong.album}` : `Logged in as ${auth.name}`}</span>
          <input
            className="progress"
            type="range"
            min="0"
            max={Math.max(1, time.duration || currentSong?.duration || 1)}
            value={Math.min(time.current, time.duration || currentSong?.duration || 1)}
            onChange={(event) => {
              if (audioRef.current) audioRef.current.currentTime = Number(event.target.value)
            }}
          />
        </div>
        <div className="clock">
          {formatTime(time.current)} / {formatTime(time.duration || currentSong?.duration || 0)}
        </div>
      </header>

      <section className="searchBar">
        {playlistView ? (
          <button className="backToResults" type="button" onClick={closePlaylistView}>
            <ArrowLeft size={30} />
            Back
          </button>
        ) : searchMode === "search" ? (
          <div className="searchControls">
            <Search size={30} />
            <div className="searchField">
              <input
                ref={searchInputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search by title, album, artist or playlist"
              />
              {query && (
                <button type="button" onClick={() => setQuery("")} aria-label="Clear search">
                  <X size={28} />
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => {
                setQuery("")
                setSearchMode("home")
              }}
            >
              <ArrowLeft size={24} />
              Back
            </button>
          </div>
        ) : (
          <div className="quickButtons">
            <button type="button" onClick={() => setSearchMode("search")} aria-label="Search">
              <Search size={26} />
            </button>
            <button type="button" onClick={showAllAlbums}>Albums</button>
            <button type="button" onClick={showAllArtists}>Artists</button>
            <button type="button" onClick={showAllPlaylists}>Playlists</button>
          </div>
        )}
        <button className="likedButton" type="button" onClick={showLikedSongs} aria-label="Liked songs" title="Liked songs">
          <Heart size={28} />
        </button>
        <button className="randomButton" type="button" onClick={randomPlay}>
          <Shuffle size={24} />
          Random
        </button>
        <div className="userButtonSlot">
          <button className="secondaryButton userButton" type="button" onClick={() => setMenu({ type: "user" })}>
            {auth.username || auth.name}
          </button>
        </div>
      </section>

      <section className="content">
        <div className={resultTitle === "Albums" && !playlistView ? "results albumsResults" : "results"}>
          {resultTitle === "Albums" && !playlistView && (
            <div className="sectionHeader albumHeader">
              <h2>Albums</h2>
              <div className="albumPager">
                <button
                  type="button"
                  onClick={() => loadAlbumPage(Math.max(0, albumPage.offset - ALBUM_PAGE_SIZE))}
                  disabled={albumPage.offset === 0 || albumPage.loading}
                >
                  <ArrowLeft size={24} />
                  Previous
                </button>
                <button type="button" onClick={() => setMenu({ type: "albumLetters" })} disabled={albumPage.loading}>
                  A-Z
                </button>
                <button
                  type="button"
                  onClick={() => loadAlbumPage(albumPage.offset + ALBUM_PAGE_SIZE)}
                  disabled={!albumPage.hasNext || albumPage.loading}
                >
                  Next
                  <ArrowRight size={24} />
                </button>
              </div>
            </div>
          )}
          {resultTitle === "Artists" && !playlistView && (
            <div className="sectionHeader albumHeader">
              <h2>Artists</h2>
              <div className="albumPager">
                <button
                  type="button"
                  onClick={() => loadArtistPage(Math.max(0, artistPage.offset - ARTIST_PAGE_SIZE))}
                  disabled={artistPage.offset === 0 || artistPage.loading}
                >
                  <ArrowLeft size={24} />
                  Previous
                </button>
                <button type="button" onClick={() => setMenu({ type: "artistLetters" })} disabled={artistPage.loading}>
                  A-Z
                </button>
                <button
                  type="button"
                  onClick={() => loadArtistPage(artistPage.offset + ARTIST_PAGE_SIZE)}
                  disabled={!artistPage.hasNext || artistPage.loading}
                >
                  Next
                  <ArrowRight size={24} />
                </button>
              </div>
            </div>
          )}
          {!(resultTitle === "Albums" || resultTitle === "Artists") || playlistView ? (
            <button
              className="sectionHeader buttonHeader"
              type="button"
              disabled={!songs.length && !playlistResults.length && !albumResults.length && !artistResults.length}
              onClick={() => setMenu({ type: "results" })}
            >
              <h2>{resultTitle}</h2>
              {status && <span>{status}</span>}
            </button>
          ) : null}
          <div className="songList">
            {playlistResults.map((playlist) => (
              <PlaylistRow key={playlist.id} playlist={playlist} auth={auth} onSelect={() => showPlaylist(playlist)} />
            ))}
            {albumResults.map((album) => (
              <AlbumRow key={album.id} album={album} auth={auth} onSelect={() => showAlbumResult(album)} />
            ))}
            {artistResults.map((artist) => (
              <ArtistRow key={artist.id} artist={artist} onSelect={() => showArtistResult(artist)} />
            ))}
            {songs.map((song, index) => (
              <SongRow
                key={song.id}
                song={song}
                index={index}
                auth={auth}
                playlistMode={isEditablePlaylist}
                dragging={isEditablePlaylist && dragState?.type === "playlist" && dragState.fromIndex === index}
                dropPosition={
                  isEditablePlaylist && dragState?.type === "playlist" && dragState.insertIndex === index
                    ? "before"
                    : isEditablePlaylist && dragState?.type === "playlist" && dragState.insertIndex === songs.length && index === songs.length - 1
                      ? "after"
                      : ""
                }
                onPlay={() => playQueuedSongs(song)}
                onFavorite={() => toggleStar(song)}
                onMove={movePlaylistItem}
                onPointerDragStart={(event) => beginPlaylistDrag(index, event)}
                onMenu={() => {
                  setMenu({ type: isEditablePlaylist ? "playlistSong" : "song", song, index })
                  loadPlaylists()
                }}
              />
            ))}
          </div>
        </div>
      </section>

      {menu && (
        <ActionMenu
          menu={menu}
          playlists={playlists}
          newPlaylistName={newPlaylistName}
          setNewPlaylistName={setNewPlaylistName}
          onClose={() => setMenu(null)}
          onInsertAfter={() => {
            insertAfterCurrent(menu.song)
            setMenu(null)
          }}
          onAddPlaylist={(playlistId) => addSongToPlaylist(playlistId, menu.song.id)}
          onCreatePlaylist={() => createPlaylistWithSong(menu.song.id)}
          onShowAlbum={() => showAlbum(menu.song)}
          onShowArtist={() => showArtist(menu.song)}
          onRemove={() => removeFromHistory(menu.index)}
          onRemoveFromPlaylist={() => removeFromPlaylist(menu.index)}
          onClear={clearHistory}
          onRemovePast={removePastSongs}
          onRemoveFuture={removeFutureSongs}
          onShuffle={shuffleHistory}
          onPlayAllResults={playAllResults}
          onInsertAllResults={insertAllResults}
          onAppendAllResults={appendAllResults}
          onReplaceResults={replaceHistoryWithResults}
          resultTitle={resultTitle}
          onLogout={logout}
          userProfiles={userProfiles}
          currentUsername={auth.username}
          onSwitchUser={switchUser}
          onLoginAnotherUser={loginAnotherUser}
          onAddHistoryPlaylist={addHistoryToPlaylist}
          onCreateHistoryPlaylist={createPlaylistWithHistory}
          onRemoveDisliked={removeDislikedSongs}
          theme={theme}
          onThemeChange={setTheme}
          onSelectAlbumLetter={jumpToAlbumLetter}
          onSelectArtistLetter={jumpToArtistLetter}
        />
      )}
    </main>
  )
}

function longPress(callback) {
  let timer
  return (event) => {
    if (event.pointerType === "mouse" && event.button !== 0) return
    timer = window.setTimeout(callback, 550)
    const clear = () => window.clearTimeout(timer)
    event.currentTarget.addEventListener("pointerup", clear, { once: true })
    event.currentTarget.addEventListener("pointerleave", clear, { once: true })
    event.currentTarget.addEventListener("pointercancel", clear, { once: true })
  }
}

function SongRow({
  song,
  index,
  auth,
  playlistMode,
  dragging,
  dropPosition,
  onPlay,
  onFavorite,
  onMove,
  onPointerDragStart,
  onMenu,
}) {
  const coverUrl = song.coverArt ? subsonicUrl("getCoverArt", { id: song.coverArt, size: 96, square: true }, auth) : ""
  const rowClassName = [
    "songRow",
    playlistMode ? "playlistSongRow" : "",
    dragging ? "dragging" : "",
    dropPosition === "before" ? "dropBefore" : "",
    dropPosition === "after" ? "dropAfter" : "",
  ]
    .filter(Boolean)
    .join(" ")

  return (
    <article
      className={rowClassName}
      data-index={index}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault()
        const fromIndex = Number(event.dataTransfer.getData("text/plain"))
        if (Number.isFinite(fromIndex)) onMove(fromIndex, index)
      }}
    >
      {playlistMode && (
        <button
          className="dragHandle resultDragHandle"
          type="button"
          draggable
          onDragStart={(event) => {
            event.dataTransfer.setData("text/plain", String(index))
            event.dataTransfer.effectAllowed = "move"
          }}
          onPointerDown={onPointerDragStart}
          aria-label="Move playlist item"
        >
          <GripVertical size={26} />
        </button>
      )}
      <button className="coverButton" type="button" onClick={onPlay}>
        {coverUrl ? <img src={coverUrl} alt="" /> : <Play size={34} />}
      </button>
      <button className="songText" type="button" onClick={onPlay}>
        <strong>
          {song.starred && <Heart className="inlineHeart" size={20} fill="currentColor" />} {song.title}
        </strong>
        <span>{song.artist}</span>
      </button>
      <button
        className={song.starred ? "trackIconButton favoriteAction liked" : "trackIconButton favoriteAction"}
        type="button"
        onClick={onFavorite}
        aria-label={song.starred ? "Remove from favourites" : "Add to favourites"}
      >
        <Heart size={28} fill={song.starred ? "currentColor" : "none"} />
      </button>
      <button className="trackIconButton moreButton" type="button" onClick={onMenu} onPointerDown={longPress(onMenu)} aria-label="Track actions">
        <MoreVertical size={28} />
      </button>
    </article>
  )
}

function PlaylistRow({ playlist, auth, onSelect }) {
  const coverUrl = playlist.coverArt ? subsonicUrl("getCoverArt", { id: playlist.coverArt, size: 96, square: true }, auth) : ""
  return (
    <article className="songRow playlistRow">
      <button className="coverButton" type="button" onClick={onSelect}>
        {coverUrl ? <img src={coverUrl} alt="" /> : <ListMusic size={34} />}
      </button>
      <button className="songText" type="button" onClick={onSelect}>
        <strong>{playlist.name}</strong>
        <span>Playlist - {playlist.songCount} Songs</span>
      </button>
    </article>
  )
}

function AlbumRow({ album, auth, onSelect }) {
  const coverUrl = album.coverArt ? subsonicUrl("getCoverArt", { id: album.coverArt, size: 96, square: true }, auth) : ""
  return (
    <article
      className="songRow albumRow"
      data-album-id={album.id}
    >
      <button className="coverButton" type="button" onClick={onSelect}>
        {coverUrl ? <img src={coverUrl} alt="" /> : <ListMusic size={34} />}
      </button>
      <button className="songText" type="button" onClick={onSelect}>
        <strong>{album.name}</strong>
        <span>{album.artist || `${album.songCount} Songs`}</span>
      </button>
    </article>
  )
}

function ArtistRow({ artist, onSelect }) {
  return (
    <article
      className="songRow artistRow"
      data-artist-id={artist.id}
    >
      <button className="coverButton" type="button" onClick={onSelect}>
        <ListMusic size={34} />
      </button>
      <button className="songText" type="button" onClick={onSelect}>
        <strong>{artist.name}</strong>
        <span>Artists - {artist.albumCount} Albums</span>
      </button>
    </article>
  )
}

const HistoryRow = React.forwardRef(function HistoryRow(
  { song, index, active, dragging, dropPosition, onClick, onMove, onPointerDragStart, onMenu },
  ref,
) {
  const handleDragStart = (event) => {
    event.dataTransfer.setData("text/plain", String(index))
    event.dataTransfer.effectAllowed = "move"
  }
  const rowClassName = [
    "historyRow",
    active ? "active" : "",
    dragging ? "dragging" : "",
    dropPosition === "before" ? "dropBefore" : "",
    dropPosition === "after" ? "dropAfter" : "",
  ]
    .filter(Boolean)
    .join(" ")

  return (
    <article
      className={rowClassName}
      ref={ref}
      data-index={index}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault()
        const fromIndex = Number(event.dataTransfer.getData("text/plain"))
        if (Number.isFinite(fromIndex)) onMove(fromIndex, index)
      }}
    >
      <button
        className="dragHandle"
        type="button"
        draggable
        onDragStart={handleDragStart}
        onPointerDown={onPointerDragStart}
        aria-label="Verschieben"
      >
        <GripVertical size={26} />
      </button>
      <button className="historyItem" type="button" onClick={onClick}>
        <strong>{song.title}</strong>
        <span>{song.artist}</span>
      </button>
      <button className="historyMenuButton" type="button" onClick={onMenu} aria-label="History item actions">
        <MoreVertical size={28} />
      </button>
    </article>
  )
})

function ActionMenu({
  menu,
  playlists,
  newPlaylistName,
  setNewPlaylistName,
  onClose,
  onInsertAfter,
  onAddPlaylist,
  onCreatePlaylist,
  onShowAlbum,
  onShowArtist,
  onRemove,
  onRemoveFromPlaylist,
  onClear,
  onRemovePast,
  onRemoveFuture,
  onShuffle,
  onPlayAllResults,
  onInsertAllResults,
  onAppendAllResults,
  onReplaceResults,
  resultTitle,
  onLogout,
  userProfiles,
  currentUsername,
  onSwitchUser,
  onLoginAnotherUser,
  onAddHistoryPlaylist,
  onCreateHistoryPlaylist,
  onRemoveDisliked,
  theme,
  onThemeChange,
  onSelectAlbumLetter,
  onSelectArtistLetter,
}) {
  const actionSheetRef = useRef(null)
  const [hasFocusedTextInput, setHasFocusedTextInput] = useState(false)
  const isSongMenu = menu.type === "song" || menu.type === "playlistSong" || menu.type === "historySong"
  const menuTitle = isSongMenu
    ? menu.song.title
    : menu.type === "results"
      ? resultTitle
      : menu.type === "user"
        ? "Username"
        : menu.type === "albumLetters"
          ? "Jump to album letter"
          : menu.type === "artistLetters"
            ? "Jump to artist letter"
          : "History"
  const actionSheetClassName = hasFocusedTextInput ? "actionSheet inputFocused" : "actionSheet"

  function handleFocusCapture(event) {
    const tag = event.target?.tagName?.toLowerCase()
    if (tag !== "input" && tag !== "textarea") return
    setHasFocusedTextInput(true)
    window.setTimeout(() => {
      event.target?.scrollIntoView({ block: "nearest", behavior: "smooth" })
    }, 0)
  }

  function handleBlurCapture() {
    window.setTimeout(() => {
      const activeElement = document.activeElement
      const tag = activeElement?.tagName?.toLowerCase()
      const inputStillFocused =
        actionSheetRef.current?.contains(activeElement) && (tag === "input" || tag === "textarea")
      setHasFocusedTextInput(Boolean(inputStillFocused))
    }, 0)
  }

  function stopDialogEvent(event) {
    event.stopPropagation()
  }

  return (
    <div className="modalBackdrop">
      <section
        className={actionSheetClassName}
        ref={actionSheetRef}
        onClick={stopDialogEvent}
        onPointerDown={stopDialogEvent}
        onTouchStart={stopDialogEvent}
        onFocusCapture={handleFocusCapture}
        onBlurCapture={handleBlurCapture}
      >
        <header>
          <h2>{menuTitle}</h2>
          <button type="button" onClick={onClose}>Close</button>
        </header>

        {menu.type === "results" && (
          <>
            <button type="button" onClick={onPlayAllResults}>Play All</button>
            <button type="button" onClick={onInsertAllResults}>Insert All</button>
            <button type="button" onClick={onAppendAllResults}>Append All</button>
            <button type="button" onClick={onReplaceResults}>Replace History</button>
          </>
        )}

        {(menu.type === "albumLetters" || menu.type === "artistLetters") && (
          <div className="albumLetterGrid">
            {ALBUM_LETTERS.map((letter) => (
              <button
                key={letter}
                type="button"
                onClick={() =>
                  menu.type === "albumLetters" ? onSelectAlbumLetter(letter) : onSelectArtistLetter(letter)
                }
              >
                {letter}
              </button>
            ))}
          </div>
        )}

        {menu.type === "user" && (
          <>
            <div className="playlistBox userProfiles">
              <h3>Username</h3>
              <div className="playlistList">
                {userProfiles.map((profile) => (
                  <button
                    className={profile.username === currentUsername ? "selected" : ""}
                    key={profile.username}
                    type="button"
                    onClick={() => onSwitchUser(profile)}
                  >
                    {profile.name || profile.username}
                  </button>
                ))}
              </div>
            </div>
            <div className="userMenuActions">
              <div className="themeButtons">
                <button className={theme === "auto" ? "selected" : ""} type="button" onClick={() => onThemeChange("auto")}>
                  Auto
                </button>
                <button className={theme === "dark" ? "selected" : ""} type="button" onClick={() => onThemeChange("dark")}>
                  Dark
                </button>
                <button className={theme === "light" ? "selected" : ""} type="button" onClick={() => onThemeChange("light")}>
                  Light
                </button>
              </div>
              <button type="button" onClick={onLoginAnotherUser}>
                Log in
              </button>
              <button type="button" onClick={onLogout}>
                <LogOut size={28} />
                Logout
              </button>
            </div>
          </>
        )}

        {(menu.type === "song" || menu.type === "playlistSong") && (
          <>
            <button type="button" onClick={onInsertAfter}>Insert</button>
            <button type="button" onClick={onShowAlbum}>Show Album</button>
            <button type="button" onClick={onShowArtist}>Show Artist</button>
          </>
        )}

        {menu.type === "playlistSong" && (
          <button type="button" onClick={onRemoveFromPlaylist}>
            <Trash2 size={24} />
            Remove from Playlist
          </button>
        )}

        {menu.type === "historySong" && (
          <>
            <button type="button" onClick={onShowAlbum}>Show Album</button>
            <button type="button" onClick={onShowArtist}>Show Artist</button>
            <button type="button" onClick={onRemove}>
              <Trash2 size={24} />
              Remove
            </button>
          </>
        )}

        {isSongMenu && (
          <div className="playlistBox">
            <h3>Add to Playlist</h3>
            <div className="playlistList">
              {playlists.map((playlist) => (
                <button key={playlist.id} type="button" onClick={() => onAddPlaylist(playlist.id)}>
                  <ListMusic size={24} />
                  {playlist.name}
                </button>
              ))}
            </div>
            <div className="newPlaylist">
              <input value={newPlaylistName} onChange={(event) => setNewPlaylistName(event.target.value)} placeholder="New Playlist" />
              <button type="button" onClick={onCreatePlaylist}>Plus</button>
            </div>
          </div>
        )}

        {menu.type === "history" && (
          <>
            <button type="button" onClick={onClear}>Clear and fill with Random</button>
            <button type="button" onClick={onRemovePast}>Remove played songs</button>
            <button type="button" onClick={onRemoveFuture}>Remove future songs</button>
            <button type="button" onClick={onRemoveDisliked}>Remove unpopular songs</button>
            <button type="button" onClick={onShuffle}>Shuffle History</button>
            <div className="playlistBox">
              <h3>Add History to Playlist</h3>
              <div className="playlistList">
                {playlists.map((playlist) => (
                  <button key={playlist.id} type="button" onClick={() => onAddHistoryPlaylist(playlist.id)}>
                    <ListMusic size={24} />
                    {playlist.name}
                  </button>
                ))}
              </div>
              <div className="newPlaylist">
                <input value={newPlaylistName} onChange={(event) => setNewPlaylistName(event.target.value)} placeholder="New Playlist" />
                <button type="button" onClick={onCreateHistoryPlaylist}>Plus</button>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  )
}

createRoot(document.getElementById("root")).render(<App />)
