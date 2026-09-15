package io.github.ronynn.karui;

import android.appwidget.AppWidgetManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.text.SpannableString;
import android.text.Spanned;
import android.text.style.StrikethroughSpan;
import android.widget.RemoteViews;
import android.widget.RemoteViewsService;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.List;

public class NotesRemoteViewsFactory implements RemoteViewsService.RemoteViewsFactory
{
  private final Context mContext;
  private final int mAppWidgetId;
  private final List<NoteItem> mNotes = new ArrayList<>();

  public static class NoteItem
  {
    public String text;
    public boolean completed;
    public String raw;

    public NoteItem(String text, boolean completed, String raw)
    {
      this.text = text;
      this.completed = completed;
      this.raw = raw;
    }
  }

  public NotesRemoteViewsFactory(Context context, Intent intent)
  {
    mContext = context;
    mAppWidgetId = intent.getIntExtra(
      AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID);
  }

  @Override
  public void onCreate()
  {
  }

  // --- SECTION: DATA LOADERS ---
  @Override
  public void onDataSetChanged()
  {
    mNotes.clear();
    try
    {
      SharedPreferences widgetPrefs = mContext.getSharedPreferences("widget_prefs", Context.MODE_PRIVATE);
      String targetTab = widgetPrefs.getString("widget_tab_" + mAppWidgetId, "Main");

      SharedPreferences syncPrefs = mContext.getSharedPreferences("sync_prefs", Context.MODE_PRIVATE);
      String uriStr = syncPrefs.getString("sync_file_uri", null);

      boolean loadedFromSync = false;
      if (uriStr != null && !uriStr.isEmpty())
      {
        loadedFromSync = loadFromMarkdownUri(uriStr, targetTab);
      }

      if (!loadedFromSync)
      {
        loadFromSharedPreferences(targetTab);
      }
    }
    catch (Throwable t)
    {
      t.printStackTrace();
    }
  }

  private boolean loadFromMarkdownUri(String uriStr, String targetTab)
  {
    try
    {
      Uri uri = Uri.parse(uriStr);
      try
      {
        mContext.getContentResolver().takePersistableUriPermission(
          uri, Intent.FLAG_GRANT_READ_URI_PERMISSION
        );
      }
      catch (SecurityException ignored) {}

      InputStream inputStream = mContext.getContentResolver().openInputStream(uri);
      if (inputStream == null) return false;

      BufferedReader reader = new BufferedReader(new InputStreamReader(inputStream));
      String line;
      String currentCategory = "Main";

      while ((line = reader.readLine()) != null)
      {
        String trimmed = line.trim();
        if (trimmed.startsWith("## "))
        {
          currentCategory = trimmed.replace("## ", "").replaceAll("<!--.*?-->", "").trim();
        }
        else if ((trimmed.startsWith("- [ ]") || trimmed.startsWith("- [x]") || trimmed.startsWith("- [X]")) && currentCategory.equalsIgnoreCase(targetTab))
        {
          boolean completed = trimmed.startsWith("- [x]") || trimmed.startsWith("- [X]");
          String content = trimmed.substring(5).replaceAll("<!--.*?-->", "").trim();
          if (!content.isEmpty())
          {
            mNotes.add(new NoteItem(content, completed, line));
          }
        }
      }
      reader.close();
      return true;
    }
    catch (Exception e)
    {
      return false;
    }
  }

  private void loadFromSharedPreferences(String targetTab)
  {
    SharedPreferences prefs = mContext.getSharedPreferences("note_queue", Context.MODE_PRIVATE);
    String jsonStr = prefs.getString("notes_data", null);
    if (jsonStr == null || jsonStr.trim().isEmpty()) return;

    try
    {
      JSONArray array = new JSONArray(jsonStr);
      for (int i = 0; i < array.length(); i++)
      {
        JSONObject obj = array.optJSONObject(i);
        if (obj == null) continue;

        String category = obj.optString("category", "Main");
        if (category.equalsIgnoreCase(targetTab))
        {
          String text = obj.optString("text", "");
          boolean completed = obj.optBoolean("completed", false);
          if (!text.isEmpty())
          {
            String rawMark = completed ? "- [x] " : "- [ ] ";
            mNotes.add(new NoteItem(text, completed, rawMark + text));
          }
        }
      }
    }
    catch (Exception e)
    {
    }
  }

  @Override
  public void onDestroy()
  {
    mNotes.clear();
  }

  @Override
  public int getCount()
  {
    return mNotes.size();
  }

  // --- SECTION: ITEM BINDING ---
  @Override
  public RemoteViews getViewAt(int position)
  {
    if (position < 0 || position >= mNotes.size()) return null;

    NoteItem item = mNotes.get(position);
    RemoteViews views = new RemoteViews(mContext.getPackageName(), R.layout.widget_item);

    SpannableString span = new SpannableString(item.text);
    if (item.completed)
    {
      span.setSpan(new StrikethroughSpan(), 0, span.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
    }

    views.setTextViewText(R.id.widget_item_text, span);

    Intent fillInIntent = new Intent();
    fillInIntent.putExtra("raw_note", item.raw);
    fillInIntent.putExtra("widget_id", mAppWidgetId);
    views.setOnClickFillInIntent(R.id.widget_item_text, fillInIntent);

    return views;
  }

  @Override
  public RemoteViews getLoadingView()
  {
    return new RemoteViews(mContext.getPackageName(), R.layout.widget_loading);
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
}