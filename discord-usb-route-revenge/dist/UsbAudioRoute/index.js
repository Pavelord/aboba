var plugin = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // plugins/UsbAudioRoute/src/index.ts
  var src_exports = {};
  __export(src_exports, {
    onLoad: () => onLoad,
    onUnload: () => onUnload
  });
  var USB_TYPES = /* @__PURE__ */ new Set([11, 12, 22]);
  var stopped = true;
  var timer;
  var startupTimer;
  var audioModule;
  var usbDevice;
  var unpatch;
  var moduleToastShown = false;
  var deviceToastId = -1;
  var tickBusy = false;
  var attempts = 0;
  function log(...args) {
    try {
      console.log("[USBRouteV2]", ...args);
    } catch {
    }
  }
  function safeToast(message) {
    try {
      const fn = vendetta?.ui?.toasts?.showToast;
      if (typeof fn === "function")
        fn(message);
    } catch (error) {
      log("toast failed", error);
    }
  }
  function getReactNative() {
    try {
      return vendetta?.metro?.common?.ReactNative ?? null;
    } catch (error) {
      log("ReactNative lookup failed", error);
      return null;
    }
  }
  function findAudioModule() {
    const reactNative = getReactNative();
    const nativeModules = reactNative?.NativeModules;
    const turboRegistry = reactNative?.TurboModuleRegistry;
    const names = [
      "NativeAudioManagerModule",
      "RTNAudioManager",
      "InCallManager",
      "AudioManager",
      "DCDAudioManager"
    ];
    for (const name of names) {
      try {
        const candidate = turboRegistry?.get?.(name) ?? nativeModules?.[name];
        if (candidate && typeof candidate.getAudioDevices === "function" && typeof candidate.setActiveAudioDevice === "function") {
          log("found audio module", name);
          return candidate;
        }
      } catch (error) {
        log("module lookup failed", name, error);
      }
    }
    return null;
  }
  function isUsbDevice(device) {
    if (!device || typeof device !== "object")
      return false;
    const type = Number(device.deviceType);
    const simple = String(device.simpleDeviceType ?? "").toUpperCase();
    const name = String(device.deviceName ?? "").toLowerCase();
    return USB_TYPES.has(type) || simple.includes("USB") || name.includes("usb audio") || name.includes("usb headset") || name.includes("usb-\u0433\u0430\u0440\u043D\u0438\u0442");
  }
  function isBuiltinDevice(device) {
    if (!device || typeof device !== "object")
      return false;
    const simple = String(device.simpleDeviceType ?? "").toUpperCase();
    const name = String(device.deviceName ?? "").toLowerCase();
    return simple === "SPEAKERPHONE" || simple === "EARPIECE" || name.includes("speaker") || name.includes("earpiece") || name.includes("\u0434\u0438\u043D\u0430\u043C\u0438\u043A");
  }
  async function readDevices() {
    if (!audioModule || typeof audioModule.getAudioDevices !== "function")
      return [];
    try {
      const result = await Promise.resolve(audioModule.getAudioDevices());
      return Array.isArray(result) ? result : [];
    } catch (error) {
      log("getAudioDevices failed", error);
      return [];
    }
  }
  async function refreshUsbDevice() {
    const devices = await readDevices();
    const found = devices.find(isUsbDevice);
    usbDevice = found;
    if (found) {
      const id = Number(found.deviceId ?? -1);
      if (id !== deviceToastId) {
        deviceToastId = id;
        safeToast(`USB Route: \u043D\u0430\u0439\u0434\u0435\u043D\u0430 ${found.deviceName ?? "USB-\u0433\u0430\u0440\u043D\u0438\u0442\u0443\u0440\u0430"}`);
        log("USB device", JSON.stringify(found));
      }
    }
    return found;
  }
  async function getActiveDevice() {
    if (!audioModule || typeof audioModule.getActiveAudioDevice !== "function")
      return void 0;
    try {
      return await Promise.resolve(audioModule.getActiveAudioDevice());
    } catch (error) {
      log("getActiveAudioDevice failed", error);
      return void 0;
    }
  }
  async function applyRoute(reason) {
    if (stopped || !audioModule)
      return;
    const target = usbDevice ?? await refreshUsbDevice();
    if (!target)
      return;
    const active = await getActiveDevice();
    if (active && isUsbDevice(active))
      return;
    try {
      await Promise.resolve(audioModule.setActiveAudioDevice(target));
      log("route applied", reason, JSON.stringify(target));
    } catch (error) {
      log("setActiveAudioDevice failed", reason, error);
    }
  }
  function installPatch() {
    if (unpatch || !audioModule)
      return;
    try {
      const instead = vendetta?.patcher?.instead;
      if (typeof instead !== "function") {
        log("patcher unavailable; polling remains active");
        return;
      }
      unpatch = instead(
        "setActiveAudioDevice",
        audioModule,
        (args, original) => {
          try {
            const requested = args?.[0];
            if (usbDevice && isBuiltinDevice(requested)) {
              log("replacing built-in route with USB", JSON.stringify(requested));
              return original(usbDevice);
            }
          } catch (error) {
            log("route interception failed", error);
          }
          return original(...args ?? []);
        }
      );
      log("setActiveAudioDevice patched");
    } catch (error) {
      unpatch = void 0;
      log("patch installation failed; polling remains active", error);
    }
  }
  async function tick() {
    if (stopped || tickBusy)
      return;
    tickBusy = true;
    attempts++;
    try {
      if (!audioModule) {
        audioModule = findAudioModule();
        if (audioModule) {
          installPatch();
          if (!moduleToastShown) {
            moduleToastShown = true;
            safeToast("USB Route: \u0430\u0443\u0434\u0438\u043E\u043C\u043E\u0434\u0443\u043B\u044C Discord \u043D\u0430\u0439\u0434\u0435\u043D");
          }
        } else if (attempts === 8) {
          safeToast("USB Route \u0432\u043A\u043B\u044E\u0447\u0451\u043D, \u043E\u0436\u0438\u0434\u0430\u044E \u0430\u0443\u0434\u0438\u043E\u043C\u043E\u0434\u0443\u043B\u044C Discord");
        }
      }
      if (audioModule) {
        await refreshUsbDevice();
        await applyRoute("periodic check");
      }
    } catch (error) {
      log("tick failed", error);
    } finally {
      tickBusy = false;
    }
  }
  function onLoad() {
    try {
      stopped = false;
      attempts = 0;
      moduleToastShown = false;
      deviceToastId = -1;
      audioModule = void 0;
      usbDevice = void 0;
      tickBusy = false;
      safeToast("USB Call Audio Route v2 \u0432\u043A\u043B\u044E\u0447\u0451\u043D");
      startupTimer = setTimeout(() => {
        void tick();
      }, 250);
      timer = setInterval(() => {
        void tick();
      }, 1e3);
    } catch (error) {
      log("onLoad guarded failure", error);
    }
  }
  function onUnload() {
    stopped = true;
    try {
      if (startupTimer)
        clearTimeout(startupTimer);
      if (timer)
        clearInterval(timer);
    } catch {
    }
    startupTimer = void 0;
    timer = void 0;
    try {
      unpatch?.();
    } catch (error) {
      log("unpatch failed", error);
    }
    unpatch = void 0;
    audioModule = void 0;
    usbDevice = void 0;
    tickBusy = false;
    deviceToastId = -1;
    log("disabled");
  }
  return __toCommonJS(src_exports);
})();
module.exports = plugin;
