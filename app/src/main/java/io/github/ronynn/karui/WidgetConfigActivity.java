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
import android.widget.RadioButton;
import android.widget.RadioGroup;
import android.widget.SeekBar;
import android.widget.Spinner;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.List;

public class WidgetConfigActivity extends Activity
{
  private int mAppWidgetId = AppWidgetManager.INVALID_APPWIDGET_ID;

  private Spinner spinnerTabs;
  private SeekBar seekBarTransparency;
  private RadioGroup radioGroupFont;

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
    radioGroupFont = findViewById(R.id.radiogroup_font);
    Button btnSave = findViewById(R.id.btn_save_widget_config);

    List<String> categories = loadCategoriesFromMarkdown();
    if (categories.isEmpty())
    {
      SharedPreferences prefs = getSharedPreferences("note_queue", MODE_PRIVATE);
      String defaultTab = prefs.getString("inbox_tab_name", "Inbox");
      categories.add(defaultTab);
    }

    ArrayAdapter<String> adapter = new ArrayAdapter<>(
      this, android.R.layout.simple_spinner_item, categories);
    adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
    spinnerTabs.setAdapter(adapter);

    SharedPreferences prefs = getSharedPreferences("widget_prefs", MODE_PRIVATE);
    String savedTab = prefs.getString("widget_tab_" + mAppWidgetId, categories.get(0));
    int savedTrans = prefs.getInt("widget_transparency_" + mAppWidgetId, 15);
    String savedFont = prefs.getString("widget_font_" + mAppWidgetId, "DEFAULT");

    int tabPos = categories.indexOf(savedTab);
    if (tabPos >= 0) spinnerTabs.setSelection(tabPos);
    seekBarTransparency.setProgress(savedTrans);

    if ("MONOSPACE".equals(savedFont))
    {
      ((RadioButton) findViewById(R.id.radio_font_mono)).setChecked(true);
    }

    btnSave.setOnClickListener(new View.OnClickListener()
    {
      @Override
      public void onClick(View v)
      {
        saveWidgetPreferences();
      }
    });
  }

  private void saveWidgetPreferences()
  {
    String selectedTab = (String) spinnerTabs.getSelectedItem();
    int transparency = seekBarTransparency.getProgress();
    
    int selectedFontId = radioGroupFont.getCheckedRadioButtonId();
    String fontStyle = (selectedFontId == R.id.radio_font_mono) ? "MONOSPACE" : "DEFAULT";

    SharedPreferences prefs = getSharedPreferences("widget_prefs", MODE_PRIVATE);
    prefs.edit()
      .putString("widget_tab_" + mAppWidgetId, selectedTab)
      .putInt("widget_transparency_" + mAppWidgetId, transparency)
      .putString("widget_font_" + mAppWidgetId, fontStyle)
      .apply();

    AppWidgetManager appWidgetManager = AppWidgetManager.getInstance(this);
    NotesWidgetProvider.updateAppWidget(this, appWidgetManager, mAppWidgetId);

    Intent resultValue = new Intent();
    resultValue.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, mAppWidgetId);
    setResult(RESULT_OK, resultValue);
    finish();
  }

  private List<String> loadCategoriesFromMarkdown()
  {
    List<String> categories = new ArrayList<>();
    SharedPreferences syncPrefs = getSharedPreferences("sync_prefs", Context.MODE_PRIVATE);
    String uriStr = syncPrefs.getString("sync_file_uri", null);

    if (uriStr == null || uriStr.isEmpty()) return categories;

    try
    {
      Uri uri = Uri.parse(uriStr);
      InputStream inputStream = getContentResolver().openInputStream(uri);
      if (inputStream == null) return categories;

      BufferedReader reader = new BufferedReader(new InputStreamReader(inputStream));
      String line;
      while ((line = reader.readLine()) != null)
      {
        String trimmed = line.trim();
        if (trimmed.startsWith("## "))
        {
          String category = trimmed.replace("## ", "").trim();
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