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
import android.widget.RemoteViews;

public class NotesWidgetProvider extends AppWidgetProvider
{
  public static final String ACTION_WIDGET_REFRESH = "io.github.ronynn.karui.ACTION_WIDGET_REFRESH";

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
    if (MainActivity.ACTION_NOTE_ADDED.equals(action) ||
        AppWidgetManager.ACTION_APPWIDGET_UPDATE.equals(action) ||
        ACTION_WIDGET_REFRESH.equals(action))
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
    int transparencyPct = widgetPrefs.getInt("widget_transparency_" + appWidgetId, 15);

    int alpha = (int) ((1.0f - (transparencyPct / 100.0f)) * 255);
    int backgroundColor = Color.argb(alpha, 34, 34, 34);

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
      context, appWidgetId, toggleIntent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_MUTABLE
    );
    views.setPendingIntentTemplate(R.id.widget_list_view, togglePendingIntent);

    Intent refreshIntent = new Intent(context, NotesWidgetProvider.class);
    refreshIntent.setAction(ACTION_WIDGET_REFRESH);
    PendingIntent refreshPendingIntent = PendingIntent.getBroadcast(
      context, appWidgetId, refreshIntent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
    );
    views.setOnClickPendingIntent(R.id.widget_refresh_btn, refreshPendingIntent);

    Intent configIntent = new Intent(context, WidgetConfigActivity.class);
    configIntent.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId);
    configIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
    PendingIntent configPendingIntent = PendingIntent.getActivity(
      context, appWidgetId, configIntent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
    );
    views.setOnClickPendingIntent(R.id.widget_settings_btn, configPendingIntent);

    Intent openAppIntent = new Intent(context, MainActivity.class);
    PendingIntent openAppPendingIntent = PendingIntent.getActivity(
      context, 0, openAppIntent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
    );
    views.setOnClickPendingIntent(R.id.widget_title, openAppPendingIntent);

    appWidgetManager.updateAppWidget(appWidgetId, views);
  }
}