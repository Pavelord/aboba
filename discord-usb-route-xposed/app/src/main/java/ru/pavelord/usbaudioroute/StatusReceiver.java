package ru.pavelord.usbaudioroute;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public final class StatusReceiver extends BroadcastReceiver {
    static final String ACTION_STATUS = "ru.pavelord.usbaudioroute.STATUS";
    static final String EXTRA_STATUS = "status";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (!ACTION_STATUS.equals(intent.getAction())) return;
        String status = intent.getStringExtra(EXTRA_STATUS);
        if (status == null || status.isBlank()) return;
        context.getSharedPreferences("status", Context.MODE_PRIVATE)
                .edit()
                .putString("last", status)
                .putLong("time", System.currentTimeMillis())
                .apply();
    }
}
