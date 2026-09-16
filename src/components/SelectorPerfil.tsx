import type { Perfil } from '../perfiles'
import { perfiles } from '../perfiles'

interface SelectorPerfilProps {
  onSeleccionar: (perfil: Perfil) => void
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="ml-0.5 size-6" aria-hidden="true">
      <path d="M8.2 5.5v13a1 1 0 0 0 1.54.84l10-6.5a1 1 0 0 0 0-1.68l-10-6.5a1 1 0 0 0-1.54.84Z" />
    </svg>
  )
}

export default function SelectorPerfil({ onSeleccionar }: SelectorPerfilProps) {
  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden bg-[#030303] px-5 py-12 text-white selection:bg-red-500/30">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(220,38,38,0.18),transparent_28%),radial-gradient(circle_at_80%_90%,rgba(109,40,217,0.2),transparent_30%)]" />
      <div className="relative w-full max-w-3xl text-center">
        <div className="mx-auto flex w-fit items-center gap-3">
          <span className="grid size-11 place-items-center rounded-full bg-red-600 shadow-xl shadow-red-600/25"><PlayIcon /></span>
          <span className="text-2xl font-black tracking-tight">SONORA</span>
        </div>

        <p className="mt-14 text-xs font-bold uppercase tracking-[0.25em] text-red-500">Your music, your space</p>
        <h1 className="mt-3 text-4xl font-black tracking-[-0.04em] sm:text-6xl">Who’s listening?</h1>
        <p className="mx-auto mt-4 max-w-lg text-sm leading-relaxed text-zinc-500 sm:text-base">Choose a profile to open its library and keep discovering music.</p>

        <div className="mx-auto mt-12 grid max-w-xl grid-cols-2 gap-5 sm:gap-8">
          {perfiles.map((perfil) => (
            <button key={perfil.id} type="button" onClick={() => onSeleccionar(perfil)} className="group rounded-3xl border border-white/10 bg-white/[0.035] p-4 transition duration-300 hover:-translate-y-1 hover:border-white/25 hover:bg-white/[0.07] sm:p-6">
              <span className={`relative mx-auto grid aspect-square w-full max-w-48 place-items-center overflow-hidden rounded-2xl bg-gradient-to-br ${perfil.degradado} text-6xl font-black shadow-2xl shadow-black/40 transition duration-300 group-hover:scale-[1.03] sm:text-7xl`}>
                <span className="absolute inset-0 bg-[radial-gradient(circle_at_70%_20%,rgba(255,255,255,0.35),transparent_25%)]" />
                <span className="relative drop-shadow-lg">{perfil.inicial}</span>
                <span className="absolute right-3 bottom-3 grid size-10 translate-y-2 place-items-center rounded-full bg-black/80 text-white opacity-0 shadow-xl transition duration-200 group-hover:translate-y-0 group-hover:opacity-100"><PlayIcon /></span>
              </span>
              <span className="mt-5 block text-lg font-bold">{perfil.nombre}</span>
              <span className="mt-1 block text-xs text-zinc-600 transition group-hover:text-zinc-400">View library</span>
            </button>
          ))}
        </div>

        <p className="mt-12 text-xs text-zinc-700">Each profile keeps its favorite songs separate.</p>
      </div>
    </main>
  )
}
