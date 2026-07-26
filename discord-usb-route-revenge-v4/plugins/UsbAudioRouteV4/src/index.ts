import { ReactNative } from '@revenge-mod/metro/common'
import { showToast } from '@vendetta/ui/toasts'

const USB_DEVICE_TYPES = new Set([11, 12, 22])

let timer: ReturnType<typeof setInterval> | undefined
let stopped = true
let audioModule: any
let usbDevice: any
let shownUsbId = -1
let routeInProgress = false

const log = (...args: unknown[]) => {
    try {
        console.log('[USBRouteV4]', ...args)
    } catch {}
}

const toast = (message: string) => {
    try {
        showToast(message)
    } catch (error) {
        log('toast failed', error)
    }
}

const findAudioModule = () => {
    const rn = ReactNative as any
    const names = ['NativeAudioManagerModule', 'RTNAudioManager', 'InCallManager', 'AudioManager', 'DCDAudioManager']

    for (const name of names) {
        try {
            const candidate = rn?.TurboModuleRegistry?.get?.(name) ?? rn?.NativeModules?.[name]
            if (
                candidate &&
                typeof candidate.getAudioDevices === 'function' &&
                typeof candidate.setActiveAudioDevice === 'function'
            ) {
                log('found audio module', name)
                return candidate
            }
        } catch (error) {
            log('module lookup failed', name, error)
        }
    }

    return null
}

const isUsbDevice = (device: any) => {
    if (!device || typeof device !== 'object') return false

    const type = Number(device.deviceType)
    const simpleType = String(device.simpleDeviceType ?? '').toUpperCase()
    const name = String(device.deviceName ?? '').toLowerCase()

    return (
        USB_DEVICE_TYPES.has(type) ||
        simpleType.includes('USB') ||
        name.includes('usb audio') ||
        name.includes('usb headset') ||
        name.includes('usb-гарнит')
    )
}

const routeToUsb = async () => {
    if (stopped || routeInProgress) return
    routeInProgress = true

    try {
        audioModule ??= findAudioModule()
        if (!audioModule) return

        const devices = await Promise.resolve(audioModule.getAudioDevices())
        const list = Array.isArray(devices) ? devices : []
        usbDevice = list.find(isUsbDevice)
        if (!usbDevice) return

        const id = Number(usbDevice.deviceId ?? -1)
        if (id !== shownUsbId) {
            shownUsbId = id
            toast(`USB Route v4: найдена ${usbDevice.deviceName ?? 'USB-гарнитура'}`)
            log('USB device', usbDevice)
        }

        await Promise.resolve(audioModule.setActiveAudioDevice(usbDevice))
    } catch (error) {
        log('route failed', error)
    } finally {
        routeInProgress = false
    }
}

export default {
    onLoad: () => {
        stopped = false
        audioModule = null
        usbDevice = null
        shownUsbId = -1
        routeInProgress = false

        toast('USB Call Audio Route v4 включён')
        void routeToUsb()
        timer = setInterval(() => void routeToUsb(), 750)
    },

    onUnload: () => {
        stopped = true
        if (timer) clearInterval(timer)
        timer = undefined
        audioModule = null
        usbDevice = null
        shownUsbId = -1
        routeInProgress = false
        log('disabled')
    },
}
