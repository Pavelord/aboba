var plugin = (() => {
  var __create = Object.create;
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __getProtoOf = Object.getPrototypeOf;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __commonJS = (cb, mod) => function __require() {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  };
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
  var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
    isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
    mod
  ));
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
  var require_patcher = __commonJS({
    "vendetta-globals:@vendetta/patcher"(exports, module) {
      module.exports = vendetta.patcher;
    }
  });
  var require_common = __commonJS({
    "vendetta-globals:@vendetta/metro/common"(exports, module) {
      module.exports = vendetta.metro.common;
    }
  });
  var require_toasts = __commonJS({
    "vendetta-globals:@vendetta/ui/toasts"(exports, module) {
      module.exports = vendetta.ui.toasts;
    }
  });
  var src_exports = {};
  __export(src_exports, {
    onLoad: () => onLoad,
    onUnload: () => onUnload
  });
  var import_patcher = __toESM(require_patcher(), 1);
  var import_common = __toESM(require_common(), 1);
  var import_toasts = __toESM(require_toasts(), 1);
  var { NativeModules } = import_common.ReactNative;
  var TurboModuleRegistry = import_common.ReactNative.TurboModuleRegistry;
  var USB_TYPES = /* @__PURE__ */ new Set([11, 12, 22]);
  var unpatches = [];
  var timer;
  var audioModule;
  var usbDevice;
  var lastToastDevice = -1;
  var consecutiveErrors = 0;
  function findAudioModule() {
    const names = ["NativeAudioManagerModule", "RTNAudioManager", "AudioManager", "DCDAudioManager"];
    for (const name of names) {
      try {
        const mod = TurboModuleRegistry?.get?.(name) ?? NativeModules?.[name];
        if (mod && typeof mod.getAudioDevices === "function" && typeof mod.setActiveAudioDevice === "function") {
          console.log(`[USBRoute] found ${name}`);
          return mod;
        }
      } catch (e) {
        console.log(`[USBRoute] failed to inspect ${name}`, e);
      }
    }
    return null;
  }
  function isUsbDevice(device) {
    if (!device || typeof device !== "object")
      return false;
    const type = Number(device.deviceType);
    const name = String(device.deviceName ?? "").toLowerCase();
    return USB_TYPES.has(type) || name.includes("usb audio") || name.includes("usb headset") || name.includes("usb-гарнит");
  }
  function isBuiltinDevice(device) {
    if (!device || typeof device !== "object")
      return false;
    const simple = String(device.simpleDeviceType ?? "").toUpperCase();
    const name = String(device.deviceName ?? "").toLowerCase();
    return simple === "SPEAKERPHONE" || simple === "EARPIECE" || name.includes("speaker") || name.includes("динамик");
  }
  async function refreshUsbDevice() {
    if (!audioModule)
      audioModule = findAudioModule();
    if (!audioModule)
      return void 0;
    try {
      const devices = await audioModule.getAudioDevices();
      const list = Array.isArray(devices) ? devices : [];
      const found = list.find(isUsbDevice);
      usbDevice = found;
      if (found && Number(found.deviceId) !== lastToastDevice) {
        lastToastDevice = Number(found.deviceId);
        (0, import_toasts.showToast)(`USB-гарнитура найдена: ${found.deviceName ?? "USB Audio Device"}`);
        console.log("[USBRoute] USB target", JSON.stringify(found));
      }
      return found;
    } catch (e) {
      consecutiveErrors++;
      if (consecutiveErrors === 1 || consecutiveErrors % 10 === 0)
        console.log("[USBRoute] getAudioDevices failed", e);
      return void 0;
    }
  }
  async function applyRoute(reason) {
    const target = usbDevice ?? await refreshUsbDevice();
    if (!target || !audioModule)
      return;
    try {
      await audioModule.setActiveAudioDevice(target);
      consecutiveErrors = 0;
      console.log(`[USBRoute] applied (${reason})`, JSON.stringify(target));
    } catch (e) {
      consecutiveErrors++;
      if (consecutiveErrors === 1 || consecutiveErrors % 10 === 0)
        console.log(`[USBRoute] route failed (${reason})`, e);
    }
  }
  function installPatch() {
    if (!audioModule || typeof audioModule.setActiveAudioDevice !== "function")
      return;
    try {
      const unpatch = (0, import_patcher.instead)("setActiveAudioDevice", audioModule, (args, original) => {
        const requested = args?.[0];
        if (usbDevice && isBuiltinDevice(requested)) {
          console.log("[USBRoute] replaced built-in route", JSON.stringify(requested), "->", JSON.stringify(usbDevice));
          return original(usbDevice);
        }
        return original(...args);
      });
      unpatches.push(unpatch);
      console.log("[USBRoute] patched setActiveAudioDevice");
    } catch (e) {
      console.log("[USBRoute] patch failed", e);
    }
  }
  async function onLoad() {
    audioModule = findAudioModule();
    if (!audioModule) {
      (0, import_toasts.showToast)("USB Route: аудиомодуль Discord не найден");
      console.log("[USBRoute] no compatible Discord audio module");
      return;
    }
    await refreshUsbDevice();
    installPatch();
    timer = setInterval(async () => {
      await refreshUsbDevice();
      await applyRoute("keep-alive");
    }, 700);
    await applyRoute("plugin load");
    (0, import_toasts.showToast)("USB Call Audio Route включён");
  }
  function onUnload() {
    if (timer)
      clearInterval(timer);
    timer = void 0;
    for (const unpatch of unpatches.splice(0)) {
      try {
        unpatch();
      } catch {
      }
    }
    usbDevice = void 0;
    audioModule = void 0;
    lastToastDevice = -1;
  }
  return __toCommonJS(src_exports);
})();
module.exports = plugin;
