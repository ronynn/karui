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

    // startService() directly — no Activity, so the currently running app
    // is NOT paused. Trade-off: the notification shade stays open. Swipe
    // it down manually. That's better than pausing a video.
    //
    // TileService runs in a foreground context (the shade is open and
    // the user is interacting with it), so startService() is allowed
    // even on Android 12+ background-start restrictions.
    try
    {
      startService(new Intent(this, FloatingWindowService.class));
      return;
    }
    catch (Exception ignored) { /* fall through */ }

    // Fallback — should rarely run. Uses the translucent GhostActivity
    // to satisfy startActivityAndCollapse() if startService() is blocked.
    Intent fallback = new Intent(this, GhostActivity.class);
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