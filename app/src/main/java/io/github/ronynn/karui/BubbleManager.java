package io.github.ronynn.karui;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Person;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ShortcutInfo;
import android.content.pm.ShortcutManager;
import android.graphics.drawable.Icon;
import android.os.Build;

public final class BubbleManager
{
  private static final String BUBBLE_CHANNEL_ID = "karui_bubble_channel";
  private static final int    BUBBLE_NOTIFICATION_ID = 2;
  private static final String SHORTCUT_ID = "karui_notes_bubble";
  private static final int    DESIRED_HEIGHT_DP = 600;

  private BubbleManager() {}

  /**
   * Posts the bubble notification. Returns true if the bubble was
   * posted, false on devices where bubbles are unavailable (API < 29).
   * Callers should fall back to the full-screen UI on false.
   */
  public static boolean showBubble(Context context)
  {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return false;

    createChannel(context);
    createShortcut(context);

    Intent target = new Intent(context, MainActivity.class);
    target.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);

    int piFlags = PendingIntent.FLAG_UPDATE_CURRENT;
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M)
      piFlags |= PendingIntent.FLAG_IMMUTABLE;
    PendingIntent bubbleIntent =
        PendingIntent.getActivity(context, 0, target, piFlags);

    Icon icon = Icon.createWithResource(context, R.drawable.ic_note);

    Notification.BubbleMetadata bubbleData;
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R)
    {
      bubbleData = new Notification.BubbleMetadata.Builder(bubbleIntent, icon)
          .setDesiredHeight(DESIRED_HEIGHT_DP)
          .setAutoExpandBubble(true)
          .setSuppressNotification(true)
          .build();
    }
    else
    {
      // API 29 only — deprecated Intent constructor
      bubbleData = new Notification.BubbleMetadata.Builder(target, icon)
          .setDesiredHeight(DESIRED_HEIGHT_DP)
          .setAutoExpandBubble(true)
          .setSuppressNotification(true)
          .build();
    }

    Person chatPartner = new Person.Builder()
        .setName("Karui Notes")
        .setImportant(true)
        .build();

    Notification.Builder nb = new Notification.Builder(context, BUBBLE_CHANNEL_ID)
        .setSmallIcon(R.drawable.ic_note)
        .setContentTitle("Karui Quick Note")
        .setContentText("Tap to expand the floating notes window.")
        .setBubbleMetadata(bubbleData)
        .setShortcutId(SHORTCUT_ID)
        .addPerson(chatPartner)
        .setCategory(Notification.CATEGORY_MESSAGE);

    NotificationManager nm =
        (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
    if (nm == null) return false;

    try
    {
      nm.notify(BUBBLE_NOTIFICATION_ID, nb.build());
      return true;
    }
    catch (Exception e)
    {
      return false;
    }
  }

  private static void createChannel(Context context)
  {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;

    NotificationChannel channel = new NotificationChannel(
        BUBBLE_CHANNEL_ID,
        "Floating Notes",
        NotificationManager.IMPORTANCE_HIGH);
    channel.setDescription("Allows the Karui notes window to float over other apps.");
    channel.setAllowBubbles(true);

    NotificationManager nm =
        (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
    if (nm != null) nm.createNotificationChannel(channel);
  }

  private static void createShortcut(Context context)
  {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N_MR1) return;

    ShortcutManager sm =
        (ShortcutManager) context.getSystemService(Context.SHORTCUT_SERVICE);
    if (sm == null) return;

    Intent shortcutIntent = new Intent(context, MainActivity.class);
    shortcutIntent.setAction(Intent.ACTION_VIEW);

    ShortcutInfo.Builder builder = new ShortcutInfo.Builder(context, SHORTCUT_ID)
        .setShortLabel("Karui Notes")
        .setLongLabel("Open Karui Notes")
        .setIcon(Icon.createWithResource(context, R.drawable.ic_note))
        .setIntent(shortcutIntent);

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R)
    {
      builder.setLongLived(true);
    }

    try
    {
      sm.pushDynamicShortcut(builder.build());
    }
    catch (Exception ignored) {}
  }
}