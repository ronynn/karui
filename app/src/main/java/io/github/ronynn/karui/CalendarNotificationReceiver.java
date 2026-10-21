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
  public static final String CHANNEL_ID          = "calendar_events_channel";
  public static final int    NOTIFICATION_ID     = 100;
  public static final int    EVENT_NOTIFICATION_BASE = 1000;
  public static final String PREFS               = "calendar_prefs";
  public static final String KEY_EVENTS_JSON     = "events_json";
  public static final String KEY_ENABLED         = "calendar_notifications_enabled";
  public static final String KEY_LAST_NOTIFIED   = "last_notified_date";
  public static final String KEY_SCHEDULED_IDS   = "scheduled_event_ids";
  public static final int    ALARM_REQUEST_ID    = 200;

  public static final String EXTRA_EVENT_ID      = "event_id";

  public static final String ACTION_REFRESH = "io.github.ronynn.karui.REFRESH_CALENDAR";

  private static final long REMINDER_LEAD_MS = 5 * 60 * 1000L;

  @Override
  public void onReceive(Context context, Intent intent)
  {
    SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    if (!prefs.getBoolean(KEY_ENABLED, false)) return;

    String action = intent != null ? intent.getAction() : null;
    boolean isRefresh = ACTION_REFRESH.equals(action);
    int eventId = intent != null ? intent.getIntExtra(EXTRA_EVENT_ID, -1) : -1;

    if (isRefresh)
    {
      showTodaysEvents(context, prefs, true);
      scheduleEventReminders(context);
    }
    else if (eventId >= 0)
    {
      showEventNotification(context, eventId);
    }
    else
    {
      showTodaysEvents(context, prefs, false);
      scheduleNext(context);
      scheduleEventReminders(context);
    }
  }

  // ------------------------------------------------------------------
  //  Daily summary — UNTIMED events only
  // ------------------------------------------------------------------
  private void showTodaysEvents(Context context, SharedPreferences prefs, boolean silent)
  {
    NotificationManager manager =
        (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
    if (manager == null) return;

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
    {
      NotificationChannel ch = manager.getNotificationChannel(CHANNEL_ID);
      if (ch != null && ch.getImportance() == NotificationManager.IMPORTANCE_NONE) return;
    }

    String todayStr = new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date());
    String lastNotified = prefs.getString(KEY_LAST_NOTIFIED, "");
    boolean alreadyShownToday = todayStr.equals(lastNotified);

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
        if (o.optBoolean("completed", false)) continue;

        String time = o.optString("time", "");
        if (!time.isEmpty()) continue;   // timed events have their own alarm

        String text = o.optString("text", "").trim();
        if (text.isEmpty()) continue;
        todays.add(text);
      }
    }
    catch (Exception ignored) {}

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
    {
      NotificationChannel channel = new NotificationChannel(
          CHANNEL_ID,
          "Calendar Events",
          NotificationManager.IMPORTANCE_DEFAULT);
      channel.setDescription("Reminders for calendar events. Tap an event " +
                             "reminder to open the app and mark it done.");
      manager.createNotificationChannel(channel);
    }

    if (todays.isEmpty())
    {
      manager.cancel(NOTIFICATION_ID);
      if (!silent) prefs.edit().putString(KEY_LAST_NOTIFIED, todayStr).apply();
      return;
    }

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

    Notification.Builder b = buildBaseBuilder(context);
    b.setContentTitle(title)
     .setContentText(todays.size() == 1 ? bigText : todays.get(0))
     .setStyle(new Notification.BigTextStyle().bigText(bigText))
     .setContentIntent(openAppIntent(context))
     .setAutoCancel(true)
     .setOnlyAlertOnce(true);

    manager.notify(NOTIFICATION_ID, b.build());

    if (!silent)
    {
      prefs.edit().putString(KEY_LAST_NOTIFIED, todayStr).apply();
    }
  }

  // ------------------------------------------------------------------
  //  Per-event time reminder — persists until the event is marked done
  // ------------------------------------------------------------------
  private static void showEventNotification(Context context, int eventId)
  {
    SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    String json = prefs.getString(KEY_EVENTS_JSON, "[]");
    String todayStr = new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date());

    String eventText = null;
    String eventTime = null;
    try
    {
      JSONArray arr = new JSONArray(json);
      for (int i = 0; i < arr.length(); i++)
      {
        JSONObject o = arr.getJSONObject(i);
        if (o.optInt("id", 0) != eventId) continue;
        if (!todayStr.equals(o.optString("date", ""))) continue;

        if (o.optBoolean("completed", false))
        {
          NotificationManager nmStale =
              (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
          if (nmStale != null)
          {
            nmStale.cancel(EVENT_NOTIFICATION_BASE + Math.abs(eventId % 100000));
          }
          return;
        }

        eventText = o.optString("text", "").trim();
        eventTime = o.optString("time", "");
        break;
      }
    }
    catch (Exception ignored) {}

    if (eventText == null || eventText.isEmpty()) return;

    NotificationManager manager =
        (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
    if (manager == null) return;

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
    {
      NotificationChannel ch = manager.getNotificationChannel(CHANNEL_ID);
      if (ch != null && ch.getImportance() == NotificationManager.IMPORTANCE_NONE) return;
    }

    Notification.Builder b = buildBaseBuilder(context);
    b.setContentTitle(eventTime == null || eventTime.isEmpty() ? "Reminder" : "Reminder · " + eventTime)
     .setContentText(eventText)
     .setStyle(new Notification.BigTextStyle().bigText(eventText))
     .setContentIntent(openAppIntent(context))
     .setAutoCancel(false)
     .setOngoing(true)
     .setOnlyAlertOnce(true);

    int notifId = EVENT_NOTIFICATION_BASE + Math.abs(eventId % 100000);
    manager.notify(notifId, b.build());
  }

  private static Notification.Builder buildBaseBuilder(Context context)
  {
    Notification.Builder b;
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
    {
      b = new Notification.Builder(context, CHANNEL_ID);
    }
    else
    {
      b = new Notification.Builder(context);
      b.setPriority(Notification.PRIORITY_DEFAULT);
    }

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M)
    {
      b.setSmallIcon(Icon.createWithResource(context, R.drawable.ic_note));
    }
    else
    {
      b.setSmallIcon(R.drawable.ic_note);
    }
    return b;
  }

  private static PendingIntent openAppIntent(Context context)
  {
    Intent openApp = new Intent(context, MainActivity.class);
    openApp.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
    int piFlags = PendingIntent.FLAG_UPDATE_CURRENT;
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) piFlags |= PendingIntent.FLAG_IMMUTABLE;
    return PendingIntent.getActivity(context, 0, openApp, piFlags);
  }

  // ------------------------------------------------------------------
  //  Scheduling
  // ------------------------------------------------------------------
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

    setExactCompat(am, target.getTimeInMillis(), pi);
  }

  public static void scheduleEventReminders(Context context)
  {
    SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    if (!prefs.getBoolean(KEY_ENABLED, false)) return;

    AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
    if (am == null) return;

    NotificationManager nmClean =
        (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
    if (nmClean != null)
    {
      try
      {
        JSONArray cur = new JSONArray(prefs.getString(KEY_EVENTS_JSON, "[]"));
        for (int i = 0; i < cur.length(); i++)
        {
          JSONObject o = cur.getJSONObject(i);
          if (!o.optBoolean("completed", false)) continue;
          int eid = o.optInt("id", 0);
          nmClean.cancel(EVENT_NOTIFICATION_BASE + Math.abs(eid % 100000));
        }
      }
      catch (Exception ignored) {}
    }

    try
    {
      JSONArray prev = new JSONArray(prefs.getString(KEY_SCHEDULED_IDS, "[]"));
      for (int i = 0; i < prev.length(); i++)
      {
        int rid = prev.getInt(i);
        Intent ci = new Intent(context, CalendarNotificationReceiver.class);
        int cf = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) cf |= PendingIntent.FLAG_IMMUTABLE;
        PendingIntent cpi = PendingIntent.getBroadcast(context, rid, ci, cf);
        am.cancel(cpi);
        cpi.cancel();
      }
    }
    catch (Exception ignored) {}

    String json = prefs.getString(KEY_EVENTS_JSON, "[]");
    String today = new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date());
    List<Integer> newIds = new ArrayList<>();
    long now = System.currentTimeMillis();

    try
    {
      JSONArray arr = new JSONArray(json);
      for (int i = 0; i < arr.length(); i++)
      {
        JSONObject o = arr.getJSONObject(i);
        if (!today.equals(o.optString("date", ""))) continue;
        if (o.optBoolean("completed", false)) continue;
        String time = o.optString("time", "");
        if (time.isEmpty() || !time.contains(":")) continue;

        String[] hm = time.split(":");
        int h, m;
        try
        {
          h = Integer.parseInt(hm[0]);
          m = Integer.parseInt(hm[1]);
        }
        catch (Exception e) { continue; }

        Calendar target = Calendar.getInstance();
        target.set(Calendar.HOUR_OF_DAY, h);
        target.set(Calendar.MINUTE, m);
        target.set(Calendar.SECOND, 0);
        target.set(Calendar.MILLISECOND, 0);

        // Past-due: fire right now so the reminder is visible, and keep it
        // there until the user marks the event done.
        if (target.getTimeInMillis() <= now)
        {
          showEventNotification(context, o.optInt("id", 0));
          continue;
        }

        long trigger = target.getTimeInMillis() - REMINDER_LEAD_MS;
        if (trigger <= now)
        {
          trigger = target.getTimeInMillis();
          if (trigger <= now) continue;
        }

        int rid = 300 + Math.abs(o.optInt("id", 0) % 100000);
        Intent ei = new Intent(context, CalendarNotificationReceiver.class);
        ei.putExtra(EXTRA_EVENT_ID, o.optInt("id", 0));
        int ef = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) ef |= PendingIntent.FLAG_IMMUTABLE;
        PendingIntent epi = PendingIntent.getBroadcast(context, rid, ei, ef);

        setExactCompat(am, trigger, epi);
        newIds.add(rid);
      }
    }
    catch (Exception ignored) {}

    prefs.edit().putString(KEY_SCHEDULED_IDS, new JSONArray(newIds).toString()).apply();
  }

  public static void cancelEventReminders(Context context)
  {
    SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
    if (am == null) return;

    try
    {
      JSONArray prev = new JSONArray(prefs.getString(KEY_SCHEDULED_IDS, "[]"));
      for (int i = 0; i < prev.length(); i++)
      {
        int rid = prev.getInt(i);
        Intent ci = new Intent(context, CalendarNotificationReceiver.class);
        int cf = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) cf |= PendingIntent.FLAG_IMMUTABLE;
        PendingIntent cpi = PendingIntent.getBroadcast(context, rid, ci, cf);
        am.cancel(cpi);
        cpi.cancel();
      }
    }
    catch (Exception ignored) {}

    prefs.edit().putString(KEY_SCHEDULED_IDS, "[]").apply();

    NotificationManager nm =
        (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
    if (nm != null)
    {
      try
      {
        JSONArray arr = new JSONArray(prefs.getString(KEY_EVENTS_JSON, "[]"));
        for (int i = 0; i < arr.length(); i++)
        {
          JSONObject o = arr.getJSONObject(i);
          int eid = o.optInt("id", 0);
          nm.cancel(EVENT_NOTIFICATION_BASE + Math.abs(eid % 100000));
        }
      }
      catch (Exception ignored) {}
    }
  }

  private static void setExactCompat(AlarmManager am, long triggerAt, PendingIntent pi)
  {
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

    cancelEventReminders(context);

    NotificationManager nm =
        (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
    if (nm != null) nm.cancel(NOTIFICATION_ID);
  }
}