export interface Perfil {
  id: 'sierra' | 'sandro'
  nombre: string
  inicial: string
  degradado: string
}

export const perfiles: Perfil[] = [
  {
    id: 'sierra',
    nombre: 'Sierra',
    inicial: 'S',
    degradado: 'from-rose-500 via-red-600 to-orange-700',
  },
  {
    id: 'sandro',
    nombre: 'Sandro',
    inicial: 'S',
    degradado: 'from-violet-500 via-purple-600 to-indigo-800',
  },
]

export function obtenerPerfil(id: string | null) {
  return perfiles.find((perfil) => perfil.id === id) ?? null
}
