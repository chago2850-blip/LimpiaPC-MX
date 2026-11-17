// LimpiaPc-MX — Rendimiento: elementos de inicio, tareas de mantenimiento y procesos pesados
// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';

const U = require('../core/util');
const store = require('../core/store');
const { path, h, IS_MAC, IS_WIN, IS_LINUX } = U;

// ---------------- Elementos de inicio ----------------
function parseDesktop(txt) {
  const o = {};
  let inMain = false;
  for (const line of txt.split(/\r?\n/)) {
    if (/^\[Desktop Entry\]/.test(line)) { inMain = true; continue; }
    if (/^\[/.test(line)) { inMain = false; continue; }
    if (!inMain) continue;
    const m = line.match(/^([A-Za-z0-9-]+(?:\[[^\]]+\])?)\s*=\s*(.*)$/);
    if (m && !(m[1] in o)) o[m[1]] = m[2];
  }
  return o;
}

async function listStartup() {
  const items = [];
  if (IS_LINUX) {
    const userDir = path.join(U.XDG_CONFIG, 'autostart');
    const seen = new Map();
    for (const dir of ['/etc/xdg/autostart', userDir]) {
      let files = []; try { files = await U.fsp.readdir(dir); } catch {}
      for (const f of files.filter(f => f.endsWith('.desktop'))) {
        try {
          const d = parseDesktop(await U.fsp.readFile(path.join(dir, f), 'utf8'));
          if (d.NoDisplay === 'true' && dir !== userDir) continue;
          const enabled = d.Hidden !== 'true' && d['X-GNOME-Autostart-enabled'] !== 'false';
          seen.set(f, { id: 'xdg:' + f, name: d['Name[es]'] || d.Name || f, command: d.Exec || '', kind: 'Inicio de sesión', scope: dir === userDir ? 'usuario' : 'sistema', enabled, file: path.join(dir, f), canToggle: true, canRemove: dir === userDir });
        } catch {}
      }
    }
    items.push(...seen.values());
    const r = await U.run('systemctl', ['--user', 'list-unit-files', '--type=service', '--state=enabled,disabled', '--no-legend', '--no-pager']);
    for (const line of r.stdout.split('\n')) {
      const m = line.trim().match(/^(\S+\.service)\s+(enabled|disabled)/);
      if (m && !m[1].includes('@')) items.push({ id: 'sysu:' + m[1], name: m[1].replace('.service', ''), command: 'systemctl --user ' + m[1], kind: 'Servicio de usuario', scope: 'usuario', enabled: m[2] === 'enabled', canToggle: true, canRemove: false });
    }
  }

  if (IS_MAC) {
    const agentDirs = [[h('Library/LaunchAgents'), 'usuario'], ['/Library/LaunchAgents', 'sistema'], ['/Library/LaunchDaemons', 'sistema (demonio)']];
    const disabledDir = h('Library/LaunchAgents (LimpiaPc desactivados)');
    for (const [dir, scope] of agentDirs) {
      let files = []; try { files = await U.fsp.readdir(dir); } catch {}
      for (const f of files.filter(f => f.endsWith('.plist'))) {
        const file = path.join(dir, f);
        const j = await U.run('plutil', ['-convert', 'json', '-o', '-', file]);
        let d = {}; try { d = JSON.parse(j.stdout); } catch {}
        const cmd = d.Program || (d.ProgramArguments || []).join(' ');
        items.push({ id: 'la:' + file, name: d.Label || f.replace('.plist', ''), command: cmd, kind: scope.includes('demonio') ? 'Demonio' : 'Agente', scope, enabled: !d.Disabled, file, canToggle: scope === 'usuario', canRemove: true, admin: scope !== 'usuario' });
      }
    }
    let dis = []; try { dis = await U.fsp.readdir(disabledDir); } catch {}
    for (const f of dis.filter(f => f.endsWith('.plist'))) items.push({ id: 'la:' + path.join(disabledDir, f), name: f.replace('.plist', ''), command: '', kind: 'Agente', scope: 'usuario', enabled: false, file: path.join(disabledDir, f), canToggle: true, canRemove: true });
    const r = await U.run('osascript', ['-e', 'tell application "System Events" to get the name of every login item']);
    if (r.ok) for (const n of r.stdout.trim().split(/,\s*/).filter(Boolean)) items.push({ id: 'li:' + n, name: n, command: 'Ítem de inicio de sesión', kind: 'Ítem de inicio de sesión', scope: 'usuario', enabled: true, canToggle: false, canRemove: true });
  }

  if (IS_WIN) {
    const disabled = store.get('disabledStartup') || {};
    const keys = [['HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run', 'usuario'], ['HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Run', 'sistema'], ['HKLM\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Run', 'sistema (32 bits)']];
    for (const [key, scope] of keys) {
      const r = await U.run('reg', ['query', key]);
      for (const line of r.stdout.split(/\r?\n/)) {
        const m = line.match(/^\s{4}(.+?)\s{4}(REG_\w+)\s{4}(.*)$/);
        if (m) items.push({ id: 'reg:' + key + '|' + m[1], name: m[1], command: m[3], kind: 'Registro (Run)', scope, enabled: true, key, valueName: m[1], valueType: m[2], canToggle: true, canRemove: true, admin: key.startsWith('HKLM') });
      }
    }
    for (const [id, d] of Object.entries(disabled)) items.push({ ...d, id, enabled: false, canToggle: true, canRemove: true });
    const folders = [[path.join(U.APPDATA, 'Microsoft/Windows/Start Menu/Programs/Startup'), 'usuario'], [path.join(U.PROGRAMDATA, 'Microsoft/Windows/Start Menu/Programs/StartUp'), 'sistema']];
    for (const [dir, scope] of folders) {
      let files = []; try { files = await U.fsp.readdir(dir); } catch {}
      for (const f of files.filter(f => !/desktop\.ini/i.test(f))) items.push({ id: 'fold:' + path.join(dir, f), name: f.replace(/\.lnk$/i, ''), command: path.join(dir, f), kind: 'Carpeta Inicio', scope, enabled: !f.endsWith('.disabled'), file: path.join(dir, f), canToggle: true, canRemove: true, admin: scope === 'sistema' });
    }
    const t = await U.ps("Get-ScheduledTask | Where-Object { $_.Triggers | Where-Object { $_.CimClass.CimClassName -match 'Logon|Boot' } } | Where-Object { $_.TaskPath -notmatch '\\\\Microsoft\\\\' } | Select-Object TaskName,TaskPath,State | ConvertTo-Json -Compress");
    try {
      let arr = JSON.parse(t.stdout || '[]'); if (!Array.isArray(arr)) arr = [arr];
      for (const x of arr) items.push({ id: 'task:' + x.TaskPath + x.TaskName, name: x.TaskName, command: x.TaskPath, kind: 'Tarea programada', scope: 'sistema', enabled: x.State !== 1, taskName: x.TaskName, taskPath: x.TaskPath, canToggle: true, canRemove: false, admin: true });
    } catch {}
  }
  return items;
}

async function toggleStartup(item, enable) {
  if (IS_LINUX && item.id.startsWith('xdg:')) {
    const f = item.id.slice(4);
    const userFile = path.join(U.XDG_CONFIG, 'autostart', f);
    await U.fsp.mkdir(path.dirname(userFile), { recursive: true });
    let txt;
    try { txt = await U.fsp.readFile(userFile, 'utf8'); } catch { txt = await U.fsp.readFile(path.join('/etc/xdg/autostart', f), 'utf8'); }
    txt = txt.replace(/^Hidden=.*\n?/m, '').replace(/^X-GNOME-Autostart-enabled=.*\n?/m, '');
    txt = txt.replace(/\[Desktop Entry\]\r?\n/, m => m + (enable ? 'X-GNOME-Autostart-enabled=true\n' : 'Hidden=true\nX-GNOME-Autostart-enabled=false\n'));
    await U.fsp.writeFile(userFile, txt);
    return true;
  }
  if (IS_LINUX && item.id.startsWith('sysu:')) return (await U.run('systemctl', ['--user', enable ? 'enable' : 'disable', item.id.slice(5)])).ok;
  if (IS_MAC && item.id.startsWith('la:')) {
    const disabledDir = h('Library/LaunchAgents (LimpiaPc desactivados)');
    const file = item.file;
    if (enable) {
      const dest = path.join(h('Library/LaunchAgents'), path.basename(file));
      await U.fsp.rename(file, dest);
      await U.run('launchctl', ['load', '-w', dest]);
    } else {
      await U.run('launchctl', ['unload', '-w', file]);
      await U.fsp.mkdir(disabledDir, { recursive: true });
      await U.fsp.rename(file, path.join(disabledDir, path.basename(file)));
    }
    return true;
  }
  if (IS_WIN) {
    const disabled = store.get('disabledStartup') || {};
    if (item.id.startsWith('reg:')) {
      if (!enable) {
        const cmd = `reg delete "${item.key}" /v "${item.valueName}" /f`;
        const r = item.admin ? await U.runAdmin(cmd) : await U.run('reg', ['delete', item.key, '/v', item.valueName, '/f']);
        if (!r.ok) return false;
        disabled[item.id] = { name: item.name, command: item.command, kind: item.kind, scope: item.scope, key: item.key, valueName: item.valueName, valueType: item.valueType, admin: item.admin };
      } else {
        const d = disabled[item.id];
        const args = ['add', d.key, '/v', d.valueName, '/t', d.valueType || 'REG_SZ', '/d', d.command, '/f'];
        const r = d.admin ? await U.runAdmin('reg ' + args.map(a => `"${a.replace(/"/g, '\\"')}"`).join(' ')) : await U.run('reg', args);
        if (!r.ok) return false;
        delete disabled[item.id];
      }
      store.set('disabledStartup', disabled);
      return true;
    }
    if (item.id.startsWith('fold:')) {
      const f = item.file;
      const dest = enable ? f.replace(/\.disabled$/, '') : f + '.disabled';
      if (item.admin) return (await U.runAdmin(`move /y "${f}" "${dest}"`)).ok;
      await U.fsp.rename(f, dest); return true;
    }
    if (item.id.startsWith('task:')) return (await U.runAdmin(`schtasks /Change /TN "${item.taskPath}${item.taskName}" /${enable ? 'ENABLE' : 'DISABLE'}`)).ok;
  }
  return false;
}

async function removeStartup(item) {
  if (IS_MAC && item.id.startsWith('li:')) return (await U.run('osascript', ['-e', `tell application "System Events" to delete login item "${item.name.replace(/"/g, '')}"`])).ok;
  if (IS_MAC && item.id.startsWith('la:')) {
    if (item.admin) return (await U.runAdmin(`launchctl unload -w "${item.file}"; rm -f "${item.file}"`)).ok;
    await U.run('launchctl', ['unload', '-w', item.file]);
    await U.fsp.rm(item.file, { force: true }); return true;
  }
  if (IS_LINUX && item.id.startsWith('xdg:')) { await U.fsp.rm(item.file, { force: true }); return true; }
  if (IS_WIN) {
    if (item.id.startsWith('reg:')) {
      const disabled = store.get('disabledStartup') || {};
      if (disabled[item.id]) { delete disabled[item.id]; store.set('disabledStartup', disabled); return true; }
      return item.admin ? (await U.runAdmin(`reg delete "${item.key}" /v "${item.valueName}" /f`)).ok : (await U.run('reg', ['delete', item.key, '/v', item.valueName, '/f'])).ok;
    }
    if (item.id.startsWith('fold:')) { if (item.admin) return (await U.runAdmin(`del /f /q "${item.file}"`)).ok; await U.fsp.rm(item.file, { force: true }); return true; }
  }
  return false;
}

// ---------------- Tareas de mantenimiento ----------------
function tasks() {
  const T = [];
  const t = (o) => T.push({ admin: false, recommended: false, ...o });
  if (IS_MAC) {
    t({ id: 'free-ram', name: 'Liberar memoria RAM', desc: 'Purga la memoria inactiva para dar espacio a nuevas apps.', admin: true, recommended: true, cmd: 'purge' });
    t({ id: 'flush-dns', name: 'Vaciar caché DNS', desc: 'Resuelve problemas de conexión y páginas que no cargan.', admin: true, recommended: true, cmd: 'dscacheutil -flushcache; killall -HUP mDNSResponder' });
    t({ id: 'scripts', name: 'Scripts de mantenimiento', desc: 'Rota registros y depura bases temporales del sistema.', admin: true, recommended: true, cmd: 'periodic daily weekly monthly 2>/dev/null || true' });
    t({ id: 'spotlight', name: 'Reindexar Spotlight', desc: 'Arregla búsquedas lentas o incompletas.', admin: true, cmd: 'mdutil -E /' });
    t({ id: 'launchservices', name: 'Reconstruir Launch Services', desc: 'Corrige menús "Abrir con" duplicados.', cmd: '/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -kill -r -domain local -domain system -domain user' });
    t({ id: 'permissions', name: 'Reparar permisos de usuario', desc: 'Restablece los permisos de tu carpeta personal.', cmd: 'diskutil resetUserPermissions / $(id -u)' });
    t({ id: 'verify-disk', name: 'Verificar disco de arranque', desc: 'Comprueba la integridad del volumen.', cmd: 'diskutil verifyVolume /' });
    t({ id: 'tm-thin', name: 'Adelgazar instantáneas de Time Machine', desc: 'Libera espacio de instantáneas locales.', admin: true, cmd: 'tmutil thinlocalsnapshots / 999999999999 4' });
    t({ id: 'fonts', name: 'Limpiar caché de fuentes', desc: 'Corrige fuentes corruptas o que no se ven.', admin: true, cmd: 'atsutil databases -remove' });
    t({ id: 'quicklook', name: 'Restablecer Vista Rápida', desc: 'Regenera miniaturas de Quick Look.', cmd: 'qlmanage -r cache; qlmanage -r' });
  }
  if (IS_LINUX) {
    t({ id: 'free-ram', name: 'Liberar memoria RAM', desc: 'Sincroniza discos y vacía cachés de página del kernel.', admin: true, recommended: true, cmd: 'sync; echo 3 > /proc/sys/vm/drop_caches' });
    t({ id: 'flush-dns', name: 'Vaciar caché DNS', desc: 'Limpia la caché de systemd-resolved.', recommended: true, cmd: 'resolvectl flush-caches 2>/dev/null || systemd-resolve --flush-caches 2>/dev/null || true' });
    t({ id: 'trim', name: 'Optimizar SSD (TRIM)', desc: 'Informa al SSD de los bloques libres.', admin: true, recommended: true, cmd: 'fstrim -av' });
    t({ id: 'autoremove', name: 'Quitar paquetes huérfanos', desc: 'Elimina dependencias que ya nadie usa.', admin: true, cmd: 'command -v apt-get >/dev/null && apt-get -y autoremove; command -v dnf >/dev/null && dnf -y autoremove; command -v pacman >/dev/null && (pacman -Qdtq | pacman -Rns --noconfirm - ); command -v zypper >/dev/null && zypper -n rm -u; true' });
    t({ id: 'flatpak', name: 'Quitar runtimes Flatpak sin uso', desc: 'Libera espacio de runtimes huérfanos.', cmd: 'flatpak uninstall --unused -y 2>/dev/null || true' });
    t({ id: 'snap-old', name: 'Quitar revisiones viejas de Snap', desc: 'Elimina versiones deshabilitadas de snaps.', admin: true, cmd: "snap list --all 2>/dev/null | awk '/disabled/{print $1, $3}' | while read n r; do snap remove \"$n\" --revision=\"$r\"; done; true" });
    t({ id: 'fonts', name: 'Reconstruir caché de fuentes', desc: 'Ejecuta fc-cache.', cmd: 'fc-cache -f' });
    t({ id: 'locate', name: 'Actualizar base de búsqueda', desc: 'Reindexa la base de locate/plocate.', admin: true, cmd: 'updatedb' });
    t({ id: 'journal', name: 'Compactar diario del sistema', desc: 'Deja solo 7 días de registros.', admin: true, cmd: 'journalctl --vacuum-time=7d' });
  }
  if (IS_WIN) {
    t({ id: 'flush-dns', name: 'Vaciar caché DNS', desc: 'ipconfig /flushdns.', recommended: true, cmd: 'ipconfig /flushdns' });
    t({ id: 'free-ram', name: 'Liberar memoria RAM', desc: 'Recorta el conjunto de trabajo de los procesos.', recommended: true, ps: "Add-Type -Namespace W -Name P -MemberDefinition '[DllImport(\"psapi.dll\")] public static extern bool EmptyWorkingSet(IntPtr h);'; Get-Process | ForEach-Object { try { [W.P]::EmptyWorkingSet($_.Handle) | Out-Null } catch {} }" });
    t({ id: 'optimize', name: 'Optimizar unidades', desc: 'TRIM en SSD o desfragmentación en HDD.', admin: true, recommended: true, cmd: 'defrag C: /O' });
    t({ id: 'sfc', name: 'Reparar archivos del sistema (SFC)', desc: 'Verifica y repara archivos protegidos.', admin: true, cmd: 'sfc /scannow' });
    t({ id: 'dism', name: 'Limpieza de componentes (DISM)', desc: 'Reduce la carpeta WinSxS.', admin: true, cmd: 'DISM /Online /Cleanup-Image /StartComponentCleanup' });
    t({ id: 'dism-repair', name: 'Reparar imagen de Windows', desc: 'DISM /RestoreHealth.', admin: true, cmd: 'DISM /Online /Cleanup-Image /RestoreHealth' });
    t({ id: 'icons', name: 'Reconstruir caché de iconos', desc: 'Corrige iconos en blanco o equivocados.', cmd: 'ie4uinit.exe -show' });
    t({ id: 'winsock', name: 'Restablecer red (Winsock)', desc: 'Repara la pila de red. Requiere reiniciar.', admin: true, cmd: 'netsh winsock reset' });
    t({ id: 'store-cache', name: 'Restablecer caché de Microsoft Store', desc: 'wsreset.', cmd: 'wsreset.exe' });
  }
  return T;
}

async function runTask(id) {
  const t = tasks().find(x => x.id === id);
  if (!t) return { ok: false, error: 'Tarea desconocida' };
  let r;
  if (t.ps) r = await U.ps(t.ps, { timeout: 600000 });
  else if (t.admin) r = await U.runAdmin(t.cmd);
  else r = await U.runShell(t.cmd, { timeout: 1800000 });
  store.addHistory({ type: 'mantenimiento', detail: t.name + (r.ok ? ' ✓' : ' ✗') });
  return { ok: r.ok, output: (r.stdout || '') + (r.stderr || ''), error: r.error };
}

// ---------------- Procesos pesados ----------------
async function heavyProcesses() {
  const si = require('systeminformation');
  const p = await si.processes();
  const list = p.list.filter(x => x.pid !== process.pid && x.name);
  const byMem = [...list].sort((a, b) => b.memRss - a.memRss).slice(0, 15);
  const byCpu = [...list].sort((a, b) => b.cpu - a.cpu).slice(0, 15);
  const pick = x => ({ pid: x.pid, name: x.name, cpu: +x.cpu.toFixed(1), mem: x.memRss * 1024, user: x.user, command: x.command });
  return { byMem: byMem.map(pick), byCpu: byCpu.map(pick), total: p.all };
}

function killProcess(pid) {
  try { process.kill(pid); return true; } catch { return false; }
}

module.exports = { listStartup, toggleStartup, removeStartup, tasks, runTask, heavyProcesses, killProcess, parseDesktop };
