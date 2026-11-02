package io.github.ronynn.karui;

import android.Manifest;
import android.app.Activity;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.RemoteInput;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.drawable.Icon;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.service.notification.StatusBarNotification;
import android.widget.Toast;

/**
 * Everything related to the quick-note notification: channel setup,
 * posting, cancelling, and reconciling state across app launches.
 *
 * Extracted from MainActivity so MainActivity stays focused on the
 * WebView / overlay lifecycle. All methods are static, all state lives
 * in SharedPreferences ("note_queue" / "notification_enabled").
 */
public final class NotificationHelper
{
  public static final String CHANNEL_ID = "note_reply_channel";
  public static final int    NOTIFICATION_ID = 1;

  private static final String PREFS_NOTE_QUEUE = "note_queue";
  private static final String KEY_NOTIFICATION_ENABLED = "notification_enabled";

  private NotificationHelper() {}  // no instances

  public static void createChannel(Context context)
  {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
    {
      NotificationChannel channel = new NotificationChannel(
          CHANNEL_ID, "Quick Note", NotificationManager.IMPORTANCE_LOW);
      channel.setDescription("Add notes from status bar");
      NotificationManager manager =
          (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
      if (manager != null)
      {
        manager.createNotificationChannel(channel);
      }
    }
  }

  public static void setEnabled(Context context, boolean enabled)
  {
    context.getSharedPreferences(PREFS_NOTE_QUEUE, Context.MODE_PRIVATE)
      .edit().putBoolean(KEY_NOTIFICATION_ENABLED, enabled).apply();
  }

  public static boolean isEnabled(Context context)
  {
    return context.getSharedPreferences(PREFS_NOTE_QUEUE, Context.MODE_PRIVATE)
      .getBoolean(KEY_NOTIFICATION_ENABLED, false);
  }

  public static boolean isShowing(Context context)
  {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return false;
    NotificationManager manager =
        (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
    if (manager == null) return false;
    for (StatusBarNotification sbn : manager.getActiveNotifications())
    {
      if (sbn.getId() == NOTIFICATION_ID) return true;
    }
    return false;
  }

  public static void show(Context context, boolean silent)
  {
    createChannel(context);

    NotificationManager manager =
        (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
    if (manager == null)
    {
      if (!silent) Toast.makeText(context, "Notification service unavailable", Toast.LENGTH_SHORT).show();
      return;
    }

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N && !manager.areNotificationsEnabled())
    {
      if (!silent)
      {
        Toast.makeText(context, "Notifications are disabled. Please enable them in system settings.", Toast.LENGTH_LONG).show();
        try
        {
          Intent intent = new Intent();
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
          {
            intent.setAction(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
            intent.putExtra(Settings.EXTRA_APP_PACKAGE, context.getPackageName());
          }
          else
          {
            intent.setAction(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
            intent.setData(Uri.parse("package:" + context.getPackageName()));
          }
          if (!(context instanceof Activity))
          {
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
          }
          context.startActivity(intent);
        }
        catch (Exception ignored) {}
      }
      return;
    }

    try
    {
      Intent openAppIntent = new Intent(context, MainActivity.class);
      int openFlags = PendingIntent.FLAG_UPDATE_CURRENT;
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M)
      {
        openFlags |= PendingIntent.FLAG_IMMUTABLE;
      }
      PendingIntent openPendingIntent =
          PendingIntent.getActivity(context, 0, openAppIntent, openFlags);

      RemoteInput remoteInput = new RemoteInput.Builder(NoteReplyReceiver.KEY_TEXT_REPLY)
        .setLabel("Add Note")
        .build();

      Intent replyIntent = new Intent(context, NoteReplyReceiver.class);
      int replyFlags = PendingIntent.FLAG_UPDATE_CURRENT;
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S)
      {
        replyFlags |= PendingIntent.FLAG_MUTABLE;
      }
      PendingIntent replyPendingIntent =
          PendingIntent.getBroadcast(context, 1, replyIntent, replyFlags);

      Notification.Action replyAction;
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M)
      {
        replyAction = new Notification.Action.Builder(
          Icon.createWithResource(context, R.drawable.ic_note),
          "Add Note",
          replyPendingIntent)
          .addRemoteInput(remoteInput)
          .build();
      }
      else
      {
        replyAction = new Notification.Action.Builder(
          R.drawable.ic_note,
          "Add Note",
          replyPendingIntent)
          .addRemoteInput(remoteInput)
          .build();
      }

      Notification.Builder builder;
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
      {
        builder = new Notification.Builder(context, CHANNEL_ID);
      }
      else
      {
        builder = new Notification.Builder(context);
      }

      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M)
      {
        builder.setSmallIcon(Icon.createWithResource(context, R.drawable.ic_note));
      }
      else
      {
        builder.setSmallIcon(R.drawable.ic_note);
      }

      builder.setContentTitle("Karui Quick Note")
        .setContentText("Swipe down to add a note")
        .setContentIntent(openPendingIntent)
        .addAction(replyAction)
        .setOngoing(true)
        .setOnlyAlertOnce(true);

      manager.notify(NOTIFICATION_ID, builder.build());
    }
    catch (Exception e)
    {
      if (!silent)
      {
        String msg = e.getClass().getSimpleName() + ": " + e.getMessage();
        if (e.getCause() != null) msg += "\nCause: " + e.getCause().toString();
        Toast.makeText(context, "Couldn't show notification:\n" + msg, Toast.LENGTH_LONG).show();
      }
      e.printStackTrace();
    }
  }

  public static void cancel(Context context)
  {
    NotificationManager manager =
        (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
    if (manager != null)
    {
      manager.cancel(NOTIFICATION_ID);
    }
  }

  /**
   * On every resume: if the user had the quick-note toggle on, make sure
   * the notification actually exists. The OS can silently drop it after
   * reboot, force-stop, memory-kill, or a channel reset. Silent — no
   * toast if the permission was revoked or notifications are off.
   */
  public static void ensureMatchesPreference(Activity activity)
  {
    if (!isEnabled(activity)) return;

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
        && activity.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
           != PackageManager.PERMISSION_GRANTED)
    {
      return;
    }

    if (isShowing(activity)) return;
    show(activity, true);
  }
}