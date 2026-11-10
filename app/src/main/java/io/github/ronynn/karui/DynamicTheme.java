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
 * Delete this file (plus the bridge methods in WebAppInterface /
 * FloatingWindowService and settings.js) to remove the feature entirely.
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

    // Sanitize accent so it's always usable — bright enough to read,
    // saturated enough to feel like an accent.
    float aS = Math.max(0.40f, Math.min(0.55f, hsv[1]));
    float aV = Math.max(0.78f, Math.min(0.90f, hsv[2]));
    int accent = Color.HSVToColor(new float[]{ hsv[0], aS, aV });

    float h = hsv[0];

    // Cozy M3-inspired dark palette — hue-tinted throughout so it never
    // looks grey, muted enough to not fight the wallpaper, warm text.
    int bg        = Color.HSVToColor(new float[]{ h, 0.11f, 0.09f });
    int surface   = Color.HSVToColor(new float[]{ h, 0.13f, 0.14f });
    int border    = Color.HSVToColor(new float[]{ h, 0.20f, 0.38f });
    int text      = Color.HSVToColor(new float[]{ h, 0.05f, 0.89f });
    int gray      = Color.HSVToColor(new float[]{ h, 0.09f, 0.52f });
    int accentTxt = Color.HSVToColor(new float[]{ h, 0.40f, 0.14f });

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