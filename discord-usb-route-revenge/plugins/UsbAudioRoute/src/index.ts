import { instead } from "@vendetta/patcher";
import { ReactNative } from "@vendetta/metro/common";
import { showToast } from "@vendetta/ui/toasts";

const { NativeModules } = ReactNative as any;
const TurboModuleRegistry = (ReactNative as any).TurboModuleRegistry;

const USB_TYPES = new Set([11, 12, 22]); // USB_DEVICE, USB_ACCESSORY, USB_HEADSET
const unpatches: Array<() => void> = [];
let timer: ReturnType<typeof setInterval> | undefined;
let audioModule: any;
let usbDevice: any;
let lastToastDevice = -1;
let consecutiveErrors = 0;

function findAudioModule(): any {
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

function isUsbDevice(device: any): boolean {
  if (!device || typeof device !== "object") return false;
  const type = Number(device.deviceType);
  const name = String(device.deviceName ?? "").toLowerCase();
  return USB_TYPES.has(type) || name.includes("usb audio") || name.includes("usb headset") || name.includes("usb-гарнит");
}

function isBuiltinDevice(device: any): boolean {
  if (!device || typeof device !== "object") return false;
  const simple = String(device.simpleDeviceType ?? "").toUpperCase();
  const name = String(device.deviceName ?? "").toLowerCase();
  return simple === "SPEAKERPHONE" || simple === "EARPIECE" || name.includes("speaker") || name.includes("динамик");
}

async function refreshUsbDevice(): Promise<any | undefined> {
  if (!audioModule) audioModule = findAudioModule();
  if (!audioModule) return undefined;

  try {
    const devices = await audioModule.getAudioDevices();
    const list = Array.isArray(devices) ? devices : [];
    const found = list.find(isUsbDevice);
    usbDevice = found;
    if (found && Number(found.deviceId) !== lastToastDevice) {
      lastToastDevice = Number(found.deviceId);
      showToast(`USB-гарнитура найдена: ${found.deviceName ?? "USB Audio Device"}`);
      console.log("[USBRoute] USB target", JSON.stringify(found));
    }
    return found;
  } catch (e) {
    consecutiveErrors++;
    if (consecutiveErrors === 1 || consecutiveErrors % 10 === 0) console.log("[USBRoute] getAudioDevices failed", e);
    return undefined;
  }
}

async function applyRoute(reason: string): Promise<void> {
  const target = usbDevice ?? await refreshUsbDevice();
  if (!target || !audioModule) return;

  try {
    await audioModule.setActiveAudioDevice(target);
    consecutiveErrors = 0;
    console.log(`[USBRoute] applied (${reason})`, JSON.stringify(target));
  } catch (e) {
    consecutiveErrors++;
    if (consecutiveErrors === 1 || consecutiveErrors % 10 === 0) console.log(`[USBRoute] route failed (${reason})`, e);
  }
}

function installPatch(): void {
  if (!audioModule || typeof audioModule.setActiveAudioDevice !== "function") return;
  try {
    const unpatch = instead("setActiveAudioDevice", audioModule, (args: any[], original: (...args: any[]) => any) => {
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

export async function onLoad() {
  audioModule = findAudioModule();
  if (!audioModule) {
    showToast("USB Route: аудиомодуль Discord не найден");
    console.log("[USBRoute] no compatible Discord audio module");
    return;
  }

  await refreshUsbDevice();
  installPatch();

  // Do not touch setCommunicationModeOn/MODE_IN_COMMUNICATION. Discord remains fully
  // responsible for establishing the voice connection; we only select its output device.
  timer = setInterval(async () => {
    await refreshUsbDevice();
    await applyRoute("keep-alive");
  }, 700);

  await applyRoute("plugin load");
  showToast("USB Call Audio Route включён");
}

export function onUnload() {
  if (timer) clearInterval(timer);
  timer = undefined;
  for (const unpatch of unpatches.splice(0)) {
    try { unpatch(); } catch {}
  }
  usbDevice = undefined;
  audioModule = undefined;
  lastToastDevice = -1;
}
