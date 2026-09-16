import { useState } from 'react'
import BuscadorMusica from './components/BuscadorMusica'
import SelectorPerfil from './components/SelectorPerfil'
import type { Perfil } from './perfiles'
import { obtenerPerfil } from './perfiles'

const CLAVE_PERFIL = 'sonora-perfil-activo'

function App() {
  const [perfilActivo, setPerfilActivo] = useState<Perfil | null>(() =>
    obtenerPerfil(localStorage.getItem(CLAVE_PERFIL)),
  )

  function seleccionarPerfil(perfil: Perfil) {
    localStorage.setItem(CLAVE_PERFIL, perfil.id)
    setPerfilActivo(perfil)
  }

  function cambiarPerfil() {
    localStorage.removeItem(CLAVE_PERFIL)
    setPerfilActivo(null)
  }

  if (!perfilActivo) {
    return <SelectorPerfil onSeleccionar={seleccionarPerfil} />
  }

  return <BuscadorMusica perfil={perfilActivo} onCambiarPerfil={cambiarPerfil} />
}

export default App
