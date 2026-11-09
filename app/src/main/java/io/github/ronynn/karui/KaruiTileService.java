package io.github.ronynn.karui;

import android.app.PendingIntent;
import android.content.Intent;
import android.os.Build;
import android.service.quicksettings.TileService;

public class KaruiTileService extends TileService
{
  @Override
  public void onClick()
  {
    super.onClick();

    // Create a PendingIntent to show the bubble.
    Intent intent = new Intent(this, MainActivity.class);
    intent.setAction(Intent.ACTION_ASSIST); // Reuse the ASSIST path
    PendingIntent pendingIntent = PendingIntent.getActivity(
        this, 0, intent,
        PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
    );

    // Use the PendingIntent overload for API 34+.
    // For older versions, startActivityAndCollapse(Intent) is used internally.
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
        startActivityAndCollapse(pendingIntent);
    } else {
        //noinspection deprecation
        startActivityAndCollapse(intent);
    }
  }
}