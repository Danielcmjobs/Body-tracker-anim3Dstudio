/* gallery_helper.js
   Utilidades compartidas para las galerías de vídeo.
   Provee helpers para poblar selects de usuarios, debounce y setEstado.

   Uso:
     GalleryHelper.fetchAndPopulateUsers({
       url: 'https://.../api/usuarios',
       selectId: 'filtro-usuario',
       isPaginated: false, // o true si la API usa paginado
       pageSize: 100, // solo para paginado
       transformItem: (item) => ({ value: String(item.id_usuario), text: `${item.alias} (ID ${item.id_usuario})` }),
       fetchFn: fetchJson // función que realiza fetch y devuelve JSON
     });

   Está diseñado para integrarse con los scripts existentes sin módulo ES.
*/
(function (global) {
  const GalleryHelper = {
    addTodosOption(select, text = 'Todos los usuarios') {
      const optionTodos = document.createElement('option');
      optionTodos.value = '';
      optionTodos.textContent = text;
      select.appendChild(optionTodos);
    },

    setEstado(elementId, texto, esError = false) {
      const el = document.getElementById(elementId);
      if (!el) return;
      el.textContent = texto;
      el.style.color = esError ? '#ff6b6b' : '';
    },

    debounce(fn, wait = 300) {
      let t = null;
      return function debounced(...args) {
        clearTimeout(t);
        t = setTimeout(() => fn.apply(this, args), wait);
      };
    },

    async fetchAndPopulateUsers(options) {
      const {
        url,
        selectId,
        isPaginated = false,
        pageSize = 100,
        transformItem = (i) => ({ value: String(i.id_usuario), text: `${i.alias || i.nombre || 'Usuario'} (ID ${i.id_usuario})` }),
        fetchFn = (u) => fetch(u).then((r) => r.json()),
      } = options;

      const select = document.getElementById(selectId);
      if (!select) return [];

      select.innerHTML = '';
      GalleryHelper.addTodosOption(select);

      const items = [];

      if (!isPaginated) {
        const payload = await fetchFn(url);
        const list = Array.isArray(payload) ? payload : (payload.items || payload.usuarios || []);
        items.push(...list);
      } else {
        let offset = 0;
        let hasMore = true;
        while (hasMore) {
          const params = new URLSearchParams({ paginado: '1', limit: String(pageSize), offset: String(offset) });
          const pageUrl = url.includes('?') ? `${url}&${params.toString()}` : `${url}?${params.toString()}`;
          const payload = await fetchFn(pageUrl);
          const pageItems = Array.isArray(payload) ? payload : (payload.usuarios || payload.items || []);
          items.push(...pageItems);
          hasMore = Boolean(payload?.has_more);
          if (!hasMore && Array.isArray(payload)) {
            hasMore = pageItems.length === pageSize;
          }
          offset += pageSize;
          if (!pageItems.length) break;
        }
      }

      items
        .sort((a, b) => String((a.alias || a.nombre || '')).localeCompare(String((b.alias || b.nombre || ''))))
        .forEach((it) => {
          try {
            const optData = transformItem(it);
            const opt = document.createElement('option');
            opt.value = optData.value;
            opt.textContent = optData.text;
            select.appendChild(opt);
          } catch (err) {
            // ignorar elementos mal formados
          }
        });

      return items;
    },
  };

  global.GalleryHelper = GalleryHelper;
})(window);
