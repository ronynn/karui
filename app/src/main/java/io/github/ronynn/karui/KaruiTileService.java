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

    // If overlay permission is missing, redirect to the settings page.
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(this))
    {
      Intent i = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
          Uri.parse("package:" + getPackageName()));
      i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
      launchIntent(i);
      return;
    }

    // Launch MainActivity with ACTION_OPEN_FLOATING. The activity's
    // onCreate sees the floating trigger, sets a transparent window
    // background, starts FloatingWindowService, and finishes itself
    // — so the activity is invisible, but its launch is what collapses
    // the notification shade. startService() alone does not collapse
    // the shade, which is why the tile felt like it "did nothing".
    Intent intent = new Intent(this, MainActivity.class);
    intent.setAction(MainActivity.ACTION_OPEN_FLOATING);
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