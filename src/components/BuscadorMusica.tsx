import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore'
import { getDownloadURL, ref } from 'firebase/storage'
import type { Timestamp } from 'firebase/firestore'
import { db, isFirebaseConfigured, storage } from '../firebaseClient'
import { cacheAudio, getCachedAudio } from '../audioOffline'
import type { Perfil } from '../perfiles'
import PanelPlaylists from './PanelPlaylists'

export interface Video {
  id: { videoId: string }
  audioUrl?: string
  snippet: {
    title: string
    channelTitle: string
    thumbnails: {
      default?: { url: string }
      medium?: { url: string }
      high?: { url: string }
    }
  }
}

export interface Favorito {
  id: string
  video_id: string
  titulo: string
  canal: string | null
  miniatura: string | null
  creado_en: Timestamp | null
  audio_url?: string | null
}

interface YouTubeSearchResponse {
  items?: Video[]
  error?: { message?: string }
}

interface YouTubePlayer {
  loadVideoById: (videoId: string) => void
  playVideo: () => void
  pauseVideo: () => void
  seekTo: (seconds: number, allowSeekAhead: boolean) => void
  getCurrentTime: () => number
  getDuration: () => number
  getPlayerState: () => number
  setVolume: (volume: number) => void
  mute: () => void
  unMute: () => void
  destroy: () => void
}

interface YouTubeApi {
  Player: new (
    element: HTMLElement,
    options: {
      videoId: string
      width: string
      height: string
      playerVars: Record<string, string | number>
      events: {
        onReady: (event: { target: YouTubePlayer }) => void
        onStateChange: (event: { data: number }) => void
        onError: () => void
      }
    },
  ) => YouTubePlayer
  PlayerState: {
    ENDED: number
    PLAYING: number
    PAUSED: number
  }
}

declare global {
  interface Window {
    YT?: YouTubeApi
    onYouTubeIframeAPIReady?: () => void
  }
}

interface BuscadorMusicaProps {
  perfil: Perfil
  onCambiarPerfil: () => void
}

const YOUTUBE_API_KEY = import.meta.env.VITE_YOUTUBE_API_KEY ?? ''
const generos = ['Latin pop', 'Alternative rock', 'Reggaeton', 'Lo-fi', 'Salsa']
let youtubeApiPromise: Promise<YouTubeApi> | null = null

function cargarYouTubeApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT)
  if (youtubeApiPromise) return youtubeApiPromise

  youtubeApiPromise = new Promise<YouTubeApi>((resolve, reject) => {
    const callbackAnterior = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      callbackAnterior?.()
      if (window.YT) resolve(window.YT)
      else reject(new Error('Could not start the YouTube player.'))
    }

    if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
      const script = document.createElement('script')
      script.src = 'https://www.youtube.com/iframe_api'
      script.async = true
      script.onerror = () => reject(new Error('Could not load YouTube.'))
      document.head.appendChild(script)
    }
  })

  return youtubeApiPromise
}

function miniaturaDe(video: Video) {
  return video.snippet.thumbnails.high?.url ?? video.snippet.thumbnails.medium?.url ?? video.snippet.thumbnails.default?.url ?? ''
}

function ordenarPorTipo(videos: Video[], tipo: 'audio' | 'video') {
  function puntuacion(item: Video, posicion: number) {
    const titulo = item.snippet.title.toLowerCase()
    const canal = item.snippet.channelTitle.toLowerCase()
    const relevanciaYouTube = Math.max(0, 25 - posicion)
    const esTopic = canal.endsWith(' - topic') || canal.endsWith(' topic')
    const esVevo = canal.endsWith('vevo')
    const esDirecto = titulo.includes(' live') || titulo.includes('en vivo') || titulo.includes('directo')

    if (tipo === 'audio') {
      return relevanciaYouTube
        + (titulo.includes('official audio') ? 18 : 0)
        + (esTopic ? 24 : 0)
        + (esVevo ? 14 : 0)
        + (esVevo && titulo.includes('official video') ? 8 : 0)
        + (titulo.includes('audio oficial') ? 8 : 0)
        + (titulo.includes('audio') ? 3 : 0)
        - (esDirecto ? 24 : 0)
        - (!esVevo && (titulo.includes('music video') || titulo.includes('video oficial')) ? 14 : 0)
        - (titulo.includes('cover') || titulo.includes('karaoke') ? 16 : 0)
        - (titulo.includes('reaction') || titulo.includes('reacción') ? 12 : 0)
    }

    return relevanciaYouTube
      + (titulo.includes('official music video') ? 12 : 0)
      + (titulo.includes('video oficial') ? 10 : 0)
      + (titulo.includes('official video') ? 8 : 0)
      + (esVevo ? 8 : 0)
      - (titulo.includes('official audio') || esTopic ? 6 : 0)
  }

  return videos
    .map((video, posicion) => ({ video, puntos: puntuacion(video, posicion) }))
    .sort((primero, segundo) => segundo.puntos - primero.puntos)
    .map(({ video }) => video)
}

function formatoTiempo(segundos: number) {
  if (!Number.isFinite(segundos) || segundos < 0) return '0:00'
  return `${Math.floor(segundos / 60)}:${Math.floor(segundos % 60).toString().padStart(2, '0')}`
}

function PlayIcon({ className = 'size-5' }: { className?: string }) {
  return <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true"><path d="M8.2 5.5v13a1 1 0 0 0 1.54.84l10-6.5a1 1 0 0 0 0-1.68l-10-6.5a1 1 0 0 0-1.54.84Z" /></svg>
}

function PauseIcon({ className = 'size-5' }: { className?: string }) {
  return <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true"><path d="M7 5h3.5v14H7V5Zm6.5 0H17v14h-3.5V5Z" /></svg>
}

function SkipIcon({ siguiente = false }: { siguiente?: boolean }) {
  return <svg viewBox="0 0 24 24" fill="currentColor" className={`size-5 ${siguiente ? '' : 'rotate-180'}`} aria-hidden="true"><path d="M6 5.8v12.4a1 1 0 0 0 1.55.83L16.8 13a1 1 0 0 0 0-1.66L7.55 4.97A1 1 0 0 0 6 5.8ZM18 5v14h2V5h-2Z" /></svg>
}

function SearchIcon() {
  return <svg viewBox="0 0 24 24" fill="none" className="size-5" aria-hidden="true"><circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" /><path d="m20 20-4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
}

function HeartIcon({ filled = false }: { filled?: boolean }) {
  return <svg viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} className="size-5" aria-hidden="true"><path d="M20.8 4.7a5.5 5.5 0 0 0-7.8 0l-1 1.1-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21.3l7.8-7.7 1-1.1a5.5 5.5 0 0 0 0-7.8Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
}

function LibraryIcon() {
  return <svg viewBox="0 0 24 24" fill="none" className="size-6" aria-hidden="true"><path d="M4 4v16M9 4v16M14 6l3-1 3 13-3 .7L14 6Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
}

function HomeIcon() {
  return <svg viewBox="0 0 24 24" fill="none" className="size-6" aria-hidden="true"><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1V10Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /></svg>
}

function CompassIcon() {
  return <svg viewBox="0 0 24 24" fill="none" className="size-6" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" /><path d="m15.5 8.5-2 5-5 2 2-5 5-2Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /></svg>
}

function VolumeIcon({ silenciado = false }: { silenciado?: boolean }) {
  return <svg viewBox="0 0 24 24" fill="none" className="size-5" aria-hidden="true"><path d="M5 10v4h4l4 3V7l-4 3H5Z" fill="currentColor" />{silenciado ? <path d="m17 10 4 4m0-4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /> : <path d="M16 9a4 4 0 0 1 0 6m2-8a7 7 0 0 1 0 10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />}</svg>
}

function TrashIcon() {
  return <svg viewBox="0 0 24 24" fill="none" className="size-4" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m3 0-1 14H7L6 7m4 4v6m4-6v6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
}

function RepeatIcon({ uno = false }: { uno?: boolean }) {
  return <span className="relative"><svg viewBox="0 0 24 24" fill="none" className="size-5" aria-hidden="true"><path d="m17 2 4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4m14-1v2a3 3 0 0 1-3 3H3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>{uno && <span className="absolute inset-0 grid place-items-center text-[8px] font-black">1</span>}</span>
}

function PlaylistIcon() {
  return <svg viewBox="0 0 24 24" fill="none" className="size-5" aria-hidden="true"><path d="M4 6h10M4 11h10M4 16h7m7-4v8m-4-4h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
}

export default function BuscadorMusica({ perfil, onCambiarPerfil }: BuscadorMusicaProps) {
  const playerHostRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<YouTubePlayer | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const siguienteRef = useRef<() => void>(() => undefined)
  const volumenRef = useRef(80)
  const silenciadoRef = useRef(false)
  const modoBucleRef = useRef<'off' | 'all' | 'one'>('off')
  const videoActualRef = useRef<Video | null>(null)
  const [consulta, setConsulta] = useState('')
  const [resultados, setResultados] = useState<Video[]>([])
  const [videoActual, setVideoActual] = useState<Video | null>(null)
  const [colaReproduccion, setColaReproduccion] = useState<Video[]>([])
  const [nombreCola, setNombreCola] = useState('')
  const [favoritos, setFavoritos] = useState<Favorito[]>([])
  const [reproduciendo, setReproduciendo] = useState(false)
  const [tiempoActual, setTiempoActual] = useState(0)
  const [duracion, setDuracion] = useState(0)
  const [volumen, setVolumen] = useState(80)
  const [silenciado, setSilenciado] = useState(false)
  const [modoBucle, setModoBucle] = useState<'off' | 'all' | 'one'>('off')
  const [tipoBusqueda, setTipoBusqueda] = useState<'audio' | 'video'>('audio')
  const [mostrarPlaylists, setMostrarPlaylists] = useState(false)
  const [videoParaPlaylist, setVideoParaPlaylist] = useState<Video | null>(null)
  const [buscando, setBuscando] = useState(false)
  const [guardandoId, setGuardandoId] = useState<string | null>(null)
  const [cargandoFavoritos, setCargandoFavoritos] = useState(isFirebaseConfigured)
  const [errorBusqueda, setErrorBusqueda] = useState('')
  const [mensajeBiblioteca, setMensajeBiblioteca] = useState('')
  const [descargandoAudio, setDescargandoAudio] = useState(false)

  async function prepararAudio(video: Video) {
    if (video.audioUrl) return video
    const cacheado = await getCachedAudio(video.id.videoId).catch(() => null)
    if (cacheado) return { ...video, audioUrl: cacheado }
    if (!storage) return video
    try {
      const url = await getDownloadURL(ref(storage, `audio/${video.id.videoId}.mp3`))
      return { ...video, audioUrl: url }
    } catch {
      return video
    }
  }

  useEffect(() => {
    if (!db) return
    const favoritosQuery = query(collection(db, 'perfiles', perfil.id, 'favoritos'), orderBy('creado_en', 'desc'))
    return onSnapshot(favoritosQuery, (snapshot) => {
      const canciones = snapshot.docs.map((documento) => ({ id: documento.id, ...(documento.data() as Omit<Favorito, 'id'>) })).filter((favorito) => Boolean(favorito.video_id))
      setFavoritos(canciones)
      void Promise.all(canciones.filter((cancion) => cancion.audio_url).map((cancion) => cacheAudio(cancion.video_id, cancion.audio_url as string).catch(() => undefined)))
      setCargandoFavoritos(false)
    }, (error) => {
      setMensajeBiblioteca(`Could not open the library: ${error.message}`)
      setCargandoFavoritos(false)
    })
  }, [perfil.id])

  useEffect(() => {
    if (!videoActual || !playerHostRef.current) return
    let cancelado = false

    if (videoActual.audioUrl) {
      if (playerRef.current) {
        playerRef.current.destroy()
        playerRef.current = null
      }
      const audio = audioRef.current
      if (!audio) return
      audio.src = videoActual.audioUrl
      audio.volume = silenciadoRef.current ? 0 : volumenRef.current / 100
      audio.onplay = () => setReproduciendo(true)
      audio.onpause = () => setReproduciendo(false)
      audio.ontimeupdate = () => setTiempoActual(audio.currentTime)
      audio.onloadedmetadata = () => setDuracion(audio.duration)
      audio.onended = () => { if (modoBucleRef.current === 'one') { audio.currentTime = 0; void audio.play() } else siguienteRef.current() }
      void audio.play().catch(() => setErrorBusqueda('Tap play to start the offline song.'))
      return () => { audio.pause(); audio.removeAttribute('src'); audio.load() }
    }

    void cargarYouTubeApi().then((YT) => {
      if (cancelado || !playerHostRef.current) return
      if (playerRef.current) {
        playerRef.current.loadVideoById(videoActual.id.videoId)
        setTiempoActual(0)
        return
      }

      playerRef.current = new YT.Player(playerHostRef.current, {
        videoId: videoActual.id.videoId,
        width: '100%',
        height: '100%',
        playerVars: {
          autoplay: 1,
          controls: 0,
          disablekb: 1,
          playsinline: 1,
          rel: 0,
          fs: 0,
          origin: window.location.origin,
        },
        events: {
          onReady: ({ target }) => {
            target.setVolume(volumenRef.current)
            target.playVideo()
          },
          onStateChange: ({ data }) => {
            setReproduciendo(data === YT.PlayerState.PLAYING)
            if (data === YT.PlayerState.ENDED) {
              if (modoBucleRef.current === 'one' && videoActualRef.current) {
                playerRef.current?.loadVideoById(videoActualRef.current.id.videoId)
              } else {
                siguienteRef.current()
              }
            }
          },
          onError: () => setErrorBusqueda('YouTube does not allow this video to be played here.'),
        },
      })
    }).catch((error) => setErrorBusqueda(error instanceof Error ? error.message : 'Could not load YouTube.'))

    return () => { cancelado = true }
  }, [videoActual])

  useEffect(() => {
    const interval = window.setInterval(() => {
      const player = playerRef.current
      const audio = audioRef.current
      if (audio && videoActualRef.current?.audioUrl) {
        setTiempoActual(audio.currentTime || 0)
        setDuracion(audio.duration || 0)
        return
      }
      if (!player || typeof player.getCurrentTime !== 'function') return
      setTiempoActual(player.getCurrentTime() || 0)
      setDuracion(player.getDuration() || 0)
    }, 500)
    return () => window.clearInterval(interval)
  }, [])

  useEffect(() => {
    return () => {
      if (typeof playerRef.current?.destroy === 'function') playerRef.current.destroy()
      playerRef.current = null
      audioRef.current?.pause()
    }
  }, [])

  useEffect(() => {
    volumenRef.current = volumen
    silenciadoRef.current = silenciado
    if (!playerRef.current) return
    playerRef.current.setVolume(volumen)
    if (silenciado) playerRef.current.mute()
    else playerRef.current.unMute()
  }, [volumen, silenciado])

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = silenciado ? 0 : volumen / 100
  }, [volumen, silenciado])

  useEffect(() => {
    if (!videoActual || !('mediaSession' in navigator) || !videoActual.audioUrl) return
    navigator.mediaSession.metadata = new MediaMetadata({
      title: videoActual.snippet.title,
      artist: videoActual.snippet.channelTitle,
      artwork: [{ src: miniaturaDe(videoActual) }],
    })
    navigator.mediaSession.setActionHandler('play', () => { void audioRef.current?.play() })
    navigator.mediaSession.setActionHandler('pause', () => audioRef.current?.pause())
    navigator.mediaSession.setActionHandler('nexttrack', () => moverVideo(1))
    navigator.mediaSession.setActionHandler('previoustrack', () => moverVideo(-1))
  }, [videoActual])

  useEffect(() => {
    modoBucleRef.current = modoBucle
    videoActualRef.current = videoActual
  }, [modoBucle, videoActual])

  async function buscar(termino: string, tipo: 'audio' | 'video' = tipoBusqueda) {
    const busqueda = termino.trim()
    if (!busqueda) return
    setBuscando(true)
    setErrorBusqueda('')

    try {
      const consultas = tipo === 'audio'
        ? [busqueda, `${busqueda} official audio`]
        : [`${busqueda} official music video`]
      const lotes = await Promise.all(consultas.map(async (consultaYouTube) => {
        const parametros = new URLSearchParams({
          part: 'snippet',
          maxResults: '25',
          q: consultaYouTube,
          type: 'video',
          videoCategoryId: '10',
          videoEmbeddable: 'true',
          key: YOUTUBE_API_KEY,
        })
        const respuesta = await fetch(`https://www.googleapis.com/youtube/v3/search?${parametros.toString()}`)
        const datos = (await respuesta.json()) as YouTubeSearchResponse
        if (!respuesta.ok) throw new Error(datos.error?.message ?? 'Search is currently unavailable.')
        return datos.items ?? []
      }))
      const videosUnicos = new Map<string, Video>()
      lotes.flat().forEach((video) => videosUnicos.set(video.id.videoId, video))
      const videos = ordenarPorTipo([...videosUnicos.values()], tipo).slice(0, 24)
      setResultados(videos)
      if (videos.length === 0) setErrorBusqueda('No songs were found for this search.')
    } catch (error) {
      setResultados([])
      setErrorBusqueda(error instanceof Error ? error.message : 'Could not search for music.')
    } finally {
      setBuscando(false)
    }
  }

  function enviarBusqueda(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void buscar(consulta)
  }

  function buscarGenero(genero: string) {
    setConsulta(genero)
    void buscar(genero)
  }

  function cambiarTipoBusqueda(tipo: 'audio' | 'video') {
    setTipoBusqueda(tipo)
    if (consulta.trim()) void buscar(consulta, tipo)
  }

  function favoritoComoVideo(favorito: Favorito): Video {
    return { id: { videoId: favorito.video_id }, audioUrl: favorito.audio_url ?? undefined, snippet: { title: favorito.titulo, channelTitle: favorito.canal ?? 'Unknown channel', thumbnails: favorito.miniatura ? { high: { url: favorito.miniatura } } : {} } }
  }

  function seleccionarVideo(video: Video, nuevaCola?: Video[], nuevoNombreCola?: string) {
    if (nuevaCola) {
      setColaReproduccion(nuevaCola)
      setNombreCola(nuevoNombreCola ?? 'Queue')
    }
    if (videoActual?.id.videoId === video.id.videoId) {
      alternarReproduccion()
      return
    }
    void prepararAudio(video).then((videoConAudio) => setVideoActual(videoConAudio))
  }

  function seleccionarResultado(video: Video) {
    seleccionarVideo(video, resultados, tipoBusqueda === 'audio' ? 'Original songs' : 'Music videos')
  }

  function seleccionarDesdeBiblioteca(favorito: Favorito) {
    seleccionarVideo(favoritoComoVideo(favorito), favoritos.map(favoritoComoVideo), 'Your library')
  }

  function reproducirCola(videos: Video[], indice: number, nombre: string) {
    const video = videos[indice]
    if (!video) return
    setColaReproduccion(videos)
    setNombreCola(nombre)
    setVideoActual(video)
    if (videoActual?.id.videoId === video.id.videoId) playerRef.current?.playVideo()
  }

  function alternarReproduccion() {
    if (videoActual?.audioUrl && audioRef.current) {
      if (audioRef.current.paused) void audioRef.current.play()
      else audioRef.current.pause()
      return
    }
    if (!playerRef.current) return
    if (playerRef.current.getPlayerState() === window.YT?.PlayerState.PLAYING) playerRef.current.pauseVideo()
    else playerRef.current.playVideo()
  }

  function moverVideo(direccion: -1 | 1) {
    const lista = colaReproduccion.length > 0 ? colaReproduccion : resultados.length > 0 ? resultados : favoritos.map(favoritoComoVideo)
    if (lista.length === 0) return
    const indice = videoActual ? lista.findIndex((video) => video.id.videoId === videoActual.id.videoId) : -1
    if (indice < 0) {
      setVideoActual(lista[0])
      return
    }
    const siguienteIndice = indice + direccion
    if (siguienteIndice < 0 || siguienteIndice >= lista.length) {
      if (modoBucle === 'all') setVideoActual(lista[(siguienteIndice + lista.length) % lista.length])
      return
    }
    setVideoActual(lista[siguienteIndice])
  }
  siguienteRef.current = () => moverVideo(1)

  function cambiarModoBucle() {
    setModoBucle((actual) => actual === 'off' ? 'all' : actual === 'all' ? 'one' : 'off')
  }

  function cambiarProgreso(valor: number) {
    if (videoActual?.audioUrl && audioRef.current) {
      audioRef.current.currentTime = valor
      setTiempoActual(valor)
      return
    }
    playerRef.current?.seekTo(valor, true)
    setTiempoActual(valor)
  }

  async function alternarFavorito(video: Video) {
    if (!db) return
    const guardado = favoritos.some((favorito) => favorito.video_id === video.id.videoId)
    setGuardandoId(video.id.videoId)
    setMensajeBiblioteca('')
    try {
      const referencia = doc(db, 'perfiles', perfil.id, 'favoritos', video.id.videoId)
      if (guardado) {
        await deleteDoc(referencia)
        setMensajeBiblioteca('Song removed from your library.')
      } else {
        await setDoc(referencia, { video_id: video.id.videoId, titulo: video.snippet.title, canal: video.snippet.channelTitle, miniatura: miniaturaDe(video) || null, audio_url: video.audioUrl ?? null, creado_en: serverTimestamp() })
        setMensajeBiblioteca('Song added to your library.')
      }
    } catch (error) {
      setMensajeBiblioteca(error instanceof Error ? `Could not update: ${error.message}` : 'Could not update the library.')
    } finally {
      setGuardandoId(null)
    }
  }

  async function descargarAudioActual() {
    if (!videoActual) return
    setDescargandoAudio(true)
    try {
      const audio = await prepararAudio(videoActual)
      if (!audio.audioUrl) throw new Error('Upload this song to Firebase Storage first: audio/{videoId}.mp3')
      await cacheAudio(videoActual.id.videoId, audio.audioUrl)
      setMensajeBiblioteca('Song downloaded for offline playback.')
    } catch (error) {
      setMensajeBiblioteca(error instanceof Error ? error.message : 'Could not download this song.')
    } finally {
      setDescargandoAudio(false)
    }
  }

  async function eliminarFavorito(favorito: Favorito) {
    if (!db) return
    setGuardandoId(favorito.video_id)
    try { await deleteDoc(doc(db, 'perfiles', perfil.id, 'favoritos', favorito.id)) }
    finally { setGuardandoId(null) }
  }

  function abrirPlaylists(video?: Video) {
    setVideoParaPlaylist(video ?? null)
    setMostrarPlaylists(true)
  }

  function cerrarPlaylists() {
    setMostrarPlaylists(false)
    setVideoParaPlaylist(null)
  }

  const videoGuardado = Boolean(videoActual && favoritos.some((favorito) => favorito.video_id === videoActual.id.videoId))
  const indiceColaActual = videoActual ? colaReproduccion.findIndex((video) => video.id.videoId === videoActual.id.videoId) : -1

  return (
    <div className="min-h-screen bg-[#030303] text-white selection:bg-red-500/30">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-white/10 bg-[#030303] px-4 py-5 lg:flex">
        <div className="flex items-center gap-3 px-3"><span className="grid size-9 place-items-center rounded-full bg-red-600 shadow-lg shadow-red-600/20"><PlayIcon /></span><span className="text-xl font-black tracking-tight">SONORA</span></div>
        <nav className="mt-10 space-y-2"><button type="button" className="flex w-full items-center gap-4 rounded-lg bg-white/10 px-4 py-3 text-sm font-semibold"><HomeIcon /> Home</button><button type="button" onClick={() => document.getElementById('resultados')?.scrollIntoView({ behavior: 'smooth' })} className="flex w-full items-center gap-4 rounded-lg px-4 py-3 text-sm font-medium text-zinc-400 hover:bg-white/5 hover:text-white"><CompassIcon /> Explore</button><button type="button" onClick={() => document.getElementById('biblioteca')?.scrollIntoView({ behavior: 'smooth' })} className="flex w-full items-center gap-4 rounded-lg px-4 py-3 text-sm font-medium text-zinc-400 hover:bg-white/5 hover:text-white"><LibraryIcon /> Library</button><button type="button" onClick={() => abrirPlaylists()} className="flex w-full items-center gap-4 rounded-lg px-4 py-3 text-sm font-medium text-zinc-400 hover:bg-white/5 hover:text-white"><PlaylistIcon /> Playlists</button></nav>
        <div className="mt-8 border-t border-white/10 pt-6"><p className="px-4 text-[11px] font-bold uppercase tracking-[0.2em] text-zinc-500">Discover</p><div className="mt-3 space-y-1">{generos.slice(0, 4).map((genero) => <button key={genero} type="button" onClick={() => buscarGenero(genero)} className="block w-full rounded-lg px-4 py-2 text-left text-sm text-zinc-400 hover:bg-white/5 hover:text-white">{genero}</button>)}</div></div>
        <div className="mt-auto rounded-xl border border-white/10 bg-white/[0.04] p-4"><div className="flex items-center gap-3"><span className={`grid size-9 place-items-center rounded-lg bg-gradient-to-br ${perfil.degradado} text-sm font-black`}>{perfil.inicial}</span><div><p className="text-sm font-semibold">{perfil.nombre}</p><p className="text-xs text-zinc-500">Active profile</p></div></div><button type="button" onClick={onCambiarPerfil} className="mt-3 text-xs font-bold text-red-400 hover:text-red-300">Switch profile</button></div>
      </aside>

      <div className="lg:pl-60">
        <header className="sticky top-0 z-30 border-b border-white/10 bg-[#030303]/90 backdrop-blur-xl"><div className="mx-auto flex h-20 max-w-[1600px] items-center gap-3 px-4 sm:px-6 xl:px-8"><div className="flex shrink-0 items-center gap-2 lg:hidden"><span className="grid size-8 place-items-center rounded-full bg-red-600"><PlayIcon className="size-4" /></span><span className="hidden font-black sm:block">SONORA</span></div><form onSubmit={enviarBusqueda} className="mx-auto w-full max-w-2xl"><label className="relative block"><span className="sr-only">Search music</span><span className="pointer-events-none absolute inset-y-0 left-5 flex items-center text-zinc-400"><SearchIcon /></span><input type="search" value={consulta} onChange={(event) => setConsulta(event.target.value)} placeholder="Search songs or artists" className="h-12 w-full rounded-full border border-white/15 bg-white/[0.08] pr-14 pl-13 text-sm outline-none placeholder:text-zinc-500 focus:border-white/30 focus:bg-[#171717]" /><button type="submit" disabled={buscando || !consulta.trim()} aria-label="Search" className="absolute inset-y-1.5 right-1.5 grid aspect-square place-items-center rounded-full bg-white text-black disabled:opacity-40">{buscando ? <span className="size-4 animate-spin rounded-full border-2 border-zinc-400 border-t-black" /> : <SearchIcon />}</button></label></form><button type="button" onClick={() => abrirPlaylists()} title="Open playlists" className="flex h-10 shrink-0 items-center gap-2 rounded-full border border-white/10 px-3 text-zinc-300 transition hover:bg-white/10 hover:text-white"><PlaylistIcon /><span className="hidden text-xs font-bold sm:block">Playlists</span></button><button type="button" onClick={onCambiarPerfil} aria-label="Switch profile" className={`grid size-10 shrink-0 place-items-center rounded-full bg-gradient-to-br ${perfil.degradado} text-sm font-bold`}>{perfil.inicial}</button></div></header>

        <div className={`mx-auto max-w-[1600px] px-4 py-6 sm:px-6 xl:px-8 ${videoActual ? 'pb-32' : 'pb-12'}`}>
          <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_340px]">
            <main className="min-w-0">
              {videoActual ? (
                <section className="overflow-hidden rounded-3xl border border-white/10 bg-zinc-950 shadow-2xl shadow-black/50">
                  <div className="bg-black p-2 sm:p-3">
                    <div className="aspect-video min-h-[200px] w-full overflow-hidden rounded-2xl bg-black"><div ref={playerHostRef} className={`h-full w-full ${videoActual.audioUrl ? 'hidden' : ''}`} /><div className={`grid h-full place-items-center bg-gradient-to-br from-zinc-900 to-black ${videoActual.audioUrl ? '' : 'hidden'}`}><img src={miniaturaDe(videoActual)} alt="" className="h-full w-full object-cover opacity-80" /><audio ref={audioRef} className="hidden" /></div></div>
                  </div>
                  <div className="p-5 sm:p-7">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-red-500">{videoActual.audioUrl ? 'Offline-ready audio' : 'Playing on YouTube'}</p>
                          <h1 className="mt-2 line-clamp-2 text-xl font-black tracking-tight sm:text-2xl">{videoActual.snippet.title}</h1>
                          <p className="mt-1 truncate text-sm text-zinc-400">{videoActual.snippet.channelTitle}</p>
                          {colaReproduccion.length > 0 && <p className="mt-2 text-[11px] font-medium text-zinc-500">{nombreCola} · {indiceColaActual + 1} of {colaReproduccion.length}</p>}
                        </div>
                        <button type="button" onClick={() => void alternarFavorito(videoActual)} disabled={!isFirebaseConfigured || guardandoId === videoActual.id.videoId} aria-label={videoGuardado ? 'Remove from library' : 'Save to library'} className={`grid size-11 shrink-0 place-items-center rounded-full border border-white/15 transition hover:bg-white/10 disabled:opacity-30 ${videoGuardado ? 'text-red-500' : 'text-zinc-300'}`}><HeartIcon filled={videoGuardado} /></button>
                      </div>

                      <div className="mt-5 flex items-center gap-3 text-xs text-zinc-500"><span className="w-9 text-right">{formatoTiempo(tiempoActual)}</span><input aria-label="Playback progress" type="range" min="0" max={duracion || 0} step="1" value={Math.min(tiempoActual, duracion || 0)} onChange={(event) => cambiarProgreso(Number(event.target.value))} className="h-1 flex-1 accent-red-600" /><span className="w-9">{formatoTiempo(duracion)}</span></div>

                      <div className="mt-4 flex items-center justify-center gap-2 sm:gap-4">
                        <button type="button" onClick={cambiarModoBucle} title={modoBucle === 'off' ? 'Repeat off' : modoBucle === 'all' ? 'Repeat queue' : 'Repeat one'} aria-label={modoBucle === 'off' ? 'Turn repeat on' : modoBucle === 'all' ? 'Repeat queue; change to repeat one' : 'Repeat one; turn repeat off'} className={`grid size-10 place-items-center rounded-full transition hover:bg-white/10 ${modoBucle === 'off' ? 'text-zinc-500' : 'text-red-500'}`}><RepeatIcon uno={modoBucle === 'one'} /></button>
                        <button type="button" onClick={() => moverVideo(-1)} aria-label="Previous" className="grid size-10 place-items-center rounded-full text-zinc-300 transition hover:bg-white/10 hover:text-white"><SkipIcon /></button>
                        <button type="button" onClick={alternarReproduccion} aria-label={reproduciendo ? 'Pause' : 'Play'} className="grid size-14 place-items-center rounded-full bg-white text-black shadow-lg transition hover:scale-105">{reproduciendo ? <PauseIcon className="size-6" /> : <PlayIcon className="ml-1 size-7" />}</button>
                        <button type="button" onClick={() => moverVideo(1)} aria-label="Next" className="grid size-10 place-items-center rounded-full text-zinc-300 transition hover:bg-white/10 hover:text-white"><SkipIcon siguiente /></button>
                        <button type="button" onClick={() => abrirPlaylists(videoActual)} title="Add to a playlist" aria-label="Add to a playlist" className="grid size-10 place-items-center rounded-full text-zinc-400 transition hover:bg-white/10 hover:text-white"><PlaylistIcon /></button>
                      </div>

                      <div className="mt-4 flex items-center justify-between gap-4 border-t border-white/10 pt-4">
                        <div className="flex items-center gap-3"><span className="text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-600">{videoActual.audioUrl ? 'Firebase audio' : 'YouTube source'}</span>{videoActual.audioUrl && <button type="button" onClick={() => void descargarAudioActual()} disabled={descargandoAudio} className="rounded-full border border-white/10 px-3 py-1.5 text-[10px] font-bold text-zinc-300 hover:bg-white/10 disabled:opacity-50">{descargandoAudio ? 'Downloading…' : 'Download offline'}</button>}</div>
                        <div className="flex items-center gap-2"><button type="button" onClick={() => setSilenciado((actual) => !actual)} aria-label={silenciado ? 'Unmute' : 'Mute'} className="text-zinc-400 hover:text-white"><VolumeIcon silenciado={silenciado} /></button><input aria-label="Volume" type="range" min="0" max="100" value={silenciado ? 0 : volumen} onChange={(event) => { setVolumen(Number(event.target.value)); setSilenciado(false) }} className="h-1 w-20 accent-white sm:w-24" /></div>
                      </div>
                      {indiceColaActual >= 0 && indiceColaActual < colaReproduccion.length - 1 && <div className="mt-4 border-t border-white/10 pt-4">
                        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-600">Up next</p>
                        <div className="mt-2 space-y-1">{colaReproduccion.slice(indiceColaActual + 1, indiceColaActual + 4).map((video, desplazamiento) => <button key={`${video.id.videoId}-${desplazamiento}`} type="button" onClick={() => seleccionarVideo(video)} className="flex w-full items-center gap-3 rounded-lg p-2 text-left transition hover:bg-white/[0.06]"><span className="w-5 text-center text-xs text-zinc-600">{indiceColaActual + desplazamiento + 2}</span><img src={miniaturaDe(video)} alt="" className="size-9 rounded object-cover" /><span className="min-w-0"><span className="block truncate text-xs font-semibold text-zinc-200">{video.snippet.title}</span><span className="block truncate text-[10px] text-zinc-600">{video.snippet.channelTitle}</span></span></button>)}</div>
                      </div>}
                  </div>
                </section>
              ) : (
                <section className="relative min-h-[350px] overflow-hidden rounded-2xl border border-white/10 bg-[radial-gradient(circle_at_75%_30%,rgba(220,38,38,0.5),transparent_28%),radial-gradient(circle_at_65%_70%,rgba(147,51,234,0.35),transparent_30%),linear-gradient(135deg,#27272a,#09090b_70%)] p-7 sm:p-10"><div className="relative z-10 flex min-h-[280px] max-w-xl flex-col justify-center"><p className="text-xs font-bold uppercase tracking-[0.25em] text-red-400">Music on YouTube</p><h1 className="mt-4 text-4xl font-black leading-[0.95] tracking-[-0.04em] sm:text-6xl">Find your next song.</h1><p className="mt-5 max-w-md text-sm leading-relaxed text-zinc-300 sm:text-base">Search, play, and control your music with Sonora.</p><button type="button" onClick={() => buscarGenero('Music hits 2026')} className="mt-7 flex w-fit items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-bold text-black"><PlayIcon /> Explore music</button></div></section>
              )}

              <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.035] p-4 sm:flex sm:items-center sm:justify-between sm:gap-5">
                <div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Result type</p><p className="mt-1 text-sm text-zinc-300">Choose between the original recording and its music video.</p></div>
                <div className="mt-4 grid grid-cols-2 rounded-xl bg-black/40 p-1 sm:mt-0 sm:min-w-80">
                  <button type="button" onClick={() => cambiarTipoBusqueda('audio')} className={`rounded-lg px-4 py-2.5 text-xs font-bold transition ${tipoBusqueda === 'audio' ? 'bg-red-600 text-white shadow-lg shadow-red-950/40' : 'text-zinc-400 hover:text-white'}`}>Original songs</button>
                  <button type="button" onClick={() => cambiarTipoBusqueda('video')} className={`rounded-lg px-4 py-2.5 text-xs font-bold transition ${tipoBusqueda === 'video' ? 'bg-red-600 text-white shadow-lg shadow-red-950/40' : 'text-zinc-400 hover:text-white'}`}>Music videos</button>
                </div>
              </div>

              <div className="mt-4 flex gap-2 overflow-x-auto pb-1">{generos.map((genero) => <button key={genero} type="button" onClick={() => buscarGenero(genero)} className="shrink-0 rounded-lg border border-white/10 bg-white/[0.06] px-4 py-2 text-sm font-medium text-zinc-300 hover:bg-white/15">{genero}</button>)}</div>
              {errorBusqueda && <p role="alert" className="mt-6 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">{errorBusqueda}</p>}

              <section id="resultados" className="mt-10 scroll-mt-28"><div className="mb-5 flex items-end justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-zinc-500">{resultados.length > 0 ? (tipoBusqueda === 'audio' ? 'Official recordings' : 'Official music videos') : 'Start exploring'}</p><h2 className="mt-1 text-2xl font-black">{resultados.length > 0 ? (tipoBusqueda === 'audio' ? 'Original songs' : 'Music videos') : 'Choose a genre'}</h2></div>{resultados.length > 0 && <span className="text-xs text-zinc-500">{resultados.length} results</span>}</div>
                {resultados.length > 0 ? <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 2xl:grid-cols-4">{resultados.map((video, indice) => { const guardado = favoritos.some((favorito) => favorito.video_id === video.id.videoId); const activo = videoActual?.id.videoId === video.id.videoId; return <article key={`${video.id.videoId}-${indice}`} className="group min-w-0"><button type="button" onClick={() => seleccionarResultado(video)} className={`relative block aspect-square w-full overflow-hidden rounded-xl bg-zinc-900 shadow-lg ring-offset-2 ring-offset-black ${activo ? 'ring-2 ring-red-500' : ''}`}><img src={miniaturaDe(video)} alt={`Cover art for ${video.snippet.title}`} className="h-full w-full object-cover transition duration-300 group-hover:scale-105 group-hover:brightness-75" />{indice === 0 && <span className="absolute top-3 left-3 rounded-full border border-white/10 bg-black/80 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.12em] text-white backdrop-blur">Best match</span>}<span className="absolute right-3 bottom-3 grid size-12 place-items-center rounded-full bg-white text-black opacity-0 shadow-xl transition group-hover:opacity-100">{activo && reproduciendo ? <PauseIcon className="size-6" /> : <PlayIcon className="size-6" />}</span></button><div className="mt-3 flex items-start gap-1"><button type="button" onClick={() => seleccionarResultado(video)} className="min-w-0 flex-1 text-left"><h3 className="line-clamp-2 text-sm font-semibold">{video.snippet.title}</h3><p className="mt-1 truncate text-xs text-zinc-500">{video.snippet.channelTitle}</p></button><button type="button" onClick={() => abrirPlaylists(video)} aria-label={`Add ${video.snippet.title} to a playlist`} className="grid size-8 shrink-0 place-items-center rounded-full text-zinc-400 transition hover:bg-white/10 hover:text-white"><PlaylistIcon /></button><button type="button" onClick={() => void alternarFavorito(video)} disabled={!isFirebaseConfigured || guardandoId === video.id.videoId} aria-label={guardado ? 'Remove from library' : 'Save to library'} className={`grid size-8 shrink-0 place-items-center rounded-full disabled:opacity-30 ${guardado ? 'text-red-500' : 'text-zinc-400'}`}><HeartIcon filled={guardado} /></button></div></article> })}</div> : <div className="grid gap-3 sm:grid-cols-2">{generos.slice(0, 4).map((genero, indice) => <button key={genero} type="button" onClick={() => buscarGenero(genero)} className={`h-28 rounded-xl p-5 text-left ${['bg-gradient-to-r from-rose-800 to-red-950','bg-gradient-to-r from-indigo-800 to-violet-950','bg-gradient-to-r from-amber-700 to-orange-950','bg-gradient-to-r from-cyan-800 to-slate-950'][indice]}`}><span className="text-lg font-black">{genero}</span></button>)}</div>}
              </section>
            </main>

            <aside id="biblioteca" className="self-start rounded-2xl border border-white/10 bg-white/[0.035] xl:sticky xl:top-28"><div className="flex items-center justify-between border-b border-white/10 px-5 py-4"><div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-red-500">Collection</p><h2 className="mt-1 text-lg font-bold">Your library</h2></div><span className="rounded-full bg-white/10 px-2.5 py-1 text-xs">{favoritos.length}</span></div><div className="max-h-[62vh] min-h-64 overflow-y-auto p-2">{cargandoFavoritos && <div className="grid min-h-48 place-items-center"><span className="size-6 animate-spin rounded-full border-2 border-zinc-700 border-t-white" /></div>}{isFirebaseConfigured && !cargandoFavoritos && favoritos.length === 0 && <div className="flex min-h-56 flex-col items-center justify-center text-center"><LibraryIcon /><p className="mt-4 text-sm font-semibold">Your library is empty</p></div>}<div className="space-y-1">{favoritos.map((favorito, indice) => <div key={favorito.id} className="group flex items-center gap-3 rounded-lg p-2 hover:bg-white/[0.07]"><span className="w-5 text-center text-xs text-zinc-600">{indice + 1}</span><button type="button" onClick={() => seleccionarDesdeBiblioteca(favorito)} aria-label={`Open ${favorito.titulo}`} className="size-11 shrink-0 overflow-hidden rounded bg-zinc-800">{favorito.miniatura ? <img src={favorito.miniatura} alt="" className="h-full w-full object-cover" /> : <PlayIcon />}</button><button type="button" onClick={() => seleccionarDesdeBiblioteca(favorito)} className="min-w-0 flex-1 text-left"><span className="block truncate text-sm font-medium">{favorito.titulo}</span><span className="block truncate text-xs text-zinc-500">{favorito.canal}</span></button><button type="button" onClick={() => void eliminarFavorito(favorito)} disabled={guardandoId === favorito.video_id} aria-label={`Remove ${favorito.titulo} from library`} className="grid size-8 place-items-center rounded-full text-zinc-500 opacity-0 group-hover:opacity-100"><TrashIcon /></button></div>)}</div></div>{mensajeBiblioteca && <p className="border-t border-white/10 px-5 py-3 text-xs text-zinc-400">{mensajeBiblioteca}</p>}</aside>
          </div>
        </div>

        {videoActual && <div className="fixed inset-x-0 bottom-0 z-50 border-t border-white/10 bg-[#161616]/95 backdrop-blur-xl lg:left-60"><div className="mx-auto flex h-24 max-w-[1600px] items-center gap-3 px-4 sm:gap-4 sm:px-6 xl:px-8"><img src={miniaturaDe(videoActual)} alt="" className="size-14 rounded-lg object-cover sm:size-16" /><div className="min-w-0 flex-1 sm:max-w-64"><p className="truncate text-sm font-semibold">{videoActual.snippet.title}</p><p className="truncate text-xs text-zinc-500">{videoActual.snippet.channelTitle}</p></div><button type="button" onClick={cambiarModoBucle} title={modoBucle === 'off' ? 'Repeat off' : modoBucle === 'all' ? 'Repeat queue' : 'Repeat one'} aria-label="Change repeat mode" className={`hidden size-9 place-items-center rounded-full sm:grid ${modoBucle === 'off' ? 'text-zinc-500' : 'text-red-500'}`}><RepeatIcon uno={modoBucle === 'one'} /></button><div className="flex items-center"><button type="button" onClick={() => moverVideo(-1)} aria-label="Previous" className="grid size-9 place-items-center"><SkipIcon /></button><button type="button" onClick={alternarReproduccion} aria-label={reproduciendo ? 'Pause' : 'Play'} className="grid size-11 place-items-center rounded-full bg-white text-black">{reproduciendo ? <PauseIcon /> : <PlayIcon />}</button><button type="button" onClick={() => moverVideo(1)} aria-label="Next" className="grid size-9 place-items-center"><SkipIcon siguiente /></button></div><div className="hidden flex-1 items-center gap-2 md:flex"><span className="w-9 text-right text-[10px] text-zinc-500">{formatoTiempo(tiempoActual)}</span><input aria-label="Playback progress" type="range" min="0" max={duracion || 0} value={Math.min(tiempoActual, duracion || 0)} onChange={(event) => cambiarProgreso(Number(event.target.value))} className="h-1 flex-1 accent-red-600" /><span className="w-9 text-[10px] text-zinc-500">{formatoTiempo(duracion)}</span></div><button type="button" onClick={() => abrirPlaylists(videoActual)} aria-label="Add to playlist" className="hidden text-zinc-400 hover:text-white sm:block"><PlaylistIcon /></button><button type="button" onClick={() => void alternarFavorito(videoActual)} aria-label={videoGuardado ? 'Remove from library' : 'Save to library'} className={videoGuardado ? 'text-red-500' : 'text-zinc-400'}><HeartIcon filled={videoGuardado} /></button></div></div>}
        {mostrarPlaylists && <PanelPlaylists perfil={perfil} videoActual={videoParaPlaylist ?? videoActual} onCerrar={cerrarPlaylists} onReproducirCola={reproducirCola} />}
      </div>
    </div>
  )
}
