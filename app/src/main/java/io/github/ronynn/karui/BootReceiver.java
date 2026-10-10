package io.github.ronynn.karui;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;

public class BootReceiver extends BroadcastReceiver
{
  @Override
  public void onReceive(Context context, Intent intent)
  {
    SharedPreferences prefs =
        context.getSharedPreferences(CalendarNotificationReceiver.PREFS, Context.MODE_PRIVATE);
    if (prefs.getBoolean(CalendarNotificationReceiver.KEY_ENABLED, false))
    {
      CalendarNotificationReceiver.scheduleNext(context);
    }
  }
}