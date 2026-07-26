package ru.pavelord.usbaudioroute;

import android.app.Application;
import android.content.Context;
import android.content.Intent;
import android.media.AudioDeviceCallback;
import android.media.AudioDeviceInfo;
import android.media.AudioManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.widget.Toast;

import java.util.List;
import java.util.Set;
import java.util.concurrent.atomic.AtomicBoolean;

import de.robv.android.xposed.IXposedHookLoadPackage;
import de.robv.android.xposed.XC_MethodHook;
import de.robv.android.xposed.XposedBridge;
import de.robv.android.xposed.XposedHelpers;
import de.robv.android.xposed.callbacks.XC_LoadPackage;

public final class XposedEntry implements IXposedHookLoadPackage {
    private static final Set<String> TARGET_PACKAGES = Set.of(
            "com.discord",
            "com.discord.beta",
            "com.discord.alpha",
            "com.discord.canary"
    );

    private static final String MODULE_PACKAGE = "ru.pavelord.usbaudioroute";
    private static final ThreadLocal<Boolean> INTERNAL_CALL = ThreadLocal.withInitial(() -> false);
    private static final AtomicBoolean INITIALIZED = new AtomicBoolean(false);

    private static Context appContext;
    private static AudioManager audioManager;
    private static Handler handler;
    private static int consecutiveFailures;
    private static int lastReportedDeviceId = -1;
    private static String lastReport = "";

    private static final Runnable routeLoop = new Runnable() {
        @Override
        public void run() {
            tryRoute("periodic");
            int delay = isCommunicationMode() ? 300 : 1800;
            handler.postDelayed(this, delay);
        }
    };

    @Override
    public void handleLoadPackage(XC_LoadPackage.LoadPackageParam lpparam) {
        if (!TARGET_PACKAGES.contains(lpparam.packageName)) return;

        XposedBridge.log("DiscordUsbAudioRoute: loading into " + lpparam.packageName + " / " + lpparam.processName);

        XposedHelpers.findAndHookMethod(
                Application.class,
                "attach",
                Context.class,
                new XC_MethodHook() {
                    @Override
                    protected void afterHookedMethod(MethodHookParam param) {
                        Context context = (Context) param.args[0];
                        initialize(context.getApplicationContext());
                    }
                }
        );

        hookAudioManagerMethods();
    }

    private static void initialize(Context context) {
        if (!INITIALIZED.compareAndSet(false, true)) return;
        appContext = context;
        audioManager = context.getSystemService(AudioManager.class);
        handler = new Handler(Looper.getMainLooper());

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            audioManager.addOnModeChangedListener(context.getMainExecutor(), mode -> {
                report("Режим Discord изменён: " + mode);
                if (mode == AudioManager.MODE_IN_COMMUNICATION || mode == AudioManager.MODE_IN_CALL) {
                    scheduleBurst("mode=" + mode);
                }
            });

            audioManager.addOnCommunicationDeviceChangedListener(context.getMainExecutor(), device -> {
                if (device != null && !isUsb(device) && findUsbSink() != null) {
                    handler.postDelayed(() -> tryRoute("device changed to " + describe(device)), 40);
                }
            });
        }

        audioManager.registerAudioDeviceCallback(new AudioDeviceCallback() {
            @Override
            public void onAudioDevicesAdded(AudioDeviceInfo[] addedDevices) {
                for (AudioDeviceInfo device : addedDevices) {
                    if (isUsb(device) && device.isSink()) {
                        report("Обнаружена USB-гарнитура: " + describe(device));
                        scheduleBurst("USB connected");
                        break;
                    }
                }
            }

            @Override
            public void onAudioDevicesRemoved(AudioDeviceInfo[] removedDevices) {
                for (AudioDeviceInfo device : removedDevices) {
                    if (isUsb(device)) {
                        report("USB-гарнитура отключена");
                        lastReportedDeviceId = -1;
                        break;
                    }
                }
            }
        }, handler);

        handler.removeCallbacks(routeLoop);
        handler.post(routeLoop);
        scheduleBurst("Discord process attached");
    }

    private static void hookAudioManagerMethods() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            XposedHelpers.findAndHookMethod(
                    AudioManager.class,
                    "setCommunicationDevice",
                    AudioDeviceInfo.class,
                    new XC_MethodHook() {
                        @Override
                        protected void beforeHookedMethod(MethodHookParam param) {
                            if (Boolean.TRUE.equals(INTERNAL_CALL.get())) return;
                            AudioDeviceInfo requested = (AudioDeviceInfo) param.args[0];
                            AudioDeviceInfo usb = findUsbSink();
                            if (usb == null || requested == null || isUsb(requested)) return;

                            int type = requested.getType();
                            if (type == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER
                                    || type == AudioDeviceInfo.TYPE_BUILTIN_EARPIECE) {
                                param.args[0] = usb;
                                report("Discord запросил " + describe(requested) + "; подменено на " + describe(usb));
                            }
                        }

                        @Override
                        protected void afterHookedMethod(MethodHookParam param) {
                            if (Boolean.TRUE.equals(INTERNAL_CALL.get())) return;
                            handlerSafePost(() -> tryRoute("after Discord setCommunicationDevice"), 60);
                        }
                    }
            );

            XposedHelpers.findAndHookMethod(
                    AudioManager.class,
                    "clearCommunicationDevice",
                    new XC_MethodHook() {
                        @Override
                        protected void afterHookedMethod(MethodHookParam param) {
                            if (Boolean.TRUE.equals(INTERNAL_CALL.get())) return;
                            handlerSafePost(() -> tryRoute("after Discord clearCommunicationDevice"), 40);
                        }
                    }
            );
        }

        XposedHelpers.findAndHookMethod(
                AudioManager.class,
                "setMode",
                int.class,
                new XC_MethodHook() {
                    @Override
                    protected void afterHookedMethod(MethodHookParam param) {
                        if (Boolean.TRUE.equals(INTERNAL_CALL.get())) return;
                        int mode = (int) param.args[0];
                        if (mode == AudioManager.MODE_IN_COMMUNICATION || mode == AudioManager.MODE_IN_CALL) {
                            handlerSafePost(() -> scheduleBurst("Discord setMode=" + mode), 20);
                        }
                    }
                }
        );

        XposedHelpers.findAndHookMethod(
                AudioManager.class,
                "setSpeakerphoneOn",
                boolean.class,
                new XC_MethodHook() {
                    @Override
                    protected void beforeHookedMethod(MethodHookParam param) {
                        if (Boolean.TRUE.equals(INTERNAL_CALL.get())) return;
                        if ((boolean) param.args[0] && findUsbSink() != null) {
                            param.args[0] = false;
                            report("Запрос Discord на громкую связь заблокирован: USB подключён");
                        }
                    }

                    @Override
                    protected void afterHookedMethod(MethodHookParam param) {
                        if (Boolean.TRUE.equals(INTERNAL_CALL.get())) return;
                        handlerSafePost(() -> tryRoute("after setSpeakerphoneOn"), 60);
                    }
                }
        );
    }

    private static void scheduleBurst(String reason) {
        if (handler == null) return;
        long[] delays = {0, 80, 250, 700, 1500, 3000};
        for (long delay : delays) {
            handler.postDelayed(() -> tryRoute(reason + " +" + delay), delay);
        }
    }

    private static void tryRoute(String reason) {
        if (audioManager == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return;
        AudioDeviceInfo target = findUsbSink();
        if (target == null) return;

        AudioDeviceInfo current;
        try {
            current = audioManager.getCommunicationDevice();
        } catch (Throwable error) {
            report("Не удалось прочитать текущий маршрут: " + error.getClass().getSimpleName());
            return;
        }

        if (current != null && current.getId() == target.getId()) {
            consecutiveFailures = 0;
            if (lastReportedDeviceId != target.getId()) {
                lastReportedDeviceId = target.getId();
                report("USB-маршрут активен: " + describe(target));
                toast("USB-маршрут активен");
            }
            return;
        }

        boolean accepted = false;
        Throwable failure = null;
        INTERNAL_CALL.set(true);
        try {
            accepted = audioManager.setCommunicationDevice(target);
            if (!accepted) {
                audioManager.clearCommunicationDevice();
                accepted = audioManager.setCommunicationDevice(target);
            }
        } catch (Throwable error) {
            failure = error;
        } finally {
            INTERNAL_CALL.set(false);
        }

        AudioDeviceInfo after = null;
        try {
            after = audioManager.getCommunicationDevice();
        } catch (Throwable ignored) {
        }

        boolean active = after != null && after.getId() == target.getId();
        if (accepted || active) {
            consecutiveFailures = 0;
            lastReportedDeviceId = target.getId();
            report("USB-маршрут принят [" + reason + "]: " + describe(target)
                    + "; выбран: " + describe(after));
            toast("Звук звонка направлен в USB-наушники");
        } else {
            consecutiveFailures++;
            if (consecutiveFailures == 1 || consecutiveFailures % 10 == 0) {
                String detail = failure == null ? "Android вернул false" : failure.getClass().getSimpleName() + ": " + failure.getMessage();
                report("USB-маршрут отклонён [" + reason + "]: " + detail
                        + "; режим=" + audioManager.getMode()
                        + "; выбран=" + describe(after));
            }
        }
    }

    private static AudioDeviceInfo findUsbSink() {
        if (audioManager == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return null;
        try {
            List<AudioDeviceInfo> devices = audioManager.getAvailableCommunicationDevices();
            for (int preferredType : new int[]{
                    AudioDeviceInfo.TYPE_USB_HEADSET,
                    AudioDeviceInfo.TYPE_USB_DEVICE,
                    AudioDeviceInfo.TYPE_USB_ACCESSORY
            }) {
                for (AudioDeviceInfo device : devices) {
                    if (device.getType() == preferredType && device.isSink()) return device;
                }
            }
        } catch (Throwable error) {
            XposedBridge.log("DiscordUsbAudioRoute findUsbSink failed: " + error);
        }
        return null;
    }

    private static boolean isCommunicationMode() {
        if (audioManager == null) return false;
        int mode = audioManager.getMode();
        return mode == AudioManager.MODE_IN_COMMUNICATION || mode == AudioManager.MODE_IN_CALL;
    }

    private static boolean isUsb(AudioDeviceInfo device) {
        if (device == null) return false;
        int type = device.getType();
        return type == AudioDeviceInfo.TYPE_USB_HEADSET
                || type == AudioDeviceInfo.TYPE_USB_DEVICE
                || type == AudioDeviceInfo.TYPE_USB_ACCESSORY;
    }

    private static String describe(AudioDeviceInfo device) {
        if (device == null) return "нет";
        return device.getProductName() + " / type=" + device.getType() + " / ID=" + device.getId();
    }

    private static void handlerSafePost(Runnable runnable, long delay) {
        if (handler != null) handler.postDelayed(runnable, delay);
    }

    private static void toast(String text) {
        if (appContext == null || handler == null) return;
        handler.post(() -> {
            try {
                Toast.makeText(appContext, text, Toast.LENGTH_SHORT).show();
            } catch (Throwable ignored) {
            }
        });
    }

    private static void report(String status) {
        if (status == null || status.equals(lastReport)) return;
        lastReport = status;
        XposedBridge.log("DiscordUsbAudioRoute: " + status);
        if (appContext == null) return;
        try {
            Intent intent = new Intent(StatusReceiver.ACTION_STATUS)
                    .setPackage(MODULE_PACKAGE)
                    .putExtra(StatusReceiver.EXTRA_STATUS, status);
            appContext.sendBroadcast(intent);
        } catch (Throwable ignored) {
        }
    }
}
