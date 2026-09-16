import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore'
import type { Timestamp } from 'firebase/firestore'
import { db } from '../firebaseClient'
import { cacheAudio } from '../audioOffline'
import type { Perfil } from '../perfiles'
import type { Favorito, Video } from './BuscadorMusica'

interface Playlist {
  id: string
  nombre: string
  creado_en: Timestamp | null
}

interface PanelPlaylistsProps {
  perfil: Perfil
  videoActual: Video | null
  onCerrar: () => void
  onReproducirCola: (videos: Video[], indice: number, nombre: string) => void
}

function miniaturaDe(video: Video) {
  return video.snippet.thumbnails.high?.url ?? video.snippet.thumbnails.medium?.url ?? video.snippet.thumbnails.default?.url ?? ''
}

function PlayIcon() {
  return <svg viewBox="0 0 24 24" fill="currentColor" className="size-4" aria-hidden="true"><path d="M8.2 5.5v13a1 1 0 0 0 1.54.84l10-6.5a1 1 0 0 0 0-1.68l-10-6.5a1 1 0 0 0-1.54.84Z" /></svg>
}

function PlusIcon() {
  return <svg viewBox="0 0 24 24" fill="none" className="size-5" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
}

export default function PanelPlaylists({ perfil, videoActual, onCerrar, onReproducirCola }: PanelPlaylistsProps) {
  const [playlists, setPlaylists] = useState<Playlist[]>([])
  const [seleccionada, setSeleccionada] = useState<string | null>(null)
  const [canciones, setCanciones] = useState<Favorito[]>([])
  const [nombre, setNombre] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState('')

  useEffect(() => {
    if (!db) return
    return onSnapshot(
      query(collection(db, 'perfiles', perfil.id, 'playlists'), orderBy('creado_en', 'desc')),
      (snapshot) => {
        const lista = snapshot.docs.map((item) => ({ id: item.id, ...(item.data() as Omit<Playlist, 'id'>) }))
        setPlaylists(lista)
        setSeleccionada((actual) => actual ?? lista[0]?.id ?? null)
      },
      (error) => setMensaje(`Could not load playlists: ${error.message}`),
    )
  }, [perfil.id])

  useEffect(() => {
    if (!db || !seleccionada) return
    return onSnapshot(
      query(collection(db, 'perfiles', perfil.id, 'playlists', seleccionada, 'canciones'), orderBy('creado_en', 'asc')),
      (snapshot) => {
        const lista = snapshot.docs.map((item) => ({ id: item.id, ...(item.data() as Omit<Favorito, 'id'>) }))
        setCanciones(lista)
        void Promise.all(lista.filter((cancion) => cancion.audio_url).map((cancion) => cacheAudio(cancion.video_id, cancion.audio_url as string).catch(() => undefined)))
      },
      (error) => setMensaje(`Could not open the playlist: ${error.message}`),
    )
  }, [perfil.id, seleccionada])

  async function crearPlaylist(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nombreLimpio = nombre.trim()
    if (!db || !nombreLimpio) return
    setGuardando(true)
    setMensaje('')
    try {
      const nueva = await addDoc(collection(db, 'perfiles', perfil.id, 'playlists'), {
        nombre: nombreLimpio.slice(0, 60),
        creado_en: serverTimestamp(),
      })
      setNombre('')
      setSeleccionada(nueva.id)
      setMensaje('Playlist created.')
    } catch (error) {
      setMensaje(error instanceof Error ? `Could not create it: ${error.message}` : 'Could not create the playlist.')
    } finally {
      setGuardando(false)
    }
  }

  async function agregarActual() {
    if (!db || !seleccionada || !videoActual) return
    setGuardando(true)
    setMensaje('')
    try {
      await setDoc(doc(db, 'perfiles', perfil.id, 'playlists', seleccionada, 'canciones', videoActual.id.videoId), {
        video_id: videoActual.id.videoId,
        titulo: videoActual.snippet.title,
        canal: videoActual.snippet.channelTitle,
        miniatura: miniaturaDe(videoActual) || null,
        audio_url: videoActual.audioUrl ?? null,
        creado_en: serverTimestamp(),
      })
      setMensaje('Song added to the playlist.')
    } catch (error) {
      setMensaje(error instanceof Error ? `Could not add it: ${error.message}` : 'Could not add the song.')
    } finally {
      setGuardando(false)
    }
  }

  async function quitarCancion(cancion: Favorito) {
    if (!db || !seleccionada) return
    await deleteDoc(doc(db, 'perfiles', perfil.id, 'playlists', seleccionada, 'canciones', cancion.id))
  }

  function favoritoComoVideo(cancion: Favorito): Video {
    return {
      id: { videoId: cancion.video_id },
      snippet: {
        title: cancion.titulo,
        channelTitle: cancion.canal ?? 'Unknown channel',
        thumbnails: cancion.miniatura ? { high: { url: cancion.miniatura } } : {},
      },
    }
  }

  function reproducirDesde(indice: number) {
    const nombrePlaylist = playlists.find((item) => item.id === seleccionada)?.nombre ?? 'Playlist'
    onReproducirCola(canciones.map(favoritoComoVideo), indice, nombrePlaylist)
    onCerrar()
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Playlists">
      <div className="grid max-h-[85vh] w-full max-w-4xl overflow-hidden rounded-3xl border border-white/10 bg-zinc-950 shadow-2xl md:grid-cols-[280px_1fr]">
        <aside className="border-b border-white/10 p-5 md:border-r md:border-b-0">
          <div className="flex items-center justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-red-500">Collections</p><h2 className="mt-1 text-xl font-black">Playlists</h2></div><button type="button" onClick={onCerrar} aria-label="Close" className="grid size-9 place-items-center rounded-full bg-white/10 text-xl text-zinc-300 hover:bg-white/20">×</button></div>
          <form onSubmit={crearPlaylist} className="mt-5 rounded-2xl border border-white/10 bg-white/[0.035] p-3"><label htmlFor="playlist-name" className="text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-500">Create a playlist</label><input id="playlist-name" value={nombre} onChange={(event) => setNombre(event.target.value)} maxLength={60} placeholder="Playlist name" className="mt-2 h-10 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-sm outline-none focus:border-red-500" /><button type="submit" disabled={guardando || !nombre.trim()} className="mt-2 flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-white px-3 text-xs font-black text-black transition hover:bg-zinc-200 disabled:opacity-40"><PlusIcon /> Create playlist</button></form>
          <div className="mt-4 max-h-52 space-y-1 overflow-y-auto md:max-h-[45vh]">{playlists.length === 0 && <p className="rounded-xl border border-dashed border-white/10 px-3 py-5 text-center text-xs leading-relaxed text-zinc-600">Your playlists will appear here.</p>}{playlists.map((playlist) => <button key={playlist.id} type="button" onClick={() => setSeleccionada(playlist.id)} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition ${seleccionada === playlist.id ? 'bg-white/10 text-white' : 'text-zinc-400 hover:bg-white/5 hover:text-white'}`}><span className="grid size-8 place-items-center rounded bg-gradient-to-br from-red-600 to-fuchsia-800"><PlayIcon /></span><span className="truncate">{playlist.nombre}</span></button>)}</div>
        </aside>

        <section className="min-h-80 overflow-y-auto p-5 sm:p-7">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs text-zinc-500">{playlists.find((item) => item.id === seleccionada)?.nombre ?? 'Select a playlist'}</p><h3 className="mt-1 text-2xl font-black">{canciones.length} songs</h3></div><div className="flex flex-wrap gap-2"><button type="button" onClick={() => reproducirDesde(0)} disabled={canciones.length === 0} className="flex items-center gap-2 rounded-full bg-red-600 px-4 py-2.5 text-xs font-bold text-white shadow-lg shadow-red-950/30 disabled:opacity-40"><PlayIcon /> Play all</button><button type="button" onClick={() => void agregarActual()} disabled={!seleccionada || !videoActual || guardando} className="flex items-center gap-2 rounded-full bg-white px-4 py-2.5 text-xs font-bold text-black disabled:opacity-40"><PlusIcon /> Add current song</button></div></div>
          {playlists.length === 0 ? <div className="grid min-h-64 place-items-center text-center"><div><span className="mx-auto grid size-12 place-items-center rounded-full bg-red-600/15 text-red-400"><PlusIcon /></span><p className="mt-4 text-sm font-semibold">Create your first playlist</p><p className="mt-1 max-w-64 text-xs leading-relaxed text-zinc-500">Give it a name on the left, then add the song you selected.</p></div></div> : canciones.length === 0 ? <div className="grid min-h-64 place-items-center text-center"><div><span className="mx-auto grid size-12 place-items-center rounded-full bg-white/10 text-zinc-400"><PlayIcon /></span><p className="mt-4 text-sm font-semibold">This playlist is empty</p><p className="mt-1 text-xs text-zinc-500">Use Add current song to start building it.</p></div></div> : <div className="mt-6 space-y-1">{canciones.map((cancion, indice) => <div key={cancion.id} className="group flex items-center gap-3 rounded-xl p-2 hover:bg-white/[0.06]"><span className="w-5 text-center text-xs text-zinc-600">{indice + 1}</span><button type="button" onClick={() => reproducirDesde(indice)} aria-label={`Play ${cancion.titulo}`} className="size-12 shrink-0 overflow-hidden rounded-lg bg-zinc-800">{cancion.miniatura && <img src={cancion.miniatura} alt="" className="h-full w-full object-cover" />}</button><button type="button" onClick={() => reproducirDesde(indice)} className="min-w-0 flex-1 text-left"><span className="block truncate text-sm font-semibold">{cancion.titulo}</span><span className="block truncate text-xs text-zinc-500">{cancion.canal}</span></button><button type="button" onClick={() => void quitarCancion(cancion)} className="rounded-full px-3 py-1 text-xs text-zinc-500 opacity-0 hover:bg-red-500/10 hover:text-red-400 group-hover:opacity-100 focus:opacity-100">Remove</button></div>)}</div>}
          {mensaje && <p role="status" className="mt-4 rounded-lg bg-white/[0.05] px-3 py-2 text-xs text-zinc-400">{mensaje}</p>}
        </section>
      </div>
    </div>
  )
}
