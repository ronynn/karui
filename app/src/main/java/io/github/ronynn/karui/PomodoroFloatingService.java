package io.github.ronynn.karui;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.PixelFormat;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.Icon;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.provider.Settings;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.widget.LinearLayout;
import android.widget.TextView;

import java.util.Locale;

public class PomodoroFloatingService extends Service
{
  public static final String ACTION_START = "io.github.ronynn.karui.POMODORO_START_OVERLAY";
  public static final String ACTION_STOP  = "io.github.ronynn.karui.POMODORO_STOP_OVERLAY";
  public static final String EXTRA_END_TIME = "end_time_ms";

  private static final int FG_NOTIFICATION_ID = 998;
  private static final String FG_CHANNEL_ID = "pomodoro_fg_channel";
  private static final int STOP_ACTION_REQ_ID = 1001;

  private WindowManager wm;
  private View timerView;
  private TextView timerText;
  private WindowManager.LayoutParams lp;
  private final Handler handler = new Handler(Looper.getMainLooper());
  private long endTimeMs = 0;
  private boolean finished = false;

  private final Runnable tickRunnable = new Runnable()
  {
    @Override
    public void run()
    {
      if (endTimeMs <= 0) return;
      long remaining = endTimeMs - System.currentTimeMillis();
      if (remaining <= 0)
      {
        onTimerDone();
        return;
      }
      updateDisplay(remaining);
      handler.postDelayed(this, 1000);
    }
  };

  @Override
  public IBinder onBind(Intent intent) { return null; }

  @Override
  public int onStartCommand(Intent intent, int flags, int startId)
  {
    if (intent == null) { stopSelf(); return START_NOT_STICKY; }
    String action = intent.getAction();

    if (ACTION_STOP.equals(action))
    {
      stopEverything(true);
      return START_NOT_STICKY;
    }

    long end = intent.getLongExtra(EXTRA_END_TIME, 0);
    if (end <= 0) { stopSelf(); return START_NOT_STICKY; }

    endTimeMs = end;
    finished = false;

    ensureForeground();

    // No overlay permission → the FGS notification IS the timer. Keep the
    // service alive so the user has the live countdown + Stop action; no
    // separate fallback notification needed. Just skip the overlay.
    boolean hasOverlay = Build.VERSION.SDK_INT < Build.VERSION_CODES.M
      || Settings.canDrawOverlays(this);

    if (hasOverlay)
    {
      ensureOverlay();
    }

    startTicking();
    return START_NOT_STICKY;
  }

  @Override
  public void onDestroy()
  {
    handler.removeCallbacksAndMessages(null);
    removeOverlay();
    stopForeground(true);
    super.onDestroy();
  }

  // ── Foreground notification (with live countdown + Stop action) ──

  private void ensureForeground()
  {
    NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && nm != null)
    {
      // LOW, not MIN. MIN fully collapses the notification on most ROMs,
      // which hides the chronometer area — the whole point of this notification.
      // LOW shows it normally: no sound, no peek, hidden on lockscreen.
      NotificationChannel ch = new NotificationChannel(
          FG_CHANNEL_ID, "Pomodoro Timer",
          NotificationManager.IMPORTANCE_LOW);
      ch.setShowBadge(false);
      ch.setSound(null, null);
      ch.enableVibration(false);
      ch.setLockscreenVisibility(Notification.VISIBILITY_SECRET);
      nm.createNotificationChannel(ch);
    }

    Notification.Builder b;
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
      b = new Notification.Builder(this, FG_CHANNEL_ID);
    else
    {
      b = new Notification.Builder(this);
      b.setPriority(Notification.PRIORITY_LOW);
    }

    // Title only — no content text. With setUsesChronometer(true), the OS
    // replaces the "when" field (usually the time-stamp, top-right of the
    // notification) with a live ticker. setChronometerCountDown makes it
    // count DOWN to `endTimeMs`. Result when collapsed:
    //     [icon] Karui    24:53
    //            Pomodoro
    // When expanded: Stop button appears.
    b.setContentTitle("Pomodoro")
     .setSmallIcon(R.drawable.ic_note)
     .setOngoing(true)
     .setShowWhen(true)
     .setWhen(endTimeMs)
     .setUsesChronometer(true)
     .setCategory(Notification.CATEGORY_PROGRESS);

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N)
    {
      b.setChronometerCountDown(true);
    }

    // Stop action — fires ACTION_POMODORO_CANCEL at the receiver, which
    // cancels the alarm, clears state, and stops this service.
    Intent stopIntent = new Intent(this, CalendarNotificationReceiver.class);
    stopIntent.setAction(CalendarNotificationReceiver.ACTION_POMODORO_CANCEL);
    int flags = PendingIntent.FLAG_UPDATE_CURRENT;
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= PendingIntent.FLAG_IMMUTABLE;
    PendingIntent stopPi = PendingIntent.getBroadcast(this, STOP_ACTION_REQ_ID, stopIntent, flags);

    Notification.Action.Builder ab;
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M)
    {
      ab = new Notification.Action.Builder(
          Icon.createWithResource(this, R.drawable.ic_note), "Stop", stopPi);
    }
    else
    {
      ab = new Notification.Action.Builder(0, "Stop", stopPi);
    }
    b.addAction(ab.build());

    try
    {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE)
      {
        startForeground(FG_NOTIFICATION_ID, b.build(),
            ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
      }
      else
      {
        startForeground(FG_NOTIFICATION_ID, b.build());
      }
      android.util.Log.i("KaruiPomodoro", "startForeground OK end=" + endTimeMs);
    }
    catch (Throwable t)
    {
      android.util.Log.e("KaruiPomodoro",
          "startForeground FAILED: " + t.getClass().getSimpleName() + ": " + t.getMessage());
    }
  }

  // ── Draggable overlay window ────────────────────────────────────

  private void ensureOverlay()
  {
    if (timerView != null) return;
    wm = (WindowManager) getSystemService(WINDOW_SERVICE);
    if (wm == null)
    {
      android.util.Log.e("KaruiPomodoro", "WindowManager null");
      return;
    }

    timerView = buildTimerView();

    int type = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
      ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
      : WindowManager.LayoutParams.TYPE_PHONE;

    lp = new WindowManager.LayoutParams(
      WindowManager.LayoutParams.WRAP_CONTENT,
      WindowManager.LayoutParams.WRAP_CONTENT,
      type,
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
        | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
      PixelFormat.TRANSLUCENT
    );
    lp.gravity = Gravity.TOP | Gravity.START;
    lp.x = dp(20);
    lp.y = dp(120);

    setupDrag(timerView);

    try
    {
      wm.addView(timerView, lp);
      android.util.Log.i("KaruiPomodoro", "addView OK");
    }
    catch (Throwable t)
    {
      android.util.Log.e("KaruiPomodoro",
          "addView FAILED: " + t.getClass().getSimpleName() + ": " + t.getMessage());
      timerView = null;
    }
  }

  private View buildTimerView()
  {
    LinearLayout root = new LinearLayout(this);
    root.setOrientation(LinearLayout.HORIZONTAL);
    root.setGravity(Gravity.CENTER);

    int padH = dp(12);
    int padV = dp(6);
    root.setPadding(padH, padV, padH, padV);

    // Rectangle (no corners), medium-grey translucent fill, thin border.
    GradientDrawable bg = new GradientDrawable();
    bg.setColor(0xB0505050);
    bg.setStroke(dp(1), 0xFF8B8B8B);
    root.setBackground(bg);

    timerText = new TextView(this);
    timerText.setText("25:00");
    timerText.setTextColor(0xFFFABD2F);
    timerText.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
    timerText.setTypeface(Typeface.MONOSPACE, Typeface.BOLD);
    timerText.setIncludeFontPadding(false);
    root.addView(timerText);

    return root;
  }

  private void setupDrag(final View v)
  {
    v.setOnTouchListener(new View.OnTouchListener()
    {
      private float initialX, initialY, initialTouchX, initialTouchY;
      private boolean dragging = false;
      private long downTime = 0;

      @Override
      public boolean onTouch(View view, MotionEvent event)
      {
        switch (event.getActionMasked())
        {
          case MotionEvent.ACTION_DOWN:
            initialX = lp.x;
            initialY = lp.y;
            initialTouchX = event.getRawX();
            initialTouchY = event.getRawY();
            dragging = false;
            downTime = System.currentTimeMillis();
            return true;

          case MotionEvent.ACTION_MOVE:
          {
            float dx = event.getRawX() - initialTouchX;
            float dy = event.getRawY() - initialTouchY;
            if (Math.abs(dx) > dp(6) || Math.abs(dy) > dp(6)) dragging = true;
            if (dragging && wm != null && timerView != null)
            {
              lp.x = (int) (initialX + dx);
              lp.y = (int) (initialY + dy);
              try { wm.updateViewLayout(timerView, lp); } catch (Exception ignored) {}
            }
            return true;
          }

          case MotionEvent.ACTION_UP:
            if (!dragging)
            {
              long held = System.currentTimeMillis() - downTime;
              if (held > 600) stopEverything(true);
              else openApp();
            }
            return true;
        }
        return false;
      }
    });
  }

  // ── Timer loop ──────────────────────────────────────────────────

  private void startTicking()
  {
    handler.removeCallbacksAndMessages(null);
    updateDisplay(endTimeMs - System.currentTimeMillis());
    handler.postDelayed(tickRunnable, 1000);
  }

  private void updateDisplay(long remaining)
  {
    if (timerText == null) return;
    long s = Math.max(0, (remaining + 999) / 1000);
    long m = s / 60;
    long sec = s % 60;
    timerText.setText(String.format(Locale.US, "%02d:%02d", m, sec));
  }

  private void onTimerDone()
  {
    if (finished) return;
    finished = true;
    // Post completion notification first (ID 999). Then stopSelf → FGS
    // notification (ID 998) is removed in onDestroy. End state: only 999.
    CalendarNotificationReceiver.notifyPomodoroDone(this);
    stopSelf();
  }

  private void stopEverything(boolean fromUser)
  {
    if (fromUser)
    {
      CalendarNotificationReceiver.cancelPomodoro(this);
    }
    stopSelf();
  }

  private void removeOverlay()
  {
    if (timerView != null && wm != null)
    {
      try { wm.removeView(timerView); } catch (Exception ignored) {}
    }
    timerView = null;
  }

  private void openApp()
  {
    Intent i = new Intent(this, MainActivity.class);
    i.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
    try { startActivity(i); } catch (Exception ignored) {}
  }

  private int dp(int v)
  {
    return (int) (v * getResources().getDisplayMetrics().density);
  }
}