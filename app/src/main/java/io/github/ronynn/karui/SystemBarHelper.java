package io.github.ronynn.karui;

import android.app.Activity;
import android.graphics.Color;
import android.os.Build;
import android.view.View;
import android.view.WindowInsetsController;
import android.view.WindowManager;

public final class SystemBarHelper
{
  private SystemBarHelper() {}

  /** Default — dark theme (light-coloured icons). */
  public static void apply(Activity activity)
  {
    apply(activity, false);
  }

  /**
   * @param light  true = light theme (dark icons visible on light bars)
   *               false = dark theme (light icons visible on dark bars)
   */
  public static void apply(Activity activity, boolean light)
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
      int sysUi = View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_STABLE;

      if (light)
      {
        // API 23+ — dark status-bar icons (visible on light bg)
        sysUi |= View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
        // API 26+ — dark nav-bar icons (visible on light bg)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
          sysUi |= View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
      }

      activity.getWindow().getDecorView().setSystemUiVisibility(sysUi);
    }

    // API 30+ — modern, unambiguous control surface. Both APIs are kept
    // because some OEMs honour the legacy flags on newer versions and
    // vice-versa. Setting both is harmless.
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R)
    {
      WindowInsetsController wic = activity.getWindow().getInsetsController();
      if (wic != null)
      {
        int mask = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS
                 | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
        wic.setSystemBarsAppearance(light ? mask : 0, mask);
      }
    }
  }
}