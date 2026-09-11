import express from 'express';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { exec, execSync } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface HardwareDeps {
  requireAdmin: (req: any, res: any, next: () => void) => void;
  recordEvent: (type: string, message: string, container?: string, id?: string) => void;
}

const CPU_BASE = '/sys/devices/system/cpu';
const HWMON_BASE = '/sys/class/hwmon';
const THINKPAD_FAN = '/proc/acpi/ibm/fan';

function readFileSafe(p: string): string | null {
  try {
    return fs.readFileSync(p, 'utf-8').trim();
  } catch {
    return null;
  }
}

function writeFileSafe(p: string, value: string): string | null {
  try {
    fs.writeFileSync(p, value + '\n', 'utf-8');
    return null;
  } catch (e: any) {
    return e?.message || 'Error writing sysfs-файл';
  }
}

function listCpus() {
  const cpus: { index: number; cpufreqDir: string | null }[] = [];
  try {
    for (const entry of fs.readdirSync(CPU_BASE)) {
      if (!/^cpu\d+$/.test(entry)) continue;
      const index = Number(entry.slice(3));
      const cpufreqDir = path.join(CPU_BASE, entry, 'cpufreq');
      cpus.push({ index, cpufreqDir: fs.existsSync(cpufreqDir) ? cpufreqDir : null });
    }
  } catch {
    // sysfs недоступен
  }
  return cpus.sort((a, b) => a.index - b.index);
}

function getCpuStatus() {
  const cpus = listCpus();
  let availableGovernors: string[] = [];
  const governorSet = new Set<string>();
  const freqSet = new Set<string>();

  const info = cpus.map((cpu) => {
    const dir = cpu.cpufreqDir;
    const governor = dir ? readFileSafe(path.join(dir, 'scaling_governor')) : null;
    const available = dir ? readFileSafe(path.join(dir, 'scaling_available_governors')) : null;
    const cur = dir ? readFileSafe(path.join(dir, 'scaling_cur_freq')) : null;
    const min = dir ? readFileSafe(path.join(dir, 'scaling_min_freq')) : null;
    const max = dir ? readFileSafe(path.join(dir, 'scaling_max_freq')) : null;
    const cpuMax = dir ? readFileSafe(path.join(dir, 'cpuinfo_max_freq')) : null;
    const hasSetspeed = dir ? fs.existsSync(path.join(dir, 'scaling_setspeed')) : false;

    if (governor) governorSet.add(governor);
    if (available) {
      for (const g of available.split(/\s+/)) if (g) availableGovernors.push(g);
    }
    freqSet.add(`${min}-${max}`);

    return {
      index: cpu.index,
      supported: Boolean(dir),
      governor,
      curMhz: cur ? Math.round(Number(cur) / 1000) : null,
      minMhz: min ? Math.round(Number(min) / 1000) : null,
      maxMhz: max ? Math.round(Number(max) / 1000) : null,
      cpuMaxMhz: cpuMax ? Math.round(Number(cpuMax) / 1000) : null,
      hasSetspeed,
    };
  });

  // De-duplicate available governors preserving order
  availableGovernors = Array.from(new Set(availableGovernors));

  let writable = true;
  try {
    const probe = cpus.find((c) => c.cpufreqDir);
    if (probe?.cpufreqDir) {
      fs.accessSync(path.join(probe.cpufreqDir, 'scaling_governor'), fs.constants.W_OK);
    } else {
      writable = false;
    }
  } catch {
    writable = false;
  }

  return { cpus: info, supported: info.some((c) => c.supported), availableGovernors, writable };
}

function applyToCores(cores: number[], fn: (cpuIndex: number, cpufreqDir: string) => string | null) {
  const results: { index: number; error: string | null }[] = [];
  const all = listCpus();
  const targets = cores?.length ? cores : all.map((c) => c.index);
  for (const target of targets) {
    const cpu = all.find((c) => c.index === target);
    if (!cpu || !cpu.cpufreqDir) {
      results.push({ index: target, error: 'cpufreq не поддерживается для этого ядра' });
      continue;
    }
    const err = fn(cpu.index, cpu.cpufreqDir);
    results.push({ index: target, error: err });
  }
  return results;
}

export function registerHardwareRoutes(app: express.Express, deps: HardwareDeps): void {
  const { requireAdmin, recordEvent } = deps;

  // ---------- CPU ----------
  app.get('/api/hardware/cpu', (req, res) => {
    const status = getCpuStatus();
    const first = status.cpus[0];
    res.json({
      ...status,
      platform: os.platform(),
      model: getCpuModel(),
      currentGovernor: first?.governor || null,
      constants: first ? { minMhz: first.minMhz, maxMhz: first.cpuMaxMhz || first.maxMhz } : null,
    });
  });

  app.post('/api/hardware/cpu/governor', requireAdmin, (req, res) => {
    const governor = String(req.body?.governor || '').trim();
    if (!governor) return res.status(400).json({ error: 'Не указан governor' });
    const status = getCpuStatus();
    if (!status.availableGovernors.includes(governor)) {
      return res.status(400).json({
        error: `Governor "${governor}" недоступен. Доступные: ${status.availableGovernors.join(', ')}`,
        availableGovernors: status.availableGovernors,
      });
    }
    const results = applyToCores([], (i, dir) => writeFileSafe(path.join(dir, 'scaling_governor'), governor));
    const failed = results.filter((r) => r.error);
    if (failed.length === results.length) {
      return res.status(400).json({ error: `Не удалось применить governor: ${failed[0].error}`, results });
    }
    const firstError = failed[0]?.error || null;
    recordEvent('hardware', `Governor CPU → ${governor}${firstError ? ' (частично)' : ''}`);
    res.json({ success: true, governor, results, partialError: firstError, message: `Governor установлен: ${governor}` });
  });

  app.post('/api/hardware/cpu/frequency', requireAdmin, async (req, res) => {
    const mhz = Number(req.body?.mhz);
    const cores: number[] = req.body?.cores || [];
    if (!mhz || mhz <= 0) return res.status(400).json({ error: 'Укажите частоту в МГц больше 0' });
    const status = getCpuStatus();
    const first = status.cpus[0];
    const min = first?.minMhz || 0;
    const max = first?.cpuMaxMhz || first?.maxMhz || Number.MAX_SAFE_INTEGER;
    if (mhz < min || mhz > max) {
      return res.status(400).json({ error: `Частота ${mhz} МГц вне диапазона [${min} .. ${max}] МГц` });
    }
    let canExact = false;
    try {
      const probe = (listCpus().find((c) => c.cpufreqDir));
      if (probe?.cpufreqDir) {
        fs.accessSync(path.join(probe.cpufreqDir, 'scaling_setspeed'), fs.constants.W_OK);
        canExact = true;
      }
    } catch { canExact = false; }

    const results = applyToCores(mhz !== undefined ? cores : [], (i, dir) => {
      const gErr = writeFileSafe(path.join(dir, 'scaling_governor'), 'userspace');
      if (gErr) return `governor: ${gErr}`;
      if (canExact) {
        return writeFileSafe(path.join(dir, 'scaling_setspeed'), String(mhz * 1000));
      }
      // Fallback — жёсткий потолок частоты
      return writeFileSafe(path.join(dir, 'scaling_max_freq'), String(mhz * 1000));
    });

    const failed = results.filter((r) => r.error);
    if (failed.length === results.length) {
      return res.status(400).json({ error: `Не удалось задать частоту: ${failed[0].error}`, results });
    }
    recordEvent('hardware', `Частота ядер ${cores.length ? `[${cores.join(',')}]` : '(всех)'} → ${mhz} МГц (${canExact ? 'userspace' : 'max-freq cap'})`);
    res.json({
      success: true,
      mhz,
      mode: canExact ? 'exact' : 'cap',
      results,
      partialError: failed[0]?.error || null,
      message: `Ядро${cores.length === 1 ? '' : 'а'} принудительно на ${mhz} МГц`,
    });
  });

  app.post('/api/hardware/cpu/limits', requireAdmin, (req, res) => {
    const minMhz = req.body?.minMhz !== undefined ? Number(req.body.minMhz) : null;
    const maxMhz = req.body?.maxMhz !== undefined ? Number(req.body.maxMhz) : null;
    if (minMhz === null && maxMhz === null) {
      return res.status(400).json({ error: 'Укажите minMhz и/или maxMhz' });
    }
    const results = applyToCores([], (i, dir) => {
      let err: string | null = null;
      if (minMhz !== null && minMhz > 0) err = writeFileSafe(path.join(dir, 'scaling_min_freq'), String(minMhz * 1000));
      if (!err && maxMhz !== null && maxMhz > 0) err = writeFileSafe(path.join(dir, 'scaling_max_freq'), String(maxMhz * 1000));
      return err;
    });
    const failed = results.filter((r) => r.error);
    if (failed.length === results.length) {
      return res.status(400).json({ error: `Не удалось задать лимиты: ${failed[0].error}`, results });
    }
    recordEvent('hardware', `Лимиты частоты CPU: ${minMhz ?? '—'}..${maxMhz ?? '—'} МГц`);
    res.json({ success: true, minMhz, maxMhz, results, partialError: failed[0]?.error || null });
  });

  // ---------- Fans ----------
  app.get('/api/hardware/fans', (req, res) => {
    try {
      const fans: any[] = [];
      let pwmCount = 0;
      for (const hw of fs.readdirSync(HWMON_BASE)) {
        const hwDir = path.join(HWMON_BASE, hw);
        const name = readFileSafe(path.join(hwDir, 'name'));
        const item: any = { hwmon: hw, driver: name || 'unknown', fanInputs: [], pwm: [] };
        let ok = false;
        for (const f of fs.readdirSync(hwDir)) {
          const m = f.match(/^fan(\d+)_input$/);
          if (m) {
            const rpm = readFileSafe(path.join(hwDir, f));
            const label = readFileSafe(path.join(hwDir, `fan${m[1]}_label`));
            item.fanInputs.push({ channel: Number(m[1]), rpm: rpm ? Number(rpm) : null, label });
            ok = true;
          }
          const p = f.match(/^pwm(\d+)$/);
          if (p) {
            const val = readFileSafe(path.join(hwDir, f));
            const enable = readFileSafe(path.join(hwDir, `pwm${p[1]}_enable`));
            item.pwm.push({ channel: Number(p[1]), value: val !== null ? Number(val) : null, enable: enable !== null ? Number(enable) : null });
            pwmCount++;
            ok = true;
          }
        }
        if (ok || name) fans.push(item);
      }

      const thinkpadAvailable = fs.existsSync(THINKPAD_FAN);
      let thinkpadStatus: string | null = null;
      if (thinkpadAvailable) {
        thinkpadStatus = readFileSafe(THINKPAD_FAN) || null;
      }

      res.json({
        fans,
        pwmCount,
        thinkpad: {
          available: thinkpadAvailable,
          status: thinkpadStatus,
        },
      });
    } catch (err: any) {
      res.status(400).json({ error: err?.message || 'Ошибка чтения hwmon', fans: [], thinkpad: { available: false } });
    }
  });

  app.post('/api/hardware/fans/pwm', requireAdmin, (req, res) => {
    const hwmon = String(req.body?.hwmon || '');
    const channel = Number(req.body?.channel);
    const percent = Number(req.body?.percent);
    if (!hwmon || !channel || isNaN(percent) || percent < 0 || percent > 100) {
      return res.status(400).json({ error: 'hwmon/channel/percent (0-100) обязательны' });
    }
    const pwmPath = path.join(HWMON_BASE, hwmon, `pwm${channel}`);
    const enablePath = path.join(HWMON_BASE, hwmon, `pwm${channel}_enable`);
    if (!fs.existsSync(pwmPath)) {
      return res.status(400).json({ error: `PWM канал ${channel} в ${hwmon} не найден` });
    }
    const duty = Math.round((percent / 100) * 255);
    const manualErr = writeFileSafe(enablePath, '1'); // manual mode
    const writeErr = writeFileSafe(pwmPath, String(duty));
    if (writeErr) {
      return res.status(400).json({ error: `Не удалось записать PWM: ${writeErr}` });
    }
    recordEvent('hardware', `Вентилятор ${hwmon}/pwm${channel} → ${percent}%`);
    res.json({ success: true, hwmon, channel, percent, duty, manualMode: !manualErr, message: `Скорость вентилятора: ${percent}%` });
  });

  app.post('/api/hardware/fans/pwm-auto', requireAdmin, (req, res) => {
    const hwmon = String(req.body?.hwmon || '');
    const channel = Number(req.body?.channel);
    const enablePath = path.join(HWMON_BASE, hwmon, `pwm${channel}_enable`);
    if (!fs.existsSync(enablePath)) {
      return res.status(400).json({ error: `PWM ${channel} не найден` });
    }
    const err = writeFileSafe(enablePath, '2'); // auto mode
    if (err) return res.status(400).json({ error: `Не удалось включить авто-режим: ${err}` });
    recordEvent('hardware', `Вентилятор ${hwmon}/pwm${channel} → авто`);
    res.json({ success: true, message: 'Автоматический режим работы вентилятора включён' });
  });

  app.post('/api/hardware/fans/thinkpad-level', requireAdmin, (req, res) => {
    const level = String(req.body?.level || 'auto').trim();
    const valid = level === 'auto' || level === 'disengaged' || /^[0-7]$/.test(level);
    if (!valid) return res.status(400).json({ error: 'Level: auto | disengaged | 0..7' });
    if (!fs.existsSync(THINKPAD_FAN)) {
      return res.status(400).json({ error: 'Контроллер ноутбучного вентилятора thinkpad_acpi не найден' });
    }
    try {
      execSyncSafe(`echo enable > ${THINKPAD_FAN}`);
      execSyncSafe(`echo "level ${level}" > ${THINKPAD_FAN}`);
      recordEvent('hardware', `Ноутбучный вентилятор ThinkPad → level ${level}`);
      res.json({ success: true, level, message: `Уровень вентилятора ThinkPad: ${level}` });
    } catch (e: any) {
      res.status(400).json({ error: e?.message || 'Не удалось изменить уровень вентилятора' });
    }
  });

  // ---------- Swap ----------
  function readSwaps() {
    const swaps: { filename: string; type: string; sizeMb: number; usedMb: number; priority: number }[] = [];
    try {
      const content = fs.readFileSync('/proc/swaps', 'utf-8');
      const lines = content.split('\n').slice(1);
      for (const line of lines) {
        if (!line.trim()) continue;
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 5) {
          const sizeKb = Number(parts[2]) || 0;
          const usedKb = Number(parts[3]) || 0;
          swaps.push({
            filename: parts[0],
            type: parts[1],
            sizeMb: Math.round(sizeKb / 1024),
            usedMb: Math.round(usedKb / 1024),
            priority: Number(parts[4]) || 0,
          });
        }
      }
    } catch { /* no /proc/swaps */ }
    return swaps;
  }

  function dfFreeMb(target: string): number | null {
    try {
      const out = execSyncSafe(`df -k -P "${target}" | tail -1 | awk '{print $4}' `);
      return Math.round((Number(out) || 0) / 1024);
    } catch {
      return null;
    }
  }

  function execSyncSafe(cmd: string): string {
    return execSync(cmd, { timeout: 120000, encoding: 'utf-8' });
  }

  app.get('/api/hardware/swap', (req, res) => {
    try {
      const swaps = readSwaps();
      const totalMb = swaps.reduce((acc, s) => acc + s.sizeMb, 0);
      const usedMb = swaps.reduce((acc, s) => acc + s.usedMb, 0);
      const freeRootMb = dfFreeMb('/');
      const fstab = fs.existsSync('/etc/fstab') ? (readFileSafe('/etc/fstab') || '') : '';
      res.json({
        swaps,
        totalMb,
        usedMb,
        freeRootMb,
        persistentFiles: swaps.map((s) => s.filename).filter((f) => fstab.includes(f)),
        platform: os.platform(),
      });
    } catch (err: any) {
      res.status(400).json({ error: err?.message || 'Ошибка чтения swap' });
    }
  });

  app.post('/api/hardware/swap/create', requireAdmin, (req, res) => {
    const sizeMb = Number(req.body?.sizeMb);
    const swapPath = String(req.body?.path || '/swapfile').trim();
    const persist = Boolean(req.body?.persist);
    if (!sizeMb || sizeMb <= 0) return res.status(400).json({ error: 'Укажите размер swap в МБ больше 0' });
    try {
      if (readSwaps().some((s) => s.filename === swapPath)) {
        return res.status(400).json({ error: `Swap "${swapPath}" уже активен` });
      }
      if (fs.existsSync(swapPath)) {
        return res.status(400).json({ error: `Файл "${swapPath}" уже существует` });
      }
      const dir = path.dirname(swapPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      const out: string[] = [];
      try {
        out.push(execSyncSafe(`fallocate -l ${sizeMb}M ${swapPath}`));
      } catch {
        execSyncSafe(`dd if=/dev/zero of=${swapPath} bs=1M count=${sizeMb} status=progress`);
        out.push('(fallocate недоступен — использован dd)');
      }
      execSyncSafe(`chmod 600 ${swapPath}`);
      execSyncSafe(`mkswap ${swapPath}`);
      execSyncSafe(`swapon ${swapPath}`);
      if (persist) {
        const line = `${swapPath} none swap sw 0 0`;
        const fstabPath = '/etc/fstab';
        const existing = readFileSafe(fstabPath) || '';
        if (!existing.includes(swapPath)) {
          fs.writeFileSync(fstabPath, existing.trimEnd() + '\n' + line + '\n', 'utf-8');
          out.push('Добавлено в /etc/fstab');
        }
      }
      recordEvent('hardware', `Swap создан: ${swapPath} (${sizeMb} МБ${persist ? ', постоянный' : ''})`);
      res.json({ success: true, swaps: readSwaps(), sizeMb, swapPath, persist, output: out.join('\n').trim(), message: `Swap ${sizeMb} МБ создан и активирован (${swapPath})` });
    } catch (e: any) {
      res.status(400).json({ error: e?.message || 'Не удалось создать swap' });
    }
  });

  app.post('/api/hardware/swap/activate', requireAdmin, (req, res) => {
    const swapPath = String(req.body?.path || '');
    if (!swapPath) return res.status(400).json({ error: 'Укажите путь к swap' });
    try {
      execSyncSafe(`swapon ${swapPath}`);
      recordEvent('hardware', `Swap активирован: ${swapPath}`);
      res.json({ success: true, swaps: readSwaps(), message: `Swap активирован: ${swapPath}` });
    } catch (e: any) {
      res.status(400).json({ error: e?.message || 'Не удалось включить swap' });
    }
  });

  app.post('/api/hardware/swap/deactivate', requireAdmin, (req, res) => {
    const swapPath = String(req.body?.path || '');
    if (!swapPath) return res.status(400).json({ error: 'Укажите путь к swap' });
    try {
      execSyncSafe(`swapoff ${swapPath}`);
      recordEvent('hardware', `Swap отключён: ${swapPath}`);
      res.json({ success: true, swaps: readSwaps(), message: `Swap отключён: ${swapPath}` });
    } catch (e: any) {
      res.status(400).json({ error: e?.message || 'Не удалось отключить swap' });
    }
  });

  app.post('/api/hardware/swap/remove', requireAdmin, (req, res) => {
    const swapPath = String(req.body?.path || '');
    if (!swapPath.startsWith('/')) return res.status(400).json({ error: 'Некорректный путь' });
    if (!fs.existsSync(swapPath)) return res.status(400).json({ error: `Файл ${swapPath} не найден` });
    try {
      execSyncSafe(`swapoff ${swapPath} 2>/dev/null || true`);
      execSyncSafe(`rm -f ${swapPath}`);
      // remove fstab line
      const fstabPath = '/etc/fstab';
      if (fs.existsSync(fstabPath)) {
        const content = readFileSafe(fstabPath) || '';
        const filtered = content.split('\n').filter((l) => !l.includes(swapPath)).join('\n');
        fs.writeFileSync(fstabPath, filtered, 'utf-8');
      }
      recordEvent('hardware', `Swap удалён: ${swapPath}`);
      res.json({ success: true, swaps: readSwaps(), message: `Swap-файл удалён: ${swapPath}` });
    } catch (e: any) {
      res.status(400).json({ error: e?.message || 'Не удалось удалить swap' });
    }
  });
}

function getCpuModel(): string | null {
  try {
    const info = os.cpus();
    if (info.length > 0) return info[0].model.trim();
  } catch {
    // ignore
  }
  return null;
}