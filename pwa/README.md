# MolineroApp 🌀💧

Aplicación web (PWA) **100% gratuita, offline-first y lista para producción**, para uso personal de un molinero de la provincia de Buenos Aires.

Permite llevar en el teléfono:
1. **Clientes** (productores / campos)
2. **Molinos, aguadas y bebederos** de cada cliente (con ficha técnica completa)
3. **Historial de reparaciones** de cada molino (con fotos y costos)

Todo se guarda **en el dispositivo** (IndexedDB): **no necesita internet ni señal** para funcionar. Se puede **instalar como aplicación en Android** y se puede **exportar un respaldo** en un archivo JSON.

---

## 📁 Estructura de archivos

```
pwa/
├── index.html            # Página principal (una sola pantalla con todas las vistas)
├── styles.css            # Estilos (paleta verde/azul, botones grandes, alto contraste)
├── app.js                # Lógica y navegación de la app
├── db.js                 # Capa de datos (IndexedDB + cola de sincronización)
├── supabase-config.js    # Claves de Supabase (NO se sube al repo, ver .gitignore)
├── manifest.json         # Para instalarla como app en Android/escritorio
├── service-worker.js     # Cache y funcionamiento 100% offline
├── offline.html          # Mensaje de respaldo si no hay conexión
├── vendor/dexie.min.js   # Dexie.js (incrustado localmente, sin CDN)
├── icons/                # Íconos de la app (192 y 512 px)
└── README.md             # Estas instrucciones
```

---

## 🌐 Cómo subirla (Netlify o Vercel)

**Netlify (la más fácil):**
1. Entrá a https://app.netlify.com y create una cuenta gratuita (o entrá con tu email).
2. Andá a **Sites** → **Add new site** → **Deploy manually**.
3. Arrastrá la carpeta `pwa/` (o el `.zip` con su contenido) a la ventana.
4. Esperá unos segundos. Netlify te da una dirección web automática (ej. `https://mistio-xxxx.netlify.app`).
5. ¡Listo! Abrí esa dirección desde el celular.

**Vercel:**
1. Entrá a https://vercel.com y entrá con tu cuenta.
2. **Add New…** → **Project** → importá tu repositorio (o usá la opción de subir la carpeta).
3. No hace falta configurar nada: se publica sola y te da una dirección `https://tuapp.vercel.app`.

> 💡 **Importante:** para que la instalación como app funcione, la web debe abrirse por **HTTPS**. Netlify y Vercel dan HTTPS gratis y automático, así que no tenés que hacer nada.

---

## 📱 Cómo instalarla en el celular (Android)

1. Abrí la dirección de tu app en **Chrome** (el navegador de Android).
2. A los pocos segundos vas a ver un aviso/ícono que dice **"Agregar a la pantalla de inicio"** (o **"Instalar aplicación"**).
   - Si no aparece: tocá el menú de Chrome (los **3 puntitos** ⋮) → **"Agregar a pantalla de inicio"** → **"Instalar"**.
3. Confirmá la instalación.
4. Quedará un **ícono de MolineroApp** en la pantalla de inicio, como una app normal. Ábrila de ahí, no del navegador.

A partir de ese momento la app queda guardada en el teléfono y **funciona sin señal**. Para usarla en el campo, entrá siempre desde el ícono de la pantalla de inicio.

---

## 🧭 Cómo se usa (paso a paso)

1. **Clientes:** es la primera pantalla. Tocá **"＋ Nuevo cliente"** y cargá nombre, campo, localidad y teléfono. Usá la lupa de arriba para **buscar por nombre o campo**.
2. **Molinos de un cliente:** entrá a un cliente → **"＋ Agregar molino / aguada"**. Completá la ficha técnica (tipo, marca, modelo, cilindro, caños, profundidad, estado), agregá **fotos** con la cámara y, si querés, tocá **"Usar mi ubicación actual"** para guardar el punto GPS.
3. **Reparaciones:** entrá a un molino → **"🔧 Nueva reparación"**. Cargá fecha, problema, trabajo realizado, piezas, costo y fotos.
4. **Respaldo:** tocá el botón **💾** de arriba a la derecha → **"Exportar respaldo"**. Se descarga un archivo `.json` con todos los datos. Guardalo donde quieras (por ejemplo, mandátelo por mail o WhatsApp). Si cambiás de teléfono, usá **"Restaurar respaldo"**.

---

## ✅ Funciona offline: ¿cómo verificarlo?

Después de instalar la app y abrirla una vez conectado, activá el **modo avión** del celular y volvé a abrir MolineroApp desde el ícono: todo funciona normal y tus datos quedan guardados. Tuve señal ya no hace falta ni para trabajar.

---

## 🛠️ Notas técnicas

- **Base de datos:** IndexedDB mediante **Dexie.js** (archivo local en `vendor/`, sin CDN). Funciona 100% sin internet: la app arranca igual en modo avión.
- **Sincronización con Supabase (opcional):** si completás `supabase-config.js` con las claves de tu proyecto, los datos se sincronizan entre dispositivos. Cada cambio se registra en una cola local: si no hay señal se guarda igual y se sube solo cuando vuelve la conexión, *antes* de descargar. Nada de lo cargado offline se pierde. Sin configurar, la app anda igual pero solo en este dispositivo.
- **Fotos:** se guardan como **base64 dentro de la base local**, por eso funcionan sin internet. Cuantas más fotos tomes, más espacio usa el teléfono (es normal).
- **Service Worker:** guarda todos los archivos en caché al instalarse y los actualiza cuando hay señal.
- **Diseño:** mobile-first, botones grandes (mínimo 48 px) para usar con guantes o manos sucias, tipografía grande y paleta de verdes y azules (campo y agua) de alto contraste para leer bajo el sol.
