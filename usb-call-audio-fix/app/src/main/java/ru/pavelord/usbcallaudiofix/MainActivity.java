package ru.pavelord.usbcallaudiofix;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Typeface;
import android.media.AudioDeviceInfo;
import android.media.AudioManager;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Spinner;
import android.widget.TextView;
import android.widget.Toast;

import java.util.ArrayList;
import java.util.List;

public class MainActivity extends Activity {
    private AudioManager audioManager;
    private Spinner deviceSpinner;
    private TextView statusText;
    private final List<AudioDeviceInfo> devices = new ArrayList<>();

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        audioManager = getSystemService(AudioManager.class);

        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 100);
        }

        ScrollView scroll = new ScrollView(this);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(20), dp(20), dp(20), dp(28));
        scroll.addView(root);

        TextView title = new TextView(this);
        title.setText("USB Call Audio Fix");
        title.setTextSize(26);
        title.setTypeface(Typeface.DEFAULT_BOLD);
        root.addView(title);

        TextView help = new TextView(this);
        help.setText("Подключите USB-гарнитуру, обновите список, выберите её и включите удержание маршрута. Затем зайдите в звонок.");
        help.setTextSize(16);
        help.setPadding(0, dp(12), 0, dp(18));
        root.addView(help);

        deviceSpinner = new Spinner(this);
        root.addView(deviceSpinner);

        Button refresh = button("Обновить список устройств");
        refresh.setOnClickListener(v -> refreshDevices());
        root.addView(refresh);

        Button forceOnce = button("Выбрать устройство один раз");
        forceOnce.setOnClickListener(v -> applyOnce());
        root.addView(forceOnce);

        Button keep = button("Удерживать маршрут во время звонка");
        keep.setOnClickListener(v -> startHolding());
        root.addView(keep);

        Button stop = button("Остановить и вернуть системный маршрут");
        stop.setOnClickListener(v -> stopHolding());
        root.addView(stop);

        Button soundSettings = button("Открыть системные настройки звука");
        soundSettings.setOnClickListener(v -> startActivity(new Intent(Settings.ACTION_SOUND_SETTINGS)));
        root.addView(soundSettings);

        statusText = new TextView(this);
        statusText.setTextSize(15);
        statusText.setPadding(0, dp(18), 0, 0);
        root.addView(statusText);

        setContentView(scroll);
        refreshDevices();
    }

    @Override
    protected void onResume() {
        super.onResume();
        refreshDevices();
    }

    private Button button(String text) {
        Button button = new Button(this);
        button.setText(text);
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT);
        params.topMargin = dp(10);
        button.setLayoutParams(params);
        return button;
    }

    private void refreshDevices() {
        devices.clear();
        List<String> labels = new ArrayList<>();
        if (Build.VERSION.SDK_INT < 31) {
            labels.add("Нужен Android 12 или новее");
            deviceSpinner.setAdapter(new ArrayAdapter<>(this, android.R.layout.simple_spinner_dropdown_item, labels));
            statusText.setText("Новый API маршрутизации недоступен.");
            return;
        }

        for (AudioDeviceInfo device : audioManager.getAvailableCommunicationDevices()) {
            devices.add(device);
            labels.add(device.getProductName() + " — " + typeName(device.getType()) + " — ID " + device.getId());
        }
        if (labels.isEmpty()) labels.add("Система не показала устройств связи");
        deviceSpinner.setAdapter(new ArrayAdapter<>(this, android.R.layout.simple_spinner_dropdown_item, labels));

        AudioDeviceInfo selected = audioManager.getCommunicationDevice();
        statusText.setText("Текущий выход: " +
                (selected == null ? "системный" : selected.getProductName() + " / " + typeName(selected.getType())) +
                "\nРежим: " + audioManager.getMode());
    }

    private void applyOnce() {
        AudioDeviceInfo selected = selectedDevice();
        if (selected == null) {
            toast("USB-устройства нет в списке связи");
            return;
        }
        audioManager.setMode(AudioManager.MODE_IN_COMMUNICATION);
        boolean ok = audioManager.setCommunicationDevice(selected);
        statusText.setText("Назначение: " + (ok ? "успешно" : "Android отказал") + "\n" + selected.getProductName());
        toast(ok ? "Маршрут назначен" : "Система не разрешила маршрут");
    }

    private void startHolding() {
        AudioDeviceInfo selected = selectedDevice();
        if (selected == null) {
            toast("Сначала выберите USB-устройство");
            return;
        }
        Intent intent = new Intent(this, AudioRouteService.class);
        intent.setAction(AudioRouteService.ACTION_START);
        intent.putExtra(AudioRouteService.EXTRA_DEVICE_ID, selected.getId());
        intent.putExtra(AudioRouteService.EXTRA_DEVICE_TYPE, selected.getType());
        intent.putExtra(AudioRouteService.EXTRA_DEVICE_NAME, selected.getProductName().toString());
        startForegroundService(intent);
        statusText.setText("Удержание включено для " + selected.getProductName());
    }

    private void stopHolding() {
        Intent intent = new Intent(this, AudioRouteService.class);
        intent.setAction(AudioRouteService.ACTION_STOP);
        startService(intent);
        audioManager.clearCommunicationDevice();
        audioManager.setMode(AudioManager.MODE_NORMAL);
        statusText.setText("Маршрут освобождён");
    }

    private AudioDeviceInfo selectedDevice() {
        int position = deviceSpinner.getSelectedItemPosition();
        return position >= 0 && position < devices.size() ? devices.get(position) : null;
    }

    private String typeName(int type) {
        switch (type) {
            case AudioDeviceInfo.TYPE_USB_HEADSET: return "USB-гарнитура";
            case AudioDeviceInfo.TYPE_USB_DEVICE: return "USB-аудио";
            case AudioDeviceInfo.TYPE_USB_ACCESSORY: return "USB-аксессуар";
            case AudioDeviceInfo.TYPE_WIRED_HEADSET: return "проводная гарнитура";
            case AudioDeviceInfo.TYPE_WIRED_HEADPHONES: return "проводные наушники";
            case AudioDeviceInfo.TYPE_BUILTIN_SPEAKER: return "динамик";
            case AudioDeviceInfo.TYPE_BUILTIN_EARPIECE: return "разговорный динамик";
            case AudioDeviceInfo.TYPE_BLUETOOTH_SCO: return "Bluetooth SCO";
            case AudioDeviceInfo.TYPE_BLE_HEADSET: return "Bluetooth LE";
            default: return "тип " + type;
        }
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private void toast(String text) {
        Toast.makeText(this, text, Toast.LENGTH_SHORT).show();
    }
}
