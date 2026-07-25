package ru.pavelord.usbcallaudioroute

import android.content.Context
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.os.Build
import android.os.Handler
import android.os.Looper

import com.aliucord.annotations.AliucordPlugin
import com.aliucord.api.CommandsAPI
import com.aliucord.entities.Plugin

/**
 * Runs inside the Discord/Aliucord process, so communication-device requests
 * originate from the application that owns the active voice call.
 */
@AliucordPlugin(requiresRestart = false)
@Suppress("unused")
class UsbCallAudioRoute : Plugin() {
    private lateinit var audioManager: AudioManager
    private lateinit var handler: Handler

    @Volatile
    private var enabled = true

    private var attempts = 0
    private var accepted = 0
    private var lastMessage = "Плагин ещё не запускал маршрутизацию"
    private var lastAggressiveRetryMs = 0L

    private val routeLoop = object : Runnable {
        override fun run() {
            if (enabled) {
                tryRoute(aggressive = false)
            }
            handler.postDelayed(this, 350L)
        }
    }

    override fun start(context: Context) {
        audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        handler = Handler(Looper.getMainLooper())

        commands.registerCommand(
            "usbroute",
            "Принудительно направить звук звонка в USB-гарнитуру",
        ) {
            enabled = true
            val message = tryRoute(aggressive = true)
            CommandsAPI.CommandResult(message)
        }

        commands.registerCommand(
            "usbroutestatus",
            "Показать состояние USB-маршрута",
        ) {
            CommandsAPI.CommandResult(buildStatus())
        }

        commands.registerCommand(
            "usbrouteoff",
            "Отключить автоматическое удержание USB-маршрута",
        ) {
            enabled = false
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                runCatching { audioManager.clearCommunicationDevice() }
            }
            CommandsAPI.CommandResult("Автоматическое удержание USB-маршрута выключено")
        }

        handler.post(routeLoop)
    }

    override fun stop(context: Context) {
        enabled = false
        if (::handler.isInitialized) handler.removeCallbacks(routeLoop)
        if (::audioManager.isInitialized && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            runCatching { audioManager.clearCommunicationDevice() }
        }
        patcher.unpatchAll()
    }

    private fun tryRoute(aggressive: Boolean): String {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
            lastMessage = "Нужен Android 12 или новее"
            return lastMessage
        }

        val mode = audioManager.mode
        if (!aggressive && mode != AudioManager.MODE_IN_COMMUNICATION && mode != AudioManager.MODE_IN_CALL) {
            lastMessage = "Ожидаю активный голосовой звонок; режим Android: $mode"
            return lastMessage
        }

        val devices = runCatching { audioManager.availableCommunicationDevices }
            .getOrElse {
                lastMessage = "Не удалось получить список устройств: ${it.javaClass.simpleName}"
                return lastMessage
            }

        val target = findUsbSink(devices)
        if (target == null) {
            lastMessage = "USB-гарнитура не найдена среди устройств связи: ${describeDevices(devices)}"
            return lastMessage
        }

        val current = runCatching { audioManager.communicationDevice }.getOrNull()
        if (current?.id == target.id) {
            lastMessage = "USB-маршрут уже выбран: ${describe(target)}"
            return lastMessage
        }

        attempts++
        var ok = runCatching { audioManager.setCommunicationDevice(target) }.getOrDefault(false)

        // Discord may already have an explicit speaker request in the same process.
        // In aggressive mode, or periodically after failures, clear that request and immediately replace it.
        val now = System.currentTimeMillis()
        if (!ok && (aggressive || now - lastAggressiveRetryMs >= 1500L)) {
            lastAggressiveRetryMs = now
            runCatching { audioManager.clearCommunicationDevice() }
            ok = runCatching { audioManager.setCommunicationDevice(target) }.getOrDefault(false)
        }

        if (ok) accepted++
        val after = runCatching { audioManager.communicationDevice }.getOrNull()
        lastMessage = buildString {
            append(if (ok) "Android принял запрос" else "Android отказал даже из процесса Discord")
            append("\nЦель: ").append(describe(target))
            append("\nФактически выбранное устройство: ").append(after?.let(::describe) ?: "нет")
            append("\nРежим Android: ").append(mode)
            append("\nУспешных запросов: ").append(accepted).append('/').append(attempts)
        }
        return lastMessage
    }

    private fun buildStatus(): String {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return "Нужен Android 12 или новее"
        val devices = runCatching { audioManager.availableCommunicationDevices }.getOrDefault(emptyList())
        val current = runCatching { audioManager.communicationDevice }.getOrNull()
        return buildString {
            append("Автоудержание: ").append(if (enabled) "включено" else "выключено")
            append("\nРежим Android: ").append(audioManager.mode)
            append("\nТекущее устройство: ").append(current?.let(::describe) ?: "нет")
            append("\nДоступные устройства: ").append(describeDevices(devices))
            append("\nПоследний результат: ").append(lastMessage)
        }
    }

    private fun findUsbSink(devices: List<AudioDeviceInfo>): AudioDeviceInfo? {
        val preferredTypes = intArrayOf(
            AudioDeviceInfo.TYPE_USB_HEADSET,
            AudioDeviceInfo.TYPE_USB_DEVICE,
            AudioDeviceInfo.TYPE_USB_ACCESSORY,
        )
        for (type in preferredTypes) {
            devices.firstOrNull { it.type == type && it.isSink }?.let { return it }
        }
        return null
    }

    private fun describeDevices(devices: List<AudioDeviceInfo>): String =
        if (devices.isEmpty()) "пусто" else devices.joinToString("; ") { describe(it) }

    private fun describe(device: AudioDeviceInfo): String =
        "${device.productName} / ${typeName(device.type)} / ID ${device.id}"

    private fun typeName(type: Int): String = when (type) {
        AudioDeviceInfo.TYPE_USB_HEADSET -> "USB-гарнитура"
        AudioDeviceInfo.TYPE_USB_DEVICE -> "USB-аудио"
        AudioDeviceInfo.TYPE_USB_ACCESSORY -> "USB-аксессуар"
        AudioDeviceInfo.TYPE_BUILTIN_SPEAKER -> "динамик"
        AudioDeviceInfo.TYPE_BUILTIN_EARPIECE -> "разговорный динамик"
        AudioDeviceInfo.TYPE_WIRED_HEADSET -> "проводная гарнитура"
        AudioDeviceInfo.TYPE_WIRED_HEADPHONES -> "проводные наушники"
        AudioDeviceInfo.TYPE_BLUETOOTH_SCO -> "Bluetooth SCO"
        else -> "тип $type"
    }
}
