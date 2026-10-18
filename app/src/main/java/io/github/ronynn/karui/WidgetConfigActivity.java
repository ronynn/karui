package io.github.ronynn.karui;

import android.app.Activity;
import android.appwidget.AppWidgetManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.SeekBar;
import android.widget.Spinner;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.List;

public class WidgetConfigActivity extends Activity
{
  // System font families understood by TypefaceSpan / Typeface.create(family, style)
  private static final String[] FONT_FAMILIES = {
    "sans-serif", "serif", "monospace", "cursive",
    "sans-serif-light", "sans-serif-medium", "sans-serif-condensed"
  };
  private static final String[] FONT_LABELS = {
    "Default (Sans-Serif)", "Serif", "Monospace", "Cursive",
    "Sans-Serif Light", "Sans-Serif Medium", "Sans-Serif Condensed"
  };

  private int mAppWidgetId = AppWidgetManager.INVALID_APPWIDGET_ID;

  private Spinner spinnerTabs;
  private SeekBar seekBarTransparency;
  private Spinner spinnerFont;

  @Override
  protected void onCreate(Bundle savedInstanceState)
  {
    super.onCreate(savedInstanceState);
    setResult(RESULT_CANCELED);
    setContentView(R.layout.activity_widget_config);

    Intent intent = getIntent();
    Bundle extras = intent.getExtras();
    if (extras != null)
    {
      mAppWidgetId = extras.getInt(
        AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID);
    }
    if (mAppWidgetId == AppWidgetManager.INVALID_APPWIDGET_ID)
    {
      finish();
      return;
    }

    spinnerTabs = findViewById(R.id.spinner_tabs);
    seekBarTransparency = findViewById(R.id.seekbar_transparency);
    spinnerFont = findViewById(R.id.spinner_font);
    Button btnSave = findViewById(R.id.btn_save_widget_config);

    // --- Tab list ---
    List<String> categories = loadCategoriesFromMarkdown();
    if (categories.isEmpty())
    {
      SharedPreferences p = getSharedPreferences("note_queue", MODE_PRIVATE);
      String defaultTab = p.getString("inbox_tab_name", "Inbox");
      categories.add(defaultTab);
      if (!categories.contains("Main")) categories.add("Main");
    }
    ArrayAdapter<String> tabAdapter = new ArrayAdapter<>(
      this, android.R.layout.simple_spinner_dropdown_item, categories);
    spinnerTabs.setAdapter(tabAdapter);

    // --- Font list ---
    ArrayAdapter<String> fontAdapter = new ArrayAdapter<>(
      this, android.R.layout.simple_spinner_dropdown_item, FONT_LABELS);
    spinnerFont.setAdapter(fontAdapter);

    // --- Load saved prefs ---
    SharedPreferences prefs = getSharedPreferences("widget_prefs", MODE_PRIVATE);
    String savedTab = prefs.getString("widget_tab_" + mAppWidgetId, categories.get(0));
    int savedTrans = prefs.getInt("widget_transparency_" + mAppWidgetId, 50);
    String savedFont = prefs.getString("widget_font_" + mAppWidgetId, "sans-serif");

    // Migration from the old DEFAULT / MONOSPACE values
    if ("DEFAULT".equals(savedFont)) savedFont = "sans-serif";
    else if ("MONOSPACE".equals(savedFont)) savedFont = "monospace";

    int tabPos = categories.indexOf(savedTab);
    if (tabPos >= 0) spinnerTabs.setSelection(tabPos);
    seekBarTransparency.setProgress(savedTrans);

    int fontPos = indexOfFamily(savedFont);
    if (fontPos >= 0) spinnerFont.setSelection(fontPos);

    btnSave.setOnClickListener(new View.OnClickListener()
    {
      @Override
      public void onClick(View v)
      {
        saveWidgetPreferences();
      }
    });
  }

  private int indexOfFamily(String family)
  {
    for (int i = 0; i < FONT_FAMILIES.length; i++)
      if (FONT_FAMILIES[i].equals(family)) return i;
    return -1;
  }

  // --- SECTION: PREFERENCE SAVING ---
  private void saveWidgetPreferences()
  {
    String selectedTab = (String) spinnerTabs.getSelectedItem();
    int transparency = seekBarTransparency.getProgress();
    int fontIdx = spinnerFont.getSelectedItemPosition();
    String fontFamily = (fontIdx >= 0 && fontIdx < FONT_FAMILIES.length)
      ? FONT_FAMILIES[fontIdx] : "sans-serif";

    SharedPreferences.Editor ed =
      getSharedPreferences("widget_prefs", MODE_PRIVATE).edit();
    ed.putString("widget_tab_" + mAppWidgetId, selectedTab);
    ed.putInt("widget_transparency_" + mAppWidgetId, transparency);
    ed.putString("widget_font_" + mAppWidgetId, fontFamily);
    // Clean up any stale custom-font pref from earlier builds
    ed.remove("widget_font_uri_" + mAppWidgetId);
    ed.apply();

    AppWidgetManager appWidgetManager = AppWidgetManager.getInstance(this);
    NotesWidgetProvider.updateAppWidget(this, appWidgetManager, mAppWidgetId);
    appWidgetManager.notifyAppWidgetViewDataChanged(mAppWidgetId, R.id.widget_list_view);

    Intent resultValue = new Intent();
    resultValue.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, mAppWidgetId);
    setResult(RESULT_OK, resultValue);
    finish();
  }

  // --- SECTION: CATEGORY PARSER ---
  private List<String> loadCategoriesFromMarkdown()
  {
    List<String> categories = new ArrayList<>();
    SharedPreferences syncPrefs = getSharedPreferences("sync_prefs", Context.MODE_PRIVATE);
    String uriStr = syncPrefs.getString("sync_file_uri", null);

    if (uriStr == null || uriStr.isEmpty()) return categories;

    try
    {
      Uri uri = Uri.parse(uriStr);
      try
      {
        getContentResolver().takePersistableUriPermission(
          uri, Intent.FLAG_GRANT_READ_URI_PERMISSION);
      }
      catch (SecurityException ignored) {}

      InputStream inputStream = getContentResolver().openInputStream(uri);
      if (inputStream == null) return categories;

      BufferedReader reader = new BufferedReader(new InputStreamReader(inputStream));
      String line;
      while ((line = reader.readLine()) != null)
      {
        String trimmed = line.trim();
        if (trimmed.startsWith("## "))
        {
          String category = trimmed.replace("## ", "")
                                    .replaceAll("<!--.*?-->", "").trim();
          if (!category.isEmpty() && !categories.contains(category))
          {
            categories.add(category);
          }
        }
      }
      reader.close();
    }
    catch (Exception e)
    {
      e.printStackTrace();
    }
    return categories;
  }
}