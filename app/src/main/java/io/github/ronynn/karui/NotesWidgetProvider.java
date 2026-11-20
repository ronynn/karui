package io.github.ronynn.karui;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.widget.RemoteViews;

import java.io.BufferedReader;
import java.io.BufferedWriter;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.io.OutputStreamWriter;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

public class NotesWidgetProvider extends AppWidgetProvider
{
  public static final String ACTION_WIDGET_SORT = "io.github.ronynn.karui.ACTION_WIDGET_SORT";
  public static final String ACTION_WIDGET_ADD_NOTE = "io.github.ronynn.karui.ACTION_WIDGET_ADD_NOTE";

  private static final int BASE_BACKGROUND_COLOR = 0xFF2C2C2C;

  @Override
  public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds)
  {
    for (int appWidgetId : appWidgetIds)
    {
      updateAppWidget(context, appWidgetManager, appWidgetId);
    }
  }

  @Override
  public void onReceive(Context context, Intent intent)
  {
    super.onReceive(context, intent);

    String action = intent.getAction();

    if (ACTION_WIDGET_ADD_NOTE.equals(action))
    {
      Context appContext = context.getApplicationContext();

      // No overlay permission — open full app instead of failing silently
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
          && !Settings.canDrawOverlays(appContext))
      {
        try
        {
          Intent appIntent = new Intent(appContext, MainActivity.class);
          appIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
          appContext.startActivity(appIntent);
        }
        catch (Exception ignored) {}
        return;
      }

      // Widget click is user-initiated, so startService is allowed
      try
      {
        appContext.startService(new Intent(appContext, FloatingWindowService.class));
      }
      catch (Exception e)
      {
        // Fallback — MainActivity handles ACTION_OPEN_FLOATING
        try
        {
          Intent fallback = new Intent(appContext, MainActivity.class);
          fallback.setAction(MainActivity.ACTION_OPEN_FLOATING);
          fallback.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
          appContext.startActivity(fallback);
        }
        catch (Exception ignored) {}
      }
      return;
    }

    if (ACTION_WIDGET_SORT.equals(action))
    {
      int appWidgetId = intent.getIntExtra(
          AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID);
      if (appWidgetId != AppWidgetManager.INVALID_APPWIDGET_ID)
      {
        sortWidgetNotesAlphabetically(context, appWidgetId);
      }
    }

    if (MainActivity.ACTION_NOTE_ADDED.equals(action) ||
        AppWidgetManager.ACTION_APPWIDGET_UPDATE.equals(action) ||
        ACTION_WIDGET_SORT.equals(action))
    {
      AppWidgetManager appWidgetManager = AppWidgetManager.getInstance(context);
      ComponentName thisWidget = new ComponentName(context, NotesWidgetProvider.class);
      int[] appWidgetIds = appWidgetManager.getAppWidgetIds(thisWidget);
      appWidgetManager.notifyAppWidgetViewDataChanged(appWidgetIds, R.id.widget_list_view);
    }
  }

  public static void updateAppWidget(Context context, AppWidgetManager appWidgetManager, int appWidgetId)
  {
    SharedPreferences widgetPrefs = context.getSharedPreferences("widget_prefs", Context.MODE_PRIVATE);
    String tabTitle = widgetPrefs.getString("widget_tab_" + appWidgetId, "Karui Notes");
    int transparencyPct = widgetPrefs.getInt("widget_transparency_" + appWidgetId, 50);

    int alpha = (int) ((1.0f - (transparencyPct / 100.0f)) * 255);
    int backgroundColor = Color.argb(
        alpha,
        Color.red(BASE_BACKGROUND_COLOR),
        Color.green(BASE_BACKGROUND_COLOR),
        Color.blue(BASE_BACKGROUND_COLOR));

    Intent serviceIntent = new Intent(context, NotesWidgetService.class);
    serviceIntent.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId);
    serviceIntent.setData(Uri.parse(serviceIntent.toUri(Intent.URI_INTENT_SCHEME)));

    RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_layout);
    views.setTextViewText(R.id.widget_title, tabTitle);
    views.setInt(R.id.widget_root, "setBackgroundColor", backgroundColor);
    views.setRemoteAdapter(R.id.widget_list_view, serviceIntent);
    views.setEmptyView(R.id.widget_list_view, R.id.widget_empty_view);

    Intent toggleIntent = new Intent(context, WidgetToggleReceiver.class);
    PendingIntent togglePendingIntent = PendingIntent.getBroadcast(
        context, appWidgetId, toggleIntent,
        PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_MUTABLE);
    views.setPendingIntentTemplate(R.id.widget_list_view, togglePendingIntent);

    // S — sort
    Intent sortIntent = new Intent(context, NotesWidgetProvider.class);
    sortIntent.setAction(ACTION_WIDGET_SORT);
    sortIntent.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId);
    PendingIntent sortPendingIntent = PendingIntent.getBroadcast(
        context, appWidgetId, sortIntent,
        PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    views.setOnClickPendingIntent(R.id.widget_sort_btn, sortPendingIntent);

    // M — settings
    Intent configIntent = new Intent(context, WidgetConfigActivity.class);
    configIntent.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId);
    configIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
    PendingIntent configPendingIntent = PendingIntent.getActivity(
        context, appWidgetId, configIntent,
        PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    views.setOnClickPendingIntent(R.id.widget_settings_btn, configPendingIntent);

    // + — open floating note bar
    Intent addIntent = new Intent(context, NotesWidgetProvider.class);
    addIntent.setAction(ACTION_WIDGET_ADD_NOTE);
    PendingIntent addPendingIntent = PendingIntent.getBroadcast(
        context, appWidgetId + 50000, addIntent,
        PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    views.setOnClickPendingIntent(R.id.widget_add_btn, addPendingIntent);

    // Title — open full app
    Intent openAppIntent = new Intent(context, MainActivity.class);
    PendingIntent openAppPendingIntent = PendingIntent.getActivity(
        context, 0, openAppIntent,
        PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    views.setOnClickPendingIntent(R.id.widget_title, openAppPendingIntent);

    appWidgetManager.updateAppWidget(appWidgetId, views);
  }

  private void sortWidgetNotesAlphabetically(Context context, int appWidgetId)
  {
    SharedPreferences widgetPrefs = context.getSharedPreferences("widget_prefs", Context.MODE_PRIVATE);
    String targetTab = widgetPrefs.getString("widget_tab_" + appWidgetId, "Main");

    SharedPreferences syncPrefs = context.getSharedPreferences("sync_prefs", Context.MODE_PRIVATE);
    String uriStr = syncPrefs.getString("sync_file_uri", null);

    if (uriStr == null || uriStr.isEmpty()) return;

    try
    {
      Uri uri = Uri.parse(uriStr);
      InputStream inputStream = context.getContentResolver().openInputStream(uri);
      if (inputStream == null) return;

      BufferedReader reader = new BufferedReader(new InputStreamReader(inputStream));
      List<String> fileLines = new ArrayList<>();
      List<String> categoryNotes = new ArrayList<>();
      String line;
      String currentCategory = "Main";

      while ((line = reader.readLine()) != null)
      {
        String trimmed = line.trim();
        if (trimmed.startsWith("## "))
        {
          if (currentCategory.equalsIgnoreCase(targetTab) && !categoryNotes.isEmpty())
          {
            Collections.sort(categoryNotes, String.CASE_INSENSITIVE_ORDER);
            fileLines.addAll(categoryNotes);
            categoryNotes.clear();
          }
          currentCategory = trimmed.replace("## ", "").replaceAll("<!--.*?-->", "").trim();
          fileLines.add(line);
        }
        else if ((trimmed.startsWith("- [ ]") || trimmed.startsWith("- [x]") || trimmed.startsWith("- [X]"))
                 && currentCategory.equalsIgnoreCase(targetTab))
        {
          categoryNotes.add(line);
        }
        else
        {
          if (currentCategory.equalsIgnoreCase(targetTab) && !categoryNotes.isEmpty())
          {
            Collections.sort(categoryNotes, String.CASE_INSENSITIVE_ORDER);
            fileLines.addAll(categoryNotes);
            categoryNotes.clear();
          }
          fileLines.add(line);
        }
      }

      if (currentCategory.equalsIgnoreCase(targetTab) && !categoryNotes.isEmpty())
      {
        Collections.sort(categoryNotes, String.CASE_INSENSITIVE_ORDER);
        fileLines.addAll(categoryNotes);
      }

      reader.close();

      OutputStream outputStream = context.getContentResolver().openOutputStream(uri, "rwt");
      if (outputStream != null)
      {
        BufferedWriter writer = new BufferedWriter(new OutputStreamWriter(outputStream));
        for (int i = 0; i < fileLines.size(); i++)
        {
          writer.write(fileLines.get(i));
          if (i < fileLines.size() - 1) writer.newLine();
        }
        writer.flush();
        writer.close();
      }
    }
    catch (Exception e)
    {
      e.printStackTrace();
    }
  }
}