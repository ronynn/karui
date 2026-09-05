package io.github.ronynn.karui;

import android.appwidget.AppWidgetManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.List;

public class WidgetToggleReceiver extends BroadcastReceiver
{
  @Override
  public void onReceive(Context context, Intent intent)
  {
    String rawNote = intent.getStringExtra("raw_note");
    int widgetId = intent.getIntExtra("widget_id", AppWidgetManager.INVALID_APPWIDGET_ID);

    if (rawNote == null || rawNote.isEmpty()) return;

    SharedPreferences syncPrefs = context.getSharedPreferences("sync_prefs", Context.MODE_PRIVATE);
    String uriStr = syncPrefs.getString("sync_file_uri", null);
    if (uriStr == null || uriStr.isEmpty()) return;

    try
    {
      Uri uri = Uri.parse(uriStr);

      InputStream inputStream = context.getContentResolver().openInputStream(uri);
      if (inputStream == null) return;

      BufferedReader reader = new BufferedReader(new InputStreamReader(inputStream));
      List<String> lines = new ArrayList<>();
      String line;

      String targetToggled;
      if (rawNote.startsWith("- [ ]"))
      {
        targetToggled = "- [x]" + rawNote.substring(5);
      }
      else if (rawNote.startsWith("- [x]"))
      {
        targetToggled = "- [ ]" + rawNote.substring(5);
      }
      else
      {
        targetToggled = rawNote;
      }

      while ((line = reader.readLine()) != null)
      {
        if (line.trim().equals(rawNote.trim()))
        {
          lines.add(targetToggled);
        }
        else
        {
          lines.add(line);
        }
      }
      reader.close();

      OutputStream outputStream = context.getContentResolver().openOutputStream(uri, "rwt");
      if (outputStream != null)
      {
        StringBuilder sb = new StringBuilder();
        for (String l : lines)
        {
          sb.append(l).append("\n");
        }
        outputStream.write(sb.toString().getBytes());
        outputStream.close();
      }

      AppWidgetManager appWidgetManager = AppWidgetManager.getInstance(context);
      if (widgetId != AppWidgetManager.INVALID_APPWIDGET_ID)
      {
        appWidgetManager.notifyAppWidgetViewDataChanged(widgetId, R.id.widget_list_view);
      }
      else
      {
        int[] ids = appWidgetManager.getAppWidgetIds(new android.content.ComponentName(context, NotesWidgetProvider.class));
        appWidgetManager.notifyAppWidgetViewDataChanged(ids, R.id.widget_list_view);
      }

      Intent updateIntent = new Intent(MainActivity.ACTION_NOTE_ADDED);
      updateIntent.setPackage(context.getPackageName());
      context.sendBroadcast(updateIntent);

    }
    catch (Exception e)
    {
      e.printStackTrace();
    }
  }
}