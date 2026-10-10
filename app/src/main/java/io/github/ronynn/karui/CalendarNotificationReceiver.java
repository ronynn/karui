package io.github.ronynn.karui;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.drawable.Icon;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.Date;
import java.util.List;
import java.util.Locale;

public class CalendarNotificationReceiver extends BroadcastReceiver
{
  public static final String CHANNEL_ID        = "calendar_events_channel";
  public static final int    NOTIFICATION_ID   = 100;
  public static final String PREFS             = "calendar_prefs";
  public static final String KEY_EVENTS_JSON   = "events_json";
  public static final String KEY_ENABLED       = "calendar_notifications_enabled";
  public static final String KEY_LAST_NOTIFIED = "last_notified_date";
  public static final int    ALARM_REQUEST_ID  = 200;

  /** Sent by MainActivity whenever the cached event list changes.
   *  Triggers a *silent* in-place update only. Never pops a fresh alert. */
  public static final String ACTION_REFRESH = "io.github.ronynn.karui.REFRESH_CALENDAR";

  @Override
  public void onReceive(Context context, Intent intent)
  {
    SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    if (!prefs.getBoolean(KEY_ENABLED, false)) return;

    String action = intent != null ? intent.getAction() : null;
    boolean isRefresh = ACTION_REFRESH.equals(action);

    if (isRefresh)
    {
      // Silent path — update in place, but ONLY if we've already shown
      // today's notification. Prevents every app edit from re-firing it.
      showTodaysEvents(context, prefs, true);
    }
    else
    {
      // Alarm (or explicit "show now") — full notification with alert.
      showTodaysEvents(context, prefs, false);
      scheduleNext(context);
    }
  }

  private void showTodaysEvents(Context context, SharedPreferences prefs, boolean silent)
  {
    NotificationManager manager =
        (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
    if (manager == null) return;

    // Respect user's long-press → disable of the channel.
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
    {
      NotificationChannel ch = manager.getNotificationChannel(CHANNEL_ID);
      if (ch != null && ch.getImportance() == NotificationManager.IMPORTANCE_NONE) return;
    }

    String todayStr = new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date());
    String lastNotified = prefs.getString(KEY_LAST_NOTIFIED, "");
    boolean alreadyShownToday = todayStr.equals(lastNotified);

    // *** THE FIX *** — silent refreshes are no-ops until the alarm
    // (or user enabling the toggle) has shown today's notification at least once.
    if (silent && !alreadyShownToday) return;

    String json = prefs.getString(KEY_EVENTS_JSON, "[]");
    List<String> todays = new ArrayList<>();
    try
    {
      JSONArray arr = new JSONArray(json);
      for (int i = 0; i < arr.length(); i++)
      {
        JSONObject o = arr.getJSONObject(i);
        if (!todayStr.equals(o.optString("date", ""))) continue;
        String text = o.optString("text", "").trim();
        if (text.isEmpty()) continue;
        todays.add(o.optBoolean("completed", false) ? "✓ " + text : text);
      }
    }
    catch (Exception ignored) {}

    // Create / ensure the channel exists.
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
    {
      NotificationChannel channel = new NotificationChannel(
          CHANNEL_ID,
          "Calendar Events",
          NotificationManager.IMPORTANCE_DEFAULT);
      channel.setDescription("Daily reminder of today's calendar events. " +
                             "Long-press the notification to mute or disable.");
      manager.createNotificationChannel(channel);
    }

    // Nothing today — clean up if a silent refresh is just pruning an
    // outdated notification. On the alarm path, just mark the day as checked.
    if (todays.isEmpty())
    {
      manager.cancel(NOTIFICATION_ID);
      if (!silent) prefs.edit().putString(KEY_LAST_NOTIFIED, todayStr).apply();
      return;
    }

    // Open-app intent
    Intent openApp = new Intent(context, MainActivity.class);
    openApp.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
    int piFlags = PendingIntent.FLAG_UPDATE_CURRENT;
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) piFlags |= PendingIntent.FLAG_IMMUTABLE;
    PendingIntent pi = PendingIntent.getActivity(context, 0, openApp, piFlags);

    // Title / body
    String title, bigText;
    if (todays.size() == 1)
    {
      title   = "Today's event";
      bigText = todays.get(0);
    }
    else
    {
      title = "Today's events (" + todays.size() + ")";
      StringBuilder sb = new StringBuilder();
      int limit = Math.min(todays.size(), 8);
      for (int i = 0; i < limit; i++)
      {
        sb.append("• ").append(todays.get(i));
        if (i < limit - 1) sb.append('\n');
      }
      if (todays.size() > limit)
      {
        sb.append("\n…and ").append(todays.size() - limit).append(" more");
      }
      bigText = sb.toString();
    }

    Notification.Builder b;
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
    {
      b = new Notification.Builder(context, CHANNEL_ID);
    }
    else
    {
      b = new Notification.Builder(context);
    }

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M)
    {
      b.setSmallIcon(Icon.createWithResource(context, R.drawable.ic_note));
    }
    else
    {
      b.setSmallIcon(R.drawable.ic_note);
    }

    b.setContentTitle(title)
     .setContentText(todays.size() == 1 ? bigText : todays.get(0))
     .setStyle(new Notification.BigTextStyle().bigText(bigText))
     .setContentIntent(pi)
     .setAutoCancel(true)
     .setOnlyAlertOnce(true);   // <- silent updates when the notification is already visible

    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O)
    {
      b.setPriority(Notification.PRIORITY_DEFAULT);
    }

    manager.notify(NOTIFICATION_ID, b.build());

    // Only the alarm / explicit-show paths mark the day as "notified".
    // Silent refreshes never write this, so they stay idempotent.
    if (!silent)
    {
      prefs.edit().putString(KEY_LAST_NOTIFIED, todayStr).apply();
    }
  }

  // ---------------------------------------------------------------
  //  Scheduling (unchanged behaviour)
  // ---------------------------------------------------------------
  public static void scheduleNext(Context context)
  {
    AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
    if (am == null) return;

    Intent i = new Intent(context, CalendarNotificationReceiver.class);
    int flags = PendingIntent.FLAG_UPDATE_CURRENT;
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= PendingIntent.FLAG_IMMUTABLE;
    PendingIntent pi = PendingIntent.getBroadcast(context, ALARM_REQUEST_ID, i, flags);

    Calendar target = Calendar.getInstance();
    target.set(Calendar.HOUR_OF_DAY, 0);
    target.set(Calendar.MINUTE, 5);
    target.set(Calendar.SECOND, 0);
    target.set(Calendar.MILLISECOND, 0);
    if (target.getTimeInMillis() <= System.currentTimeMillis())
    {
      target.add(Calendar.DAY_OF_YEAR, 1);
    }
    long triggerAt = target.getTimeInMillis();

    try
    {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M)
      {
        am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pi);
      }
      else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT)
      {
        am.setExact(AlarmManager.RTC_WAKEUP, triggerAt, pi);
      }
      else
      {
        am.set(AlarmManager.RTC_WAKEUP, triggerAt, pi);
      }
    }
    catch (SecurityException se)
    {
      am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pi);
    }
  }

  public static void cancel(Context context)
  {
    AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
    if (am != null)
    {
      Intent i = new Intent(context, CalendarNotificationReceiver.class);
      int flags = PendingIntent.FLAG_UPDATE_CURRENT;
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= PendingIntent.FLAG_IMMUTABLE;
      PendingIntent pi = PendingIntent.getBroadcast(context, ALARM_REQUEST_ID, i, flags);
      am.cancel(pi);
      pi.cancel();
    }

    NotificationManager nm =
        (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
    if (nm != null) nm.cancel(NOTIFICATION_ID);
  }
}