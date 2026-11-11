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

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(this))
    {
      Intent i = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
          Uri.parse("package:" + getPackageName()));
      i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
      launchIntent(i);
      return;
    }

    // GhostActivity is a translucent shell that starts the service and
    // finishes immediately. This is required because startActivityAndCollapse
    // needs an Activity intent to dismiss the notification shade.
    Intent intent = new Intent(this, GhostActivity.class);
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
    launchIntent(intent);
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