package io.github.ronynn.karui;

import android.app.WallpaperColors;
import android.app.WallpaperManager;
import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.drawable.Drawable;
import android.os.Build;

/**
 * Reads a representative colour from the device wallpaper and derives a
 * full theme (bg / surface / border / text / accent / accent-txt / gray).
 *
 * Two extraction paths, tried in order:
 *   1. WallpaperManager.getWallpaperColors()  — API 27+, fast, native
 *   2. WallpaperManager.getDrawable() + histogram — API 21+, slower,
 *      more reliable on OEM skins where (1) returns null
 *
 * Returns a JSON object:
 *   {"ok":true,"source":"primary|secondary|tertiary|bitmap",
 *    "bg":"#..","surface":"#..","border":"#..","text":"#..",
 *    "accent":"#..","accentTxt":"#..","gray":"#.."}
 * or {"ok":false,"error":"no_color"} if neither path found a colour.
 *
 * Delete this file (plus the two bridge methods in WebAppInterface /
 * settings.js) to remove the feature entirely.
 */
public final class DynamicTheme
{
  private DynamicTheme() {}

  public static String getWallpaperTheme(Context context)
  {
    int[] extracted = extractFromWallpaperColors(context);
    if (extracted == null) extracted = extractFromBitmap(context);
    if (extracted == null) return "{\"ok\":false,\"error\":\"no_color\"}";

    return buildTheme(extracted[0], sourceName(extracted[1]));
  }

  private static String sourceName(int code)
  {
    switch (code)
    {
      case 0: return "primary";
      case 1: return "secondary";
      case 2: return "tertiary";
      case 3: return "bitmap";
      default: return "unknown";
    }
  }

  private static int[] extractFromWallpaperColors(Context context)
  {
    if (Build.VERSION.SDK_INT < 27) return null;
    try
    {
      WallpaperManager wm = WallpaperManager.getInstance(context);
      // WallpaperColors is android.app.WallpaperColors — top-level class,
      // NOT a nested WallpaperManager.WallpaperColors.
      WallpaperColors wc = wm.getWallpaperColors(WallpaperManager.FLAG_SYSTEM);
      if (wc == null) return null;

      Color p = wc.getPrimaryColor();
      if (p != null) return new int[]{ p.toArgb(), 0 };
      Color s = wc.getSecondaryColor();
      if (s != null) return new int[]{ s.toArgb(), 1 };
      Color t = wc.getTertiaryColor();
      if (t != null) return new int[]{ t.toArgb(), 2 };
    }
    catch (Throwable ignored) {}
    return null;
  }

  private static int[] extractFromBitmap(Context context)
  {
    try
    {
      WallpaperManager wm = WallpaperManager.getInstance(context);
      Drawable d = wm.getDrawable();
      if (d == null) return null;

      int W = 64, H = 64;
      Bitmap bmp = Bitmap.createBitmap(W, H, Bitmap.Config.ARGB_8888);
      Canvas c = new Canvas(bmp);
      d.setBounds(0, 0, W, H);
      d.draw(c);

      int[] buckets = new int[64]; // 4x4x4 RGB histogram
      for (int y = 0; y < H; y++)
      {
        for (int x = 0; x < W; x++)
        {
          int px = bmp.getPixel(x, y);
          int a = (px >> 24) & 0xFF;
          if (a < 128) continue;
          int r = (px >> 16) & 0xFF;
          int g = (px >> 8) & 0xFF;
          int b = px & 0xFF;
          int max = Math.max(r, Math.max(g, b));
          int min = Math.min(r, Math.min(g, b));
          if (max - min < 30) continue;        // skip grays
          if (max < 40 || min > 220) continue; // skip near-black / near-white
          int idx = ((r >> 6) << 4) | ((g >> 6) << 2) | (b >> 6);
          buckets[idx]++;
        }
      }

      int bestIdx = -1, bestCount = 0;
      for (int i = 0; i < 64; i++)
      {
        if (buckets[i] > bestCount) { bestCount = buckets[i]; bestIdx = i; }
      }
      bmp.recycle();
      if (bestIdx < 0) return null;

      int r = ((bestIdx >> 4) & 3) * 64 + 32;
      int g = ((bestIdx >> 2) & 3) * 64 + 32;
      int b = (bestIdx & 3) * 64 + 32;
      return new int[]{ Color.rgb(r, g, b), 3 };
    }
    catch (Throwable ignored) {}
    return null;
  }

  private static String buildTheme(int accentColor, String source)
  {
    float[] hsv = new float[3];
    Color.colorToHSV(accentColor, hsv);

    // Sanitize the accent so the theme is actually usable.
    if (hsv[1] < 0.25f) hsv[1] = 0.35f;
    if (hsv[2] < 0.45f) hsv[2] = 0.55f;
    if (hsv[2] > 0.95f) hsv[2] = 0.88f;
    int accent = Color.HSVToColor(hsv);

    float h = hsv[0];

    int bg        = Color.HSVToColor(new float[]{ h, 0.14f, 0.11f });
    int surface   = Color.HSVToColor(new float[]{ h, 0.12f, 0.17f });
    int border    = Color.HSVToColor(new float[]{ h, 0.22f, 0.32f });
    int text      = Color.HSVToColor(new float[]{ h, 0.06f, 0.92f });
    int gray      = Color.HSVToColor(new float[]{ h, 0.05f, 0.55f });
    int accentTxt = (hsv[2] > 0.55f) ? 0xFF000000 : 0xFFFFFFFF;

    return "{\"ok\":true," +
        "\"source\":\"" + source + "\"," +
        "\"bg\":\"" + hex(bg) + "\"," +
        "\"surface\":\"" + hex(surface) + "\"," +
        "\"border\":\"" + hex(border) + "\"," +
        "\"text\":\"" + hex(text) + "\"," +
        "\"accent\":\"" + hex(accent) + "\"," +
        "\"accentTxt\":\"" + hex(accentTxt) + "\"," +
        "\"gray\":\"" + hex(gray) + "\"}";
  }

  private static String hex(int c) { return String.format("#%06X", 0xFFFFFF & c); }
}