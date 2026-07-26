package ru.pavelord.usbaudioroute;

import android.app.Activity;
import android.content.Context;
import android.graphics.Typeface;
import android.os.Bundle;
import android.text.format.DateFormat;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import java.util.Date;

public final class MainActivity extends Activity {
    private TextView status;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        ScrollView scroll = new ScrollView(this);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(20), dp(22), dp(20), dp(28));
        scroll.addView(root);

        TextView title = new TextView(this);
        title.setText("Discord USB Audio Route");
        title.setTextSize(25);
        title.setTypeface(Typeface.DEFAULT_BOLD);
        root.addView(title);

        TextView body = new TextView(this);
        body.setText(
                "Это Xposed-модуль. Сам по себе он ничего не меняет: его нужно встроить в актуальный Discord через LSPatch/MRVPatch либо включить для Discord в LSPosed.\n\n" +
                "Модуль не заставляет Android менять режим звонка. Он работает внутри процесса Discord: когда Discord выбирает динамик, модуль подменяет выбор на подключённую USB-гарнитуру и повторяет маршрут при сбросе.\n\n" +
                "Порядок теста:\n" +
                "1. Подключить USB-гарнитуру.\n" +
                "2. Полностью закрыть и снова открыть пропатченный Discord.\n" +
                "3. Зайти в голосовой канал.\n" +
                "4. Дождаться сообщения «USB-маршрут принят»."
        );
        body.setTextSize(16);
        body.setPadding(0, dp(14), 0, dp(16));
        root.addView(body);

        Button refresh = new Button(this);
        refresh.setText("Обновить последний статус");
        refresh.setOnClickListener(v -> updateStatus());
        root.addView(refresh);

        status = new TextView(this);
        status.setTextSize(15);
        status.setPadding(0, dp(18), 0, 0);
        root.addView(status);

        setContentView(scroll);
        updateStatus();
    }

    @Override
    protected void onResume() {
        super.onResume();
        updateStatus();
    }

    private void updateStatus() {
        var prefs = getSharedPreferences("status", Context.MODE_PRIVATE);
        String text = prefs.getString("last", "Статус от Discord ещё не получен.");
        long time = prefs.getLong("time", 0L);
        if (time > 0L) {
            text += "\nВремя: " + DateFormat.getDateFormat(this).format(new Date(time)) + " "
                    + DateFormat.getTimeFormat(this).format(new Date(time));
        }
        status.setText(text);
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}
