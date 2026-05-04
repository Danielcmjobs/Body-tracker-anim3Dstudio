// getFutbolBaseUrl() se carga desde js/config.js
// fetchJsonFutbol() se carga desde js/api_futbol.js

const API_URL_FUTBOL_USERS = `${getFutbolBaseUrl()}/api/usuarios_futbol`;

function setUsuarioActivo(usuario) {
    sessionStorage.setItem('idUser', String(usuario.id_usuario));
    sessionStorage.setItem('aliasUser', usuario.alias);
    sessionStorage.setItem('nombreUser', usuario.nombre);

    const estado = document.getElementById('usuario-estado');
    if (estado) {
        estado.textContent = `Usuario activo: ${usuario.alias} (ID ${usuario.id_usuario})`;
        estado.style.color = '#34c759';
    }

    document.dispatchEvent(new CustomEvent('usuarioSeleccionCambio', {
        detail: { seleccionado: true, usuario }
    }));
}

function limpiarUsuarioActivo(mensaje = 'Sin usuario activo.') {
    sessionStorage.removeItem('idUser');
    sessionStorage.removeItem('aliasUser');
    sessionStorage.removeItem('nombreUser');

    const estado = document.getElementById('usuario-estado');
    if (estado) {
        estado.textContent = mensaje;
        estado.style.color = 'var(--text-muted)';
    }

    document.dispatchEvent(new CustomEvent('usuarioSeleccionCambio', {
        detail: { seleccionado: false }
    }));
}

async function crearUsuario(alias, nombre) {
    const body = { alias, nombre };
    const payload = await fetchJsonFutbol(API_URL_FUTBOL_USERS, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });

    return payload.id_usuario;
}

async function actualizarUsuario(idUsuario, alias, nombre) {
    const body = { alias, nombre };
    await fetchJsonFutbol(`${API_URL_FUTBOL_USERS}/${idUsuario}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
}

async function eliminarUsuario(idUsuario) {
    await fetchJsonFutbol(`${API_URL_FUTBOL_USERS}/${idUsuario}`, { method: 'DELETE' });
}

async function obtenerUsuariosPaginados({ search = '', limit = 20, offset = 0 }) {
    const query = new URLSearchParams({
        paginado: '1',
        search,
        limit: String(limit),
        offset: String(offset)
    });
    const url = `${API_URL_FUTBOL_USERS}?${query.toString()}`;
    const payload = await fetchJsonFutbol(url);
    const items = Array.isArray(payload.usuarios) ? payload.usuarios : [];
    const total = Number(payload.total || 0);
    return {
        items,
        total,
        limit,
        offset,
        has_more: (offset + items.length) < total,
    };
}

document.addEventListener('DOMContentLoaded', () => {
    const tablaBody = document.getElementById('tabla-usuarios-body');
    const tablaWrapper = document.getElementById('tabla-usuarios-wrapper');
    const inputBuscar = document.getElementById('buscar-usuario');
    const usuariosLoading = document.getElementById('usuarios-loading');
    const usuariosEmpty = document.getElementById('usuarios-empty');
    const btnRefrescar = document.getElementById('btn-refrescar-usuarios');
    const btnCrearInline = document.getElementById('btn-guardar-usuario');
    const btnEditar = document.getElementById('btn-editar-usuario');
    const btnEliminar = document.getElementById('btn-eliminar-usuario');
    const btnCancelarEdicion = document.getElementById('btn-cancelar-edicion');
    const inputAlias = document.getElementById('form-alias');
    const inputNombre = document.getElementById('form-nombre');

    const PAGE_SIZE = 20;
    let usuariosOffset = 0;
    let usuariosHasMore = true;
    let usuariosLoadingPage = false;
    let terminoBusqueda = '';
    let usuarioActivoId = Number(sessionStorage.getItem('idUser') || '0');
    let usuarioActivoData = null;
    let modoEdicion = false;

    function setEstado(mensaje, color = 'var(--text-muted)') {
        const estado = document.getElementById('usuario-estado');
        if (estado) {
            estado.textContent = mensaje;
            estado.style.color = color;
        }
    }

    function limpiarFormularioUsuario() {
        if (inputAlias) inputAlias.value = '';
        if (inputNombre) inputNombre.value = '';
    }

    function activarModoEdicion(usuario) {
        if (!usuario || !inputAlias || !inputNombre || !btnCrearInline || !btnCancelarEdicion) {
            return;
        }
        modoEdicion = true;
        inputAlias.value = usuario.alias || '';
        inputNombre.value = usuario.nombre || '';
        btnCrearInline.textContent = 'Guardar cambios';
        btnCancelarEdicion.style.display = 'block';
        setEstado(`Editando usuario: ${usuario.alias}`, '#c897ff');
    }

    function desactivarModoEdicion() {
        modoEdicion = false;
        if (btnCrearInline) btnCrearInline.textContent = 'Crear usuario';
        if (btnCancelarEdicion) btnCancelarEdicion.style.display = 'none';
        limpiarFormularioUsuario();
    }

    function pintarFilaUsuario(u) {
        if (!tablaBody) {
            return;
        }
        const tr = document.createElement('tr');
        tr.dataset.idUsuario = String(u.id_usuario);
        if (Number(u.id_usuario) === usuarioActivoId) {
            tr.classList.add('activo');
            usuarioActivoData = u;
            setUsuarioActivo({
                id_usuario: u.id_usuario,
                alias: u.alias,
                nombre: u.nombre,
            });
        }

        const tdUsuario = document.createElement('td');
        const alias = u.alias || '';
        const nombre = u.nombre || '';
        if (alias && nombre) {
            tdUsuario.textContent = `${nombre} · ${alias}`;
        } else {
            tdUsuario.textContent = nombre || alias || '--';
        }
        tr.append(tdUsuario);

        tr.addEventListener('click', () => {
            usuarioActivoId = Number(u.id_usuario);
            usuarioActivoData = u;
            document.querySelectorAll('#tabla-usuarios-body tr').forEach((row) => row.classList.remove('activo'));
            tr.classList.add('activo');
            setUsuarioActivo({
                id_usuario: u.id_usuario,
                alias: u.alias,
                nombre: u.nombre,
            });
        });

        tablaBody.appendChild(tr);
    }

    function actualizarEstadosTabla() {
        if (!usuariosLoading || !usuariosEmpty || !tablaBody) {
            return;
        }
        usuariosLoading.style.display = usuariosLoadingPage ? 'block' : 'none';
        usuariosEmpty.style.display = (!usuariosLoadingPage && tablaBody.children.length === 0) ? 'block' : 'none';
    }

    async function cargarSiguientePaginaUsuarios(reset = false) {
        if (!tablaBody || usuariosLoadingPage || (!usuariosHasMore && !reset)) {
            return;
        }

        if (reset) {
            usuariosOffset = 0;
            usuariosHasMore = true;
            tablaBody.innerHTML = '';
        }

        usuariosLoadingPage = true;
        actualizarEstadosTabla();

        try {
            const data = await obtenerUsuariosPaginados({
                search: terminoBusqueda,
                limit: PAGE_SIZE,
                offset: usuariosOffset
            });

            data.items.forEach((u) => pintarFilaUsuario(u));
            usuariosOffset += data.items.length;
            usuariosHasMore = Boolean(data.has_more);
        } catch (error) {
            setEstado(`No se pudo cargar usuarios: ${error.message}`, '#ff6b6b');
        } finally {
            usuariosLoadingPage = false;
            actualizarEstadosTabla();
        }
    }

    async function recargarUsuariosSelect() {
        if (!tablaBody) {
            return;
        }
        await cargarSiguientePaginaUsuarios(true);
    }

    if (tablaBody) {
        recargarUsuariosSelect().catch((error) => {
            setEstado(`No se pudo cargar usuarios: ${error.message}`, '#ff6b6b');
        });
    }

    if (tablaWrapper) {
        tablaWrapper.addEventListener('scroll', () => {
            const cercaDelFinal = tablaWrapper.scrollTop + tablaWrapper.clientHeight >= (tablaWrapper.scrollHeight - 40);
            if (cercaDelFinal) {
                cargarSiguientePaginaUsuarios(false);
            }
        });
    }

    if (inputBuscar) {
        let timer = null;
        inputBuscar.addEventListener('input', () => {
            clearTimeout(timer);
            timer = setTimeout(() => {
                terminoBusqueda = inputBuscar.value.trim();
                cargarSiguientePaginaUsuarios(true);
            }, 250);
        });
    }

    if (btnRefrescar) {
        btnRefrescar.addEventListener('click', async () => {
            try {
                await recargarUsuariosSelect();
                setEstado('Lista de usuarios actualizada.');
            } catch (error) {
                setEstado(`Error al actualizar: ${error.message}`, '#ff6b6b');
            }
        });
    }

    if (btnEditar) {
        btnEditar.addEventListener('click', () => {
            if (!usuarioActivoData) {
                setEstado('Selecciona un usuario para editar.', '#ffb020');
                return;
            }
            activarModoEdicion(usuarioActivoData);
        });
    }

    if (btnEliminar) {
        btnEliminar.addEventListener('click', async () => {
            if (!usuarioActivoData) {
                setEstado('Selecciona un usuario para eliminar.', '#ffb020');
                return;
            }

            const confirmado = window.confirm(`Eliminar al usuario ${usuarioActivoData.alias}? Esta accion no se puede deshacer.`);
            if (!confirmado) {
                return;
            }

            btnEliminar.disabled = true;
            const texto = btnEliminar.textContent;
            btnEliminar.textContent = 'Eliminando...';
            try {
                await eliminarUsuario(usuarioActivoData.id_usuario);
                if (Number(sessionStorage.getItem('idUser') || '0') === Number(usuarioActivoData.id_usuario)) {
                    limpiarUsuarioActivo('Usuario eliminado. Selecciona otro para continuar.');
                }
                usuarioActivoId = 0;
                usuarioActivoData = null;
                desactivarModoEdicion();
                await recargarUsuariosSelect();
                setEstado('Usuario eliminado correctamente.', '#34c759');
            } catch (error) {
                setEstado(`No se pudo eliminar: ${error.message}`, '#ff6b6b');
            } finally {
                btnEliminar.disabled = false;
                btnEliminar.textContent = texto;
            }
        });
    }

    if (btnCancelarEdicion) {
        btnCancelarEdicion.addEventListener('click', () => {
            desactivarModoEdicion();
            setEstado('Edicion cancelada.');
        });
    }

    if (btnCrearInline) {
        btnCrearInline.addEventListener('click', async () => {
            const alias = (inputAlias?.value || '').trim();
            const nombre = (inputNombre?.value || '').trim();

            if (!alias || !nombre) {
                setEstado('Completa alias y nombre.', '#ffb020');
                return;
            }

            btnCrearInline.disabled = true;
            const texto = btnCrearInline.textContent;
            const eraEdicion = modoEdicion;
            btnCrearInline.textContent = modoEdicion ? 'Guardando...' : 'Creando...';
            try {
                if (modoEdicion && usuarioActivoData) {
                    await actualizarUsuario(usuarioActivoData.id_usuario, alias, nombre);
                    usuarioActivoId = usuarioActivoData.id_usuario;
                } else {
                    const idUsuario = await crearUsuario(alias, nombre);
                    usuarioActivoId = idUsuario;
                }

                await recargarUsuariosSelect();

                const idFinal = usuarioActivoId;
                const usuarioFinal = {
                    id_usuario: idFinal,
                    alias,
                    nombre
                };
                usuarioActivoData = usuarioFinal;

                setUsuarioActivo({
                    id_usuario: idFinal,
                    alias,
                    nombre
                });

                desactivarModoEdicion();
                setEstado(eraEdicion ? 'Usuario actualizado correctamente.' : 'Usuario creado correctamente.', '#34c759');
            } catch (error) {
                setEstado(`No se pudo guardar el usuario: ${error.message}`, '#ff6b6b');
            } finally {
                btnCrearInline.disabled = false;
                btnCrearInline.textContent = texto;
            }
        });
    }
});
