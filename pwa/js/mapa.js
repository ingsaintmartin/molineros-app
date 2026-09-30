/* ============================================================
   MolineroApp v2 - Mapas (OpenStreetMap via Leaflet vendorizado)
   Sin API key, sin costo, sin cuenta. Los tiles necesitan
   internet; sin conexión se muestra la info guardada.
   ------------------------------------------------------------
   Uso en HTML de una pantalla:
     Vista:  <div class="mapa-box" data-mapa data-lat="-34.6"
                    data-lng="-63.6" data-titulo="Molino Norte"></div>
     Varios puntos: data-markers='[{"lat":..,"lng":..,"titulo":".."}]'
     Picker: <div class="mapa-box" data-mapa data-mapa-picker="ins"></div>
             → al tocar el mapa llama a window.onMapaPick_ins({lat,lng})
   core.js llama a Mapa.hidratar() después de cada render.
   ============================================================ */

const Mapa = {
  _instancias: [],

  hidratar() {
    // Destruir mapas de la pantalla anterior
    for (const m of this._instancias) {
      try { m.remove(); } catch (e) {}
    }
    this._instancias = [];
    if (typeof L === 'undefined') return;
    document.querySelectorAll('[data-mapa]').forEach(el => this.crear(el));
  },

  crear(el) {
    const picker = el.getAttribute('data-mapa-picker'); // prefijo o null
    const lat = parseFloat(el.getAttribute('data-lat'));
    const lng = parseFloat(el.getAttribute('data-lng'));
    const tienePunto = isFinite(lat) && isFinite(lng);
    let markers = [];
    try { markers = JSON.parse(el.getAttribute('data-markers') || '[]'); } catch (e) {}

    // Sin internet: mostrar lo guardado sin tiles
    if (!navigator.onLine) {
      el.innerHTML = '<div class="mapa-sin-conexion">' +
        '<div style="font-size:2rem">🗺️</div>' +
        (tienePunto
          ? '<div><strong>Ubicación guardada</strong><br>' + lat.toFixed(5) + ', ' + lng.toFixed(5) + '</div>' +
            '<a class="btn btn-secondary chico" href="' + mapsUrl(lat, lng) + '" target="_blank" rel="noopener">Cómo llegar</a>'
          : '<div>Todavía no hay ubicación cargada.<br>Se necesita internet para ver el mapa.</div>') +
        '</div>';
      return;
    }

    const centro = tienePunto ? [lat, lng] : (markers.length ? [markers[0].lat, markers[0].lng] : [-35.5, -63.5]);
    const mapa = L.map(el, { scrollWheelZoom: false }).setView(centro, tienePunto || markers.length ? 14 : 6);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(mapa);
    this._instancias.push(mapa);

    const puntos = [];
    if (tienePunto) {
      const mk = L.marker([lat, lng]).addTo(mapa);
      const t = el.getAttribute('data-titulo');
      if (t) mk.bindPopup(esc(t));
      puntos.push([lat, lng]);
    }
    for (const m of markers) {
      if (!isFinite(m.lat) || isFinite(m.lng) === false) continue;
      if (!isFinite(m.lng)) continue;
      const mk = L.marker([m.lat, m.lng]).addTo(mapa);
      if (m.titulo) mk.bindPopup(esc(m.titulo));
      puntos.push([m.lat, m.lng]);
    }
    if (puntos.length > 1) mapa.fitBounds(puntos, { padding: [30, 30] });

    if (picker) {
      let marcador = tienePunto ? L.marker([lat, lng], { draggable: true }).addTo(mapa) : null;
      const avisar = p => {
        const cb = window['onMapaPick_' + picker];
        if (typeof cb === 'function') cb({ lat: +p.lat.toFixed(6), lng: +p.lng.toFixed(6) });
      };
      mapa.on('click', e => {
        if (marcador) marcador.setLatLng(e.latlng);
        else { marcador = L.marker(e.latlng, { draggable: true }).addTo(mapa); }
        avisar(e.latlng);
      });
      if (marcador) marcador.on('dragend', () => avisar(marcador.getLatLng()));
      // Botón para centrar en la posición actual
      const btn = L.control({ position: 'topright' });
      btn.onAdd = () => {
        const d = L.DomUtil.create('button', 'icon-btn');
        d.innerHTML = '📍';
        d.title = 'Centrar en mi ubicación';
        d.style.cssText = 'width:40px;height:40px;border-radius:10px;border:1px solid #ccc;background:#fff;font-size:1.2rem;cursor:pointer;';
        d.onclick = async () => {
          const gps = await obtenerGPS();
          if (gps) { mapa.setView([gps.lat, gps.lng], 15); avisar(gps); }
          else snack('No se pudo obtener la ubicación.');
        };
        return d;
      };
      btn.addTo(mapa);
    }
    // Leaflet necesita un momento cuando el contenedor se pintó recién
    setTimeout(() => { try { mapa.invalidateSize(); } catch (e) {} }, 60);
  }
};
