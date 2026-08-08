package io.github.ronynn.karui;

import android.app.Notification;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.RemoteInput;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.graphics.drawable.Icon;
import android.os.Build;
import android.os.Bundle;

public class NoteReplyReceiver extends BroadcastReceiver
{
  public static final String KEY_TEXT_REPLY = "key_text_reply";
  private static final String CHANNEL_ID = "note_reply_channel";
  private static final int NOTIFICATION_ID = 1;

  @Override
  public void onReceive(Context context, Intent intent)
  {
    Bundle remoteInputResult = RemoteInput.getResultsFromIntent(intent);
    if (remoteInputResult != null)
    {
      CharSequence input = remoteInputResult.getCharSequence(KEY_TEXT_REPLY);
      if (input != null && input.length() > 0)
      {
        String noteText = input.toString().trim();
        if (!noteText.isEmpty())
        {
          ProcessTextActivity.saveNoteToQueue(context, noteText);

          Intent updateIntent = new Intent(MainActivity.ACTION_NOTE_ADDED);
          updateIntent.setPackage(context.getPackageName());
          context.sendBroadcast(updateIntent);
        }
      }
    }

    updateNotification(context);
  }

  private void updateNotification(Context context)
  {
    NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
    if (manager == null)
    {
      return;
    }

    Intent openAppIntent = new Intent(context, MainActivity.class);
    int openFlags = PendingIntent.FLAG_UPDATE_CURRENT;
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M)
    {
      openFlags |= PendingIntent.FLAG_IMMUTABLE;
    }
    PendingIntent openPendingIntent = PendingIntent.getActivity(context, 0, openAppIntent, openFlags);

    RemoteInput remoteInput = new RemoteInput.Builder(KEY_TEXT_REPLY)
      .setLabel("Add Note")
      .build();

    Intent replyIntent = new Intent(context, NoteReplyReceiver.class);
    int replyFlags = PendingIntent.FLAG_UPDATE_CURRENT;
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S)
    {
      replyFlags |= PendingIntent.FLAG_MUTABLE;
    }
    else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M)
    {
      replyFlags |= PendingIntent.FLAG_IMMUTABLE;
    }
    PendingIntent replyPendingIntent = PendingIntent.getBroadcast(context, 1, replyIntent, replyFlags);

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

    builder.setContentTitle("Quick Note")
      .setContentText("Note saved! Swipe down to add another")
      .setContentIntent(openPendingIntent)
      .addAction(replyAction)
      .setOngoing(true);

    manager.notify(NOTIFICATION_ID, builder.build());
  }
}