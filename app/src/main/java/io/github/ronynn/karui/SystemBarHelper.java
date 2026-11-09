package io.github.ronynn.karui;

import android.app.Activity;
import android.graphics.Color;
import android.os.Build;
import android.view.View;
import android.view.WindowManager;

public final class SystemBarHelper
{
  private SystemBarHelper() {}

  public static void apply(Activity activity)
  {
    if (activity == null) return;

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP)
    {
      activity.getWindow().clearFlags(
          WindowManager.LayoutParams.FLAG_TRANSLUCENT_STATUS);
      activity.getWindow().clearFlags(
          WindowManager.LayoutParams.FLAG_TRANSLUCENT_NAVIGATION);

      activity.getWindow().setStatusBarColor(Color.TRANSPARENT);
      activity.getWindow().setNavigationBarColor(Color.TRANSPARENT);
    }

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q)
    {
      activity.getWindow().setStatusBarContrastEnforced(false);
      activity.getWindow().setNavigationBarContrastEnforced(false);
    }

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP)
    {
      activity.getWindow().getDecorView().setSystemUiVisibility(
          View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
        | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
    }
  }
}