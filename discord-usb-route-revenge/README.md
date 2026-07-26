# USB Call Audio Route for Revenge

Плагин для актуального Discord Android через Revenge/Bunny/Vendetta-совместимый загрузчик.

Плагин использует внутренний `NativeAudioManagerModule` самого Discord:

- получает список устройств через `getAudioDevices()`;
- находит `USB_DEVICE`, `USB_ACCESSORY` или `USB_HEADSET`;
- заменяет запросы Discord на встроенный динамик/разговорный динамик USB-гарнитурой;
- повторно вызывает `setActiveAudioDevice(usb)` каждые 700 мс;
- не включает и не выключает communication mode, поэтому не должен ломать установление голосового соединения.

После сборки добавьте URL каталога `dist/UsbAudioRoute` в Revenge → Plugins → Add.
