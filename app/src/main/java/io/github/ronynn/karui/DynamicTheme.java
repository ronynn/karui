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