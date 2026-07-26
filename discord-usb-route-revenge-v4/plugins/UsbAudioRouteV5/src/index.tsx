import React from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { findByProps } from '@vendetta/metro'
import { instead } from '@vendetta/patcher'
import { showToast } from '@vendetta/ui/toasts'
import { ReactNative } from '@revenge-mod/metro/common'

const USB_TYPES = new Set([11, 12, 22])
const BUILTIN_TYPES = new Set([1, 2, 24])

const state = {
    moduleName: 'не найден',
    patchStatus: 'не установлен',
    communicationMode: false,
    availableDevices: [] as any[],
    activeDevice: null as any,
    usbDevice: null as any,
    lastRequestedDevice: '—',
    lastAction: 'Плагин ещё не запускался',
    lastError: '—',
    updatedAt: '—',
}

let audioModule: any
let discoveryTimer: ReturnType<typeof setInterval> | undefined
let retryTimers: Array<ReturnType<typeof setTimeout>> = []
let unpatchMode: (() => void) | undefined
let unpatchDevice: (() => void) | undefined
let stopped = true
let refreshBusy = false
let routeBusy = false

const log = (...args: unknown[]) => {
    try {
        console.log('[USBRouteV5]', ...args)
    } catch {}
}

const toast = (message: string) => {
    try {
        showToast(message)
    } catch (error) {
        log('toast failed', error)
    }
}

const now = () => new Date().toLocaleTimeString()

const deviceLabel = (device: any) => {
    if (!device || typeof device !== 'object') return 'не определено'
    const name = String(device.deviceName ?? 'Без имени')
    const simple = String(device.simpleDeviceType ?? 'UNKNOWN')
    const id = String(device.deviceId ?? '?')
    const type = String(device.deviceType ?? '?')
    return `${name} / ${simple} / ID ${id} / type ${type}`
}

const isUsb = (device: any) => {
    if (!device || typeof device !== 'object') return false
    const type = Number(device.deviceType)
    const simple = String(device.simpleDeviceType ?? '').toUpperCase()
    const name = String(device.deviceName ?? '').toLowerCase()
    return (
        USB_TYPES.has(type) ||
        simple.includes('USB') ||
        name.includes('usb audio') ||
        name.includes('usb headset') ||
        name.includes('usb-гарнит')
    )
}

const isBuiltIn = (device: any) => {
    if (!device || typeof device !== 'object') return false
    const type = Number(device.deviceType)
    const simple = String(device.simpleDeviceType ?? '').toUpperCase()
    const name = String(device.deviceName ?? '').toLowerCase()
    return (
        BUILTIN_TYPES.has(type) ||
        simple === 'SPEAKERPHONE' ||
        simple === 'EARPIECE' ||
        name.includes('speaker') ||
        name.includes('earpiece') ||
        name.includes('динамик')
    )
}

const discoverAudioModule = () => {
    const candidates: Array<[string, any]> = []

    try {
        candidates.push(['Metro findByProps', findByProps('getAudioDevices', 'setActiveAudioDevice')])
    } catch (error) {
        log('findByProps failed', error)
    }

    try {
        const rn = ReactNative as any
        for (const name of ['NativeAudioManagerModule', 'RTNAudioManager', 'InCallManager', 'AudioManager', 'DCDAudioManager']) {
            candidates.push([`TurboModuleRegistry.${name}`, rn?.TurboModuleRegistry?.get?.(name)])
            candidates.push([`NativeModules.${name}`, rn?.NativeModules?.[name]])
        }
    } catch (error) {
        log('native module lookup failed', error)
    }

    for (const [name, candidate] of candidates) {
        if (
            candidate &&
            typeof candidate.getAudioDevices === 'function' &&
            typeof candidate.setActiveAudioDevice === 'function'
        ) {
            state.moduleName = name
            state.lastError = '—'
            log('found audio module', name)
            return candidate
        }
    }

    state.moduleName = 'не найден'
    return null
}

const clearRetryTimers = () => {
    for (const timer of retryTimers) clearTimeout(timer)
    retryTimers = []
}

const refreshDiagnostics = async () => {
    if (stopped || refreshBusy) return
    refreshBusy = true

    try {
        audioModule ??= discoverAudioModule()
        if (!audioModule) {
            state.lastAction = 'Ожидаю появления аудиомодуля Discord'
            state.updatedAt = now()
            return
        }

        const devices = await Promise.resolve(audioModule.getAudioDevices())
        state.availableDevices = Array.isArray(devices) ? devices : []
        state.usbDevice = state.availableDevices.find(isUsb) ?? null

        if (typeof audioModule.getActiveAudioDevice === 'function') {
            state.activeDevice = await Promise.resolve(audioModule.getActiveAudioDevice())
        }

        state.updatedAt = now()
    } catch (error) {
        state.lastError = String(error)
        state.lastAction = 'Ошибка обновления диагностики'
        state.updatedAt = now()
        log('refresh failed', error)
    } finally {
        refreshBusy = false
    }
}

const routeToUsb = async (reason: string, forceCommunicationMode = false) => {
    if (stopped || routeBusy) return
    routeBusy = true

    try {
        audioModule ??= discoverAudioModule()
        if (!audioModule) {
            state.lastAction = 'Не могу выбрать USB: аудиомодуль Discord не найден'
            return
        }

        if (forceCommunicationMode && typeof audioModule.setCommunicationModeOn === 'function') {
            state.lastAction = 'Принудительно включаю режим связи Android'
            await Promise.resolve(audioModule.setCommunicationModeOn(true))
            state.communicationMode = true
        }

        await refreshDiagnostics()
        const target = state.usbDevice
        if (!target) {
            state.lastAction = 'USB-гарнитура не найдена в списке Discord'
            return
        }

        state.lastAction = `${reason}: отправлен запрос на ${deviceLabel(target)}`
        await Promise.resolve(audioModule.setActiveAudioDevice(target))
        await new Promise(resolve => setTimeout(resolve, 250))

        if (typeof audioModule.getActiveAudioDevice === 'function') {
            state.activeDevice = await Promise.resolve(audioModule.getActiveAudioDevice())
        }

        if (isUsb(state.activeDevice)) {
            state.lastAction = `${reason}: Discord подтвердил USB-выход`
            toast('USB Route v5: Discord показывает USB активным')
        } else {
            state.lastAction = `${reason}: запрос выполнен, но активен ${deviceLabel(state.activeDevice)}`
        }

        state.updatedAt = now()
    } catch (error) {
        state.lastError = String(error)
        state.lastAction = `${reason}: ошибка переключения`
        state.updatedAt = now()
        log('route failed', error)
    } finally {
        routeBusy = false
    }
}

const scheduleCallRetries = (reason: string) => {
    clearRetryTimers()
    for (const delay of [120, 500, 1200, 2500]) {
        retryTimers.push(setTimeout(() => void routeToUsb(`${reason}, попытка ${delay} мс`), delay))
    }
}

const installPatches = () => {
    if (!audioModule) return

    try {
        if (!unpatchMode && typeof audioModule.setCommunicationModeOn === 'function') {
            unpatchMode = instead('setCommunicationModeOn', audioModule, (args, original) => {
                const enabled = Boolean(args?.[0])
                state.communicationMode = enabled
                state.lastAction = `Discord переключил режим связи: ${enabled ? 'ВКЛ' : 'ВЫКЛ'}`
                state.updatedAt = now()

                const result = original(...(args ?? []))
                if (enabled) scheduleCallRetries('Discord включил режим связи')
                else clearRetryTimers()
                return result
            })
        }

        if (!unpatchDevice && typeof audioModule.setActiveAudioDevice === 'function') {
            unpatchDevice = instead('setActiveAudioDevice', audioModule, (args, original) => {
                const requested = args?.[0]
                state.lastRequestedDevice = deviceLabel(requested)
                state.updatedAt = now()

                if (state.communicationMode && state.usbDevice && isBuiltIn(requested)) {
                    state.lastAction = `Подменяю запрос динамика на ${deviceLabel(state.usbDevice)}`
                    return original(state.usbDevice)
                }

                return original(...(args ?? []))
            })
        }

        state.patchStatus = `режим: ${unpatchMode ? 'да' : 'нет'}, устройство: ${unpatchDevice ? 'да' : 'нет'}`
    } catch (error) {
        state.patchStatus = 'ошибка установки'
        state.lastError = String(error)
        log('patch failed', error)
    }
}

const initialize = async () => {
    if (stopped) return
    audioModule ??= discoverAudioModule()
    if (audioModule) installPatches()
    await refreshDiagnostics()
}

const styles = StyleSheet.create({
    screen: { flex: 1 },
    content: { padding: 16, paddingBottom: 40, gap: 12 },
    card: { padding: 14, borderRadius: 14, backgroundColor: '#2b2d31', gap: 7 },
    title: { color: '#ffffff', fontSize: 18, fontWeight: '700' },
    label: { color: '#b5bac1', fontSize: 13, fontWeight: '600' },
    value: { color: '#ffffff', fontSize: 14 },
    warning: { color: '#f0b232', fontSize: 13 },
    button: { paddingVertical: 13, paddingHorizontal: 14, borderRadius: 10, backgroundColor: '#5865f2' },
    buttonDanger: { backgroundColor: '#da373c' },
    buttonText: { color: '#ffffff', textAlign: 'center', fontSize: 15, fontWeight: '700' },
})

const StatusRow = ({ label, value }: { label: string; value: string }) => (
    <View>
        <Text style={styles.label}>{label}</Text>
        <Text selectable style={styles.value}>{value}</Text>
    </View>
)

const ActionButton = ({ text, onPress, danger = false }: { text: string; onPress: () => void; danger?: boolean }) => (
    <Pressable style={[styles.button, danger && styles.buttonDanger]} onPress={onPress}>
        <Text style={styles.buttonText}>{text}</Text>
    </Pressable>
)

function Settings() {
    const [, redraw] = React.useReducer(value => value + 1, 0)

    React.useEffect(() => {
        const timer = setInterval(() => redraw(), 500)
        void initialize()
        return () => clearInterval(timer)
    }, [])

    const devices = state.availableDevices.length
        ? state.availableDevices.map(deviceLabel).join('\n')
        : 'Список пуст или ещё не загружен'

    return (
        <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
            <View style={styles.card}>
                <Text style={styles.title}>USB Call Audio Route v5</Text>
                <Text style={styles.warning}>
                    Сначала войдите в голосовой канал. Принудительную кнопку нажимайте уже во время активного звонка.
                </Text>
            </View>

            <View style={styles.card}>
                <StatusRow label="Аудиомодуль" value={state.moduleName} />
                <StatusRow label="Перехваты" value={state.patchStatus} />
                <StatusRow label="Режим связи" value={state.communicationMode ? 'включён' : 'выключен / ещё не замечен'} />
                <StatusRow label="USB-устройство" value={deviceLabel(state.usbDevice)} />
                <StatusRow label="Активное устройство Discord" value={deviceLabel(state.activeDevice)} />
                <StatusRow label="Последний запрос Discord" value={state.lastRequestedDevice} />
                <StatusRow label="Последнее действие" value={state.lastAction} />
                <StatusRow label="Последняя ошибка" value={state.lastError} />
                <StatusRow label="Обновлено" value={state.updatedAt} />
            </View>

            <ActionButton text="Обновить диагностику" onPress={() => void initialize()} />
            <ActionButton text="Выбрать USB один раз" onPress={() => void routeToUsb('Ручной выбор')} />
            <ActionButton
                text="Режим связи + USB (во время звонка)"
                danger
                onPress={() => void routeToUsb('Принудительный тест', true)}
            />

            <View style={styles.card}>
                <Text style={styles.label}>Все устройства, которые видит Discord</Text>
                <Text selectable style={styles.value}>{devices}</Text>
            </View>
        </ScrollView>
    )
}

export default {
    onLoad: () => {
        stopped = false
        state.lastAction = 'Плагин включён; жду голосовой режим Discord'
        state.lastError = '—'
        toast('USB Call Audio Route v5 включён')
        void initialize()
        discoveryTimer = setInterval(() => void initialize(), 2000)
    },

    onUnload: () => {
        stopped = true
        if (discoveryTimer) clearInterval(discoveryTimer)
        discoveryTimer = undefined
        clearRetryTimers()
        try {
            unpatchMode?.()
            unpatchDevice?.()
        } catch (error) {
            log('unpatch failed', error)
        }
        unpatchMode = undefined
        unpatchDevice = undefined
        audioModule = null
        state.patchStatus = 'не установлен'
        state.communicationMode = false
        state.lastAction = 'Плагин выключен'
    },

    settings: Settings,
}
