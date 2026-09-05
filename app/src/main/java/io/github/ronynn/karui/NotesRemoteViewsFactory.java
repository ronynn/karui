package io.github.ronynn.karui;

import android.appwidget.AppWidgetManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.net.Uri;
import android.text.SpannableString;
import android.text.style.StrikethroughSpan;
import android.widget.RemoteViews;
import android.widget.RemoteViewsService;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.List;

public class NotesRemoteViewsFactory implements RemoteViewsService.RemoteViewsFactory
{
  private final Context mContext;
  private final int mAppWidgetId;
  private final List<String> mRawNotes = new ArrayList<>();

  public NotesRemoteViewsFactory(Context context, Intent intent)
  {
    mContext = context;
    mAppWidgetId = intent.getIntExtra(
      AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID);
  }

  @Override
  public void onCreate()
  {
    loadNotesFromMarkdown();
  }

  @Override
  public void onDataSetChanged()
  {
    loadNotesFromMarkdown();
  }

  @Override
  public void onDestroy()
  {
    mRawNotes.clear();
  }

  @Override
  public int getCount()
  {
    return mRawNotes.size();
  }

  @Override
  public RemoteViews getViewAt(int position)
  {
    if (position < 0 || position >= mRawNotes.size()) return null;

    RemoteViews views = new RemoteViews(mContext.getPackageName(), R.layout.widget_item);
    String rawLine = mRawNotes.get(position);

    SharedPreferences widgetPrefs = mContext.getSharedPreferences("widget_prefs", Context.MODE_PRIVATE);
    String fontStyle = widgetPrefs.getString("widget_font_" + mAppWidgetId, "DEFAULT");

    CharSequence displayText = rawLine;
    if (rawLine.startsWith("- [x]"))
    {
      SpannableString spannable = new SpannableString(rawLine);
      spannable.setSpan(new StrikethroughSpan(), 0, rawLine.length(), 0);
      displayText = spannable;
    }

    views.setTextViewText(R.id.widget_item_text, displayText);

    Intent fillInIntent = new Intent();
    fillInIntent.putExtra("raw_note", rawLine);
    fillInIntent.putExtra("widget_id", mAppWidgetId);
    views.setOnClickFillInIntent(R.id.widget_item_container, fillInIntent);

    return views;
  }

  @Override
  public RemoteViews getLoadingView()
  {
    return null;
  }

  @Override
  public int getViewTypeCount()
  {
    return 1;
  }

  @Override
  public long getItemId(int position)
  {
    return position;
  }

  @Override
  public boolean hasStableIds()
  {
    return true;
  }

  private void loadNotesFromMarkdown()
  {
    mRawNotes.clear();

    SharedPreferences widgetPrefs = mContext.getSharedPreferences("widget_prefs", Context.MODE_PRIVATE);
    String targetTab = widgetPrefs.getString("widget_tab_" + mAppWidgetId, "Inbox").trim();

    SharedPreferences syncPrefs = mContext.getSharedPreferences("sync_prefs", Context.MODE_PRIVATE);
    String uriStr = syncPrefs.getString("sync_file_uri", null);

    if (uriStr == null || uriStr.isEmpty()) return;

    try
    {
      Uri uri = Uri.parse(uriStr);
      InputStream inputStream = mContext.getContentResolver().openInputStream(uri);
      if (inputStream == null) return;

      BufferedReader reader = new BufferedReader(new InputStreamReader(inputStream));
      String line;
      String currentCategory = "Main";

      while ((line = reader.readLine()) != null)
      {
        String trimmed = line.trim();
        if (trimmed.startsWith("## "))
        {
          currentCategory = trimmed.replace("## ", "").trim();
        }
        else if (currentCategory.equalsIgnoreCase(targetTab) &&
                 (trimmed.startsWith("- [ ]") || trimmed.startsWith("- [x]")))
        {
          mRawNotes.add(trimmed);
        }
      }
      reader.close();
    }
    catch (Exception e)
    {
      e.printStackTrace();
    }
  }
}