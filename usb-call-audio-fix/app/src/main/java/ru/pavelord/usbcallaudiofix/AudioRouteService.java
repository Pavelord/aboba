package ru.pavelord.usbcallaudiofix;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.AudioDeviceInfo;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;

import java.util.List;

public class AudioRouteService extends Service {
    public static final String ACTION_START = "ru.pavelord.usbcallaudiofix.START";
    public static final String ACTION_STOP = "ru.pavelord.usbcallaudiofix.STOP";
    public static final String EXTRA_DEVICE_ID = "device_id";
    public static final String EXTRA_DEVICE_TYPE = "device_type";
    public static final String EXTRA_DEVICE_NAME = "device_name";

    private static final String CHANNEL_ID = "audio_route";
    private static final int NOTIFICATION_ID = 1707;

    private AudioManager audioManager;
    private Handler handler;
    private AudioFocusRequest focusRequest;
    private int targetDeviceId = -1;
    private int targetDeviceType = -1;
    private String targetDeviceName = "USB-гарнитура";

    private final Runnable keepRoute = new Runnable() {
        @Override
        public void run() {
            tryApplyRoute();
            handler.postDelayed(this, 600);
        }
    };

    @Override
    public void onCreate() {
        super.onCreate();
        audioManager = getSystemService(AudioManager.class);
        handler = new Handler(Looper.getMainLooper());
        createChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_STOP.equals(intent.getAction())) {
            stopRouting();
            stopSelf();
            return START_NOT_STICKY;
        }

        if (intent != null) {
            targetDeviceId = intent.getIntExtra(EXTRA_DEVICE_ID, -1);
            targetDeviceType = intent.getIntExtra(EXTRA_DEVICE_TYPE, -1);
            targetDeviceName = intent.getStringExtra(EXTRA_DEVICE_NAME);
            if (targetDeviceName == null || targetDeviceName.isBlank()) {
                targetDeviceName = "USB-гарнитура";
            }
        }

        startForeground(NOTIFICATION_ID, buildNotification("Удерживаю маршрут: " + targetDeviceName));
        requestFocus();
        audioManager.setMode(AudioManager.MODE_IN_COMMUNICATION);
        handler.removeCallbacks(keepRoute);
        handler.post(keepRoute);
        return START_STICKY;
    }

    private void requestFocus() {
        AudioAttributes attributes = new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
                .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                .build();

        focusRequest = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
                .setAudioAttributes(attributes)
                .setAcceptsDelayedFocusGain(false)
                .setOnAudioFocusChangeListener(change -> {
                    if (change == AudioManager.AUDIOFOCUS_GAIN) {
                        tryApplyRoute();
                    }
                })
                .build();

        audioManager.requestAudioFocus(focusRequest);
    }

    private void tryApplyRoute() {
        if (Build.VERSION.SDK_INT < 31) {
            return;
        }

        AudioDeviceInfo target = findTarget(audioManager.getAvailableCommunicationDevices());
        if (target == null) {
            updateNotification("USB-устройство пропало из списка связи");
            return;
        }

        audioManager.setMode(AudioManager.MODE_IN_COMMUNICATION);
        AudioDeviceInfo current = audioManager.getCommunicationDevice();
        if (current == null || current.getId() != target.getId()) {
            boolean ok = audioManager.setCommunicationDevice(target);
            updateNotification(ok
                    ? "Маршрут активен: " + target.getProductName()
                    : "Android отказал в выборе: " + target.getProductName());
        }
    }

    private AudioDeviceInfo findTarget(List<AudioDeviceInfo> list) {
        for (AudioDeviceInfo device : list) {
            if (device.getId() == targetDeviceId) {
                return device;
            }
        }
        for (AudioDeviceInfo device : list) {
            if (device.getType() == targetDeviceType) {
                return device;
            }
        }
        for (AudioDeviceInfo device : list) {
            int type = device.getType();
            if (type == AudioDeviceInfo.TYPE_USB_HEADSET
                    || type == AudioDeviceInfo.TYPE_USB_DEVICE
                    || type == AudioDeviceInfo.TYPE_USB_ACCESSORY) {
                return device;
            }
        }
        return null;
    }

    private void stopRouting() {
        handler.removeCallbacks(keepRoute);
        if (Build.VERSION.SDK_INT >= 31) {
            audioManager.clearCommunicationDevice();
        }
        audioManager.setMode(AudioManager.MODE_NORMAL);
        if (focusRequest != null) {
            audioManager.abandonAudioFocusRequest(focusRequest);
            focusRequest = null;
        }
        stopForeground(STOP_FOREGROUND_REMOVE);
    }

    @Override
    public void onDestroy() {
        stopRouting();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private void createChannel() {
        NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "Удержание USB-аудио",
                NotificationManager.IMPORTANCE_LOW);
        channel.setDescription("Показывает, что приложение удерживает USB-выход для звонков");
        getSystemService(NotificationManager.class).createNotificationChannel(channel);
    }

    private Notification buildNotification(String text) {
        Intent openIntent = new Intent(this, MainActivity.class);
        PendingIntent pendingIntent = PendingIntent.getActivity(
                this,
                0,
                openIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        return new Notification.Builder(this, CHANNEL_ID)
                .setSmallIcon(android.R.drawable.stat_sys_headset)
                .setContentTitle("USB Call Audio Fix")
                .setContentText(text)
                .setContentIntent(pendingIntent)
                .setOngoing(true)
                .build();
    }

    private void updateNotification(String text) {
        getSystemService(NotificationManager.class)
                .notify(NOTIFICATION_ID, buildNotification(text));
    }
}
