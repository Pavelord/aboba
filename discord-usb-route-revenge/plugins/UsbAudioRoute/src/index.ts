declare const vendetta: any;

const USB_TYPES = new Set([11, 12, 22]); // USB_DEVICE, USB_ACCESSORY, USB_HEADSET

let stopped = true;
let timer: ReturnType<typeof setInterval> | undefined;
let startupTimer: ReturnType<typeof setTimeout> | undefined;
let audioModule: any;
let usbDevice: any;
let unpatch: (() => void) | undefined;
let moduleToastShown = false;
let deviceToastId = -1;
let tickBusy = false;
let attempts = 0;

function log(...args: any[]) {
  try { console.log("[USBRouteV2]", ...args); } catch {}
}

function safeToast(message: string) {
  try {
    const fn = vendetta?.ui?.toasts?.showToast;
    if (typeof fn === "function") fn(message);
  } catch (error) {
    log("toast failed", error);
  }
}

function getReactNative(): any {
  try {
    return vendetta?.metro?.common?.ReactNative ?? null;
  } catch (error) {
    log("ReactNative lookup failed", error);
    return null;
  }
}

function findAudioModule(): any {
  const reactNative = getReactNative();
  const nativeModules = reactNative?.NativeModules;
  const turboRegistry = reactNative?.TurboModuleRegistry;
  const names = [
    "NativeAudioManagerModule",
    "RTNAudioManager",
    "InCallManager",
    "AudioManager",
    "DCDAudioManager",
  ];

  for (const name of names) {
    try {
      const candidate = turboRegistry?.get?.(name) ?? nativeModules?.[name];
      if (
        candidate &&
        typeof candidate.getAudioDevices === "function" &&
        typeof candidate.setActiveAudioDevice === "function"
      ) {
        log("found audio module", name);
        return candidate;
      }
    } catch (error) {
      log("module lookup failed", name, error);
    }
  }

  return null;
}

function isUsbDevice(device: any): boolean {
  if (!device || typeof device !== "object") return false;
  const type = Number(device.deviceType);
  const simple = String(device.simpleDeviceType ?? "").toUpperCase();
  const name = String(device.deviceName ?? "").toLowerCase();
  return (
    USB_TYPES.has(type) ||
    simple.includes("USB") ||
    name.includes("usb audio") ||
    name.includes("usb headset") ||
    name.includes("usb-гарнит")
  );
}

function isBuiltinDevice(device: any): boolean {
  if (!device || typeof device !== "object") return false;
  const simple = String(device.simpleDeviceType ?? "").toUpperCase();
  const name = String(device.deviceName ?? "").toLowerCase();
  return (
    simple === "SPEAKERPHONE" ||
    simple === "EARPIECE" ||
    name.includes("speaker") ||
    name.includes("earpiece") ||
    name.includes("динамик")
  );
}

async function readDevices(): Promise<any[]> {
  if (!audioModule || typeof audioModule.getAudioDevices !== "function") return [];
  try {
    const result = await Promise.resolve(audioModule.getAudioDevices());
    return Array.isArray(result) ? result : [];
  } catch (error) {
    log("getAudioDevices failed", error);
    return [];
  }
}

async function refreshUsbDevice(): Promise<any | undefined> {
  const devices = await readDevices();
  const found = devices.find(isUsbDevice);
  usbDevice = found;

  if (found) {
    const id = Number(found.deviceId ?? -1);
    if (id !== deviceToastId) {
      deviceToastId = id;
      safeToast(`USB Route: найдена ${found.deviceName ?? "USB-гарнитура"}`);
      log("USB device", JSON.stringify(found));
    }
  }

  return found;
}

async function getActiveDevice(): Promise<any | undefined> {
  if (!audioModule || typeof audioModule.getActiveAudioDevice !== "function") return undefined;
  try {
    return await Promise.resolve(audioModule.getActiveAudioDevice());
  } catch (error) {
    log("getActiveAudioDevice failed", error);
    return undefined;
  }
}

async function applyRoute(reason: string): Promise<void> {
  if (stopped || !audioModule) return;
  const target = usbDevice ?? await refreshUsbDevice();
  if (!target) return;

  const active = await getActiveDevice();
  if (active && isUsbDevice(active)) return;

  try {
    await Promise.resolve(audioModule.setActiveAudioDevice(target));
    log("route applied", reason, JSON.stringify(target));
  } catch (error) {
    log("setActiveAudioDevice failed", reason, error);
  }
}

function installPatch() {
  if (unpatch || !audioModule) return;

  try {
    const instead = vendetta?.patcher?.instead;
    if (typeof instead !== "function") {
      log("patcher unavailable; polling remains active");
      return;
    }

    unpatch = instead(
      "setActiveAudioDevice",
      audioModule,
      (args: any[], original: (...originalArgs: any[]) => any) => {
        try {
          const requested = args?.[0];
          if (usbDevice && isBuiltinDevice(requested)) {
            log("replacing built-in route with USB", JSON.stringify(requested));
            return original(usbDevice);
          }
        } catch (error) {
          log("route interception failed", error);
        }
        return original(...(args ?? []));
      },
    );
    log("setActiveAudioDevice patched");
  } catch (error) {
    unpatch = undefined;
    log("patch installation failed; polling remains active", error);
  }
}

async function tick() {
  if (stopped || tickBusy) return;
  tickBusy = true;
  attempts++;

  try {
    if (!audioModule) {
      audioModule = findAudioModule();
      if (audioModule) {
        installPatch();
        if (!moduleToastShown) {
          moduleToastShown = true;
          safeToast("USB Route: аудиомодуль Discord найден");
        }
      } else if (attempts === 8) {
        safeToast("USB Route включён, ожидаю аудиомодуль Discord");
      }
    }

    if (audioModule) {
      await refreshUsbDevice();
      await applyRoute("periodic check");
    }
  } catch (error) {
    // Never let an audio/API error disable the Revenge plugin switch.
    log("tick failed", error);
  } finally {
    tickBusy = false;
  }
}

export function onLoad() {
  // Keep onLoad synchronous and never throw: Revenge disables a plugin when startup throws.
  try {
    stopped = false;
    attempts = 0;
    moduleToastShown = false;
    deviceToastId = -1;
    audioModule = undefined;
    usbDevice = undefined;
    tickBusy = false;

    safeToast("USB Call Audio Route v2 включён");
    startupTimer = setTimeout(() => { void tick(); }, 250);
    timer = setInterval(() => { void tick(); }, 1000);
  } catch (error) {
    // Intentionally swallow startup failures so the switch stays enabled and logs remain inspectable.
    log("onLoad guarded failure", error);
  }
}

export function onUnload() {
  stopped = true;

  try {
    if (startupTimer) clearTimeout(startupTimer);
    if (timer) clearInterval(timer);
  } catch {}

  startupTimer = undefined;
  timer = undefined;

  try { unpatch?.(); } catch (error) { log("unpatch failed", error); }
  unpatch = undefined;
  audioModule = undefined;
  usbDevice = undefined;
  tickBusy = false;
  deviceToastId = -1;
  log("disabled");
}
