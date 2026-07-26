let timer = null;
let stopped = true;
let audioModule = null;
let usbDevice = null;
let shownModule = false;
let shownUsbId = null;

function getApi() {
  try {
    return globalThis.vendetta || globalThis.revenge || globalThis.bunny || null;
  } catch (_) {
    return null;
  }
}

function toast(message) {
  try {
    const api = getApi();
    const fn = api && api.ui && api.ui.toasts && api.ui.toasts.showToast;
    if (typeof fn === "function") fn(message);
  } catch (_) {}
}

function log(...args) {
  try {
    console.log("[USBRouteV3]", ...args);
  } catch (_) {}
}

function getReactNative() {
  try {
    const api = getApi();
    return api && api.metro && api.metro.common && api.metro.common.ReactNative
      ? api.metro.common.ReactNative
      : null;
  } catch (_) {
    return null;
  }
}

function findAudioModule() {
  const rn = getReactNative();
  if (!rn) return null;

  const names = [
    "NativeAudioManagerModule",
    "RTNAudioManager",
    "InCallManager",
    "AudioManager",
    "DCDAudioManager"
  ];

  for (const name of names) {
    try {
      const turbo = rn.TurboModuleRegistry;
      const native = rn.NativeModules;
      const candidate =
        (turbo && typeof turbo.get === "function" ? turbo.get(name) : null) ||
        (native ? native[name] : null);

      if (
        candidate &&
        typeof candidate.getAudioDevices === "function" &&
        typeof candidate.setActiveAudioDevice === "function"
      ) {
        log("found module", name);
        return candidate;
      }
    } catch (error) {
      log("module lookup failed", name, error);
    }
  }

  return null;
}

function isUsb(device) {
  if (!device || typeof device !== "object") return false;
  const type = Number(device.deviceType);
  const simple = String(device.simpleDeviceType || "").toUpperCase();
  const name = String(device.deviceName || "").toLowerCase();

  return (
    type === 11 ||
    type === 12 ||
    type === 22 ||
    simple.includes("USB") ||
    name.includes("usb audio") ||
    name.includes("usb headset") ||
    name.includes("usb-гарнит")
  );
}

async function tick() {
  if (stopped) return;

  try {
    if (!audioModule) {
      audioModule = findAudioModule();
      if (!audioModule) return;

      if (!shownModule) {
        shownModule = true;
        toast("USB Route v3: аудиомодуль Discord найден");
      }
    }

    const devices = await Promise.resolve(audioModule.getAudioDevices());
    const list = Array.isArray(devices) ? devices : [];
    usbDevice = list.find(isUsb) || null;
    if (!usbDevice) return;

    const currentId = Number(usbDevice.deviceId);
    if (shownUsbId !== currentId) {
      shownUsbId = currentId;
      toast("USB Route v3: найдена " + (usbDevice.deviceName || "USB-гарнитура"));
      log("USB device", usbDevice);
    }

    await Promise.resolve(audioModule.setActiveAudioDevice(usbDevice));
  } catch (error) {
    log("tick failed", error);
  }
}

function onLoad() {
  stopped = false;
  audioModule = null;
  usbDevice = null;
  shownModule = false;
  shownUsbId = null;

  toast("USB Call Audio Route v3 включён");
  tick();
  timer = setInterval(tick, 1000);
}

function onUnload() {
  stopped = true;

  if (timer !== null) {
    clearInterval(timer);
    timer = null;
  }

  audioModule = null;
  usbDevice = null;
  shownModule = false;
  shownUsbId = null;
  log("disabled");
}

module.exports = {
  onLoad,
  onUnload
};
