# Sonora — reproductor de música

Aplicación React + TypeScript creada con Vite, Tailwind CSS, YouTube Data API, YouTube IFrame Player API y Cloud Firestore.

## Perfiles

La aplicación incluye dos perfiles locales:

- **Sierra**
- **Sandro**

El perfil elegido se recuerda en el navegador. Cada biblioteca y sus playlists se guardan por separado en Firestore:

- `perfiles/{perfilId}/favoritos`
- `perfiles/{perfilId}/playlists/{playlistId}/canciones`

## Configurar Firebase

1. Crea un proyecto y registra una aplicación web en Firebase Console.
2. Activa **Cloud Firestore**.
3. Copia `.env.example` como `.env` y agrega la configuración de tu aplicación web.
4. Publica `firestore.rules` desde Firebase CLI o copia sus reglas en la consola de Firestore.

Este prototipo no utiliza autenticación. Las reglas limitan las rutas a los perfiles `sierra` y `sandro`, pero cualquier persona con acceso a la aplicación podría seleccionar cualquiera de ellos. Usa Firebase Authentication si necesitas privacidad real.

## Comandos

- `npm run dev`: inicia el servidor local.
- `npm run build`: genera la compilación de producción.
- `npm run lint`: ejecuta el análisis estático.
- `npm run preview`: muestra la compilación localmente.

La portada es el elemento principal del reproductor. El módulo oficial de YouTube permanece visible en un espacio compacto y utiliza controles personalizados para reproducción, progreso, volumen y bucle, respetando sus requisitos de visualización. El bucle alterna entre desactivado, repetir cola y repetir una canción.
