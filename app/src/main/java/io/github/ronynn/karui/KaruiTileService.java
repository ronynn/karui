package io.github.ronynn.karui;

import android.app.PendingIntent;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.service.quicksettings.TileService;

public class KaruiTileService extends TileService
{
  @Override
  public void onClick()
  {
    super.onClick();

    // Overlay permission missing → send user to settings
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(this))
    {
      Intent i = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
          Uri.parse("package:" + getPackageName()));
      i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
      launchIntent(i);
      return;
    }

    // Primary path: start the overlay service directly.
    // TileService runs in a foreground context (user is interacting with
    // the shade), so startService() is permitted even on Android 12+.
    // No Activity launches, so the currently running app is NOT paused.
    try
    {
      startService(new Intent(this, FloatingWindowService.class));
      return;
    }
    catch (Exception ignored) { /* fall through */ }

    // Fallback for the rare case where startService() is blocked by a
    // background-start restriction. MainActivity handles ACTION_OPEN_FLOATING
    // by starting the service and finishing itself with a transparent
    // background — no visible flash on the user's screen.
    Intent fallback = new Intent(this, MainActivity.class);
    fallback.setAction(MainActivity.ACTION_OPEN_FLOATING);
    fallback.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
    launchIntent(fallback);
  }

  private void launchIntent(Intent intent)
  {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE)
    {
      PendingIntent pi = PendingIntent.getActivity(this, 0, intent,
          PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
      startActivityAndCollapse(pi);
    }
    else
    {
      startActivityAndCollapse(intent);
    }
  }
}