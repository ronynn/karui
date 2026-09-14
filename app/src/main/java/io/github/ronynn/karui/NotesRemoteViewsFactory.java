package io.github.ronynn.karui;

import android.appwidget.AppWidgetManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
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
  private final List<String> mNotes = new ArrayList<>();

  public NotesRemoteViewsFactory(Context context, Intent intent)
  {
    mContext = context;
    mAppWidgetId = intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID);
  }

  @Override
  public void onCreate() {}

  @Override
  public void onDataSetChanged()
  {
    mNotes.clear();
    SharedPreferences widgetPrefs = mContext.getSharedPreferences("widget_prefs", Context.MODE_PRIVATE);
    String targetTab = widgetPrefs.getString("widget_tab_" + mAppWidgetId, "Inbox").trim();

    SharedPreferences syncPrefs = mContext.getSharedPreferences("sync_prefs", Context.MODE_PRIVATE);
    String uriStr = syncPrefs.getString("sync_file_uri", null);

    if (uriStr != null && !uriStr.isEmpty())
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
        if (inputStream != null)
        {
          BufferedReader reader = new BufferedReader(new InputStreamReader(inputStream));
          String line;
          String currentCat = "Main";
          while ((line = reader.readLine()) != null)
          {
            String trimmed = line.trim();
            if (trimmed.startsWith("## "))
            {
              currentCat = trimmed.replace("## ", "").replaceAll("<!--.*?-->", "").trim();
            }
            else if ((trimmed.startsWith("- [ ]") || trimmed.startsWith("- [x]")) && currentCat.equalsIgnoreCase(targetTab))
            {
              mNotes.add(trimmed);
            }
          }
          reader.close();
          return;
        }
      }
      catch (Exception e)
      {
        e.printStackTrace();
      }
    }

    SharedPreferences queuePrefs = mContext.getSharedPreferences("note_queue", Context.MODE_PRIVATE);
    String jsonStr = queuePrefs.getString("pending_notes_json", "[]");
    try
    {
      JSONArray array = new JSONArray(jsonStr);
      for (int i = 0; i < array.length(); i++)
      {
        JSONObject obj = array.getJSONObject(i);
        String tab = obj.optString("tab", "Inbox").trim();
        String text = obj.optString("text", "").trim();
        if (!text.isEmpty() && tab.equalsIgnoreCase(targetTab))
        {
          mNotes.add("- [ ] " + text);
        }
      }
    }
    catch (Exception e)
    {
      e.printStackTrace();
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

  @Override
  public RemoteViews getViewAt(int position)
  {
    if (position >= mNotes.size()) return null;
    String rawNote = mNotes.get(position);

    RemoteViews rv = new RemoteViews(mContext.getPackageName(), R.layout.widget_item);

    String displayText = rawNote.replaceAll("<!--.*?-->", "").trim();
    if (displayText.startsWith("- [x]"))
    {
      displayText = "[x] " + displayText.substring(5).trim();
    }
    else if (displayText.startsWith("- [ ]"))
    {
      displayText = "[ ] " + displayText.substring(5).trim();
    }

    rv.setTextViewText(R.id.widget_item_text, displayText);

    Intent fillInIntent = new Intent();
    fillInIntent.putExtra("raw_note", rawNote);
    fillInIntent.putExtra("widget_id", mAppWidgetId);
    rv.setOnClickFillInIntent(R.id.widget_item_text, fillInIntent);

    return rv;
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
}