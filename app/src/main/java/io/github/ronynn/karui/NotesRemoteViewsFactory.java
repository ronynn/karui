package io.github.ronynn.karui;

import android.appwidget.AppWidgetManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.text.SpannableString;
import android.text.Spanned;
import android.text.style.StrikethroughSpan;
import android.text.style.TypefaceSpan;
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
  private String mFontFamily = "sans-serif";

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
  public void onCreate() { }

  @Override
  public void onDataSetChanged()
  {
    mNotes.clear();

    SharedPreferences widgetPrefs = mContext.getSharedPreferences("widget_prefs", Context.MODE_PRIVATE);
    String targetTab = widgetPrefs.getString("widget_tab_" + mAppWidgetId, "Main");
    mFontFamily = widgetPrefs.getString("widget_font_" + mAppWidgetId, "sans-serif");
    if ("DEFAULT".equals(mFontFamily)) mFontFamily = "sans-serif";
    else if ("MONOSPACE".equals(mFontFamily)) mFontFamily = "monospace";

    try
    {
      // 1. Pending notes for this tab FIRST — newest at top.
      //    These are notes captured via widget + button, floating window,
      //    status bar reply, or share intent that haven't been synced to
      //    the file yet (MainActivity isn't running to consume the queue).
      loadPendingNotesForTab(targetTab);

      // 2. Then the synced file contents below.
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

  /**
   * Reads pending_notes_json from the queue and prepends items whose
   * target tab matches the widget's tab. Pending notes are shown newest-
   * first at the top of the list, so a note captured from the floating
   * window appears in the widget immediately even before MainActivity
   * opens to sync the queue to disk.
   *
   * Once MainActivity runs and consumes the queue, these notes disappear
   * from here and re-appear from loadFromMarkdownUri as normal synced
   * notes. No duplication because the queue is cleared on sync.
   */
  private void loadPendingNotesForTab(String targetTab)
  {
    SharedPreferences queue = mContext.getSharedPreferences("note_queue", Context.MODE_PRIVATE);
    String json = queue.getString("pending_notes_json", "[]");
    if (json.equals("[]") || json.isEmpty()) return;

    try
    {
      JSONArray arr = new JSONArray(json);
      List<NoteItem> pending = new ArrayList<>();
      for (int i = 0; i < arr.length(); i++)
      {
        JSONObject item = arr.getJSONObject(i);
        String text = item.optString("text", "");
        String tab = item.optString("tab", "Inbox");
        if (text.isEmpty()) continue;
        if (!tab.equalsIgnoreCase(targetTab)) continue;
        pending.add(new NoteItem(text, false, "- [ ] " + text));
      }
      if (!pending.isEmpty())
      {
        // Newest at the very top. Pending notes are appended to the array
        // in add order, so reverse to get the last-added first.
        List<NoteItem> toPrepend = new ArrayList<>(pending.size());
        for (int i = pending.size() - 1; i >= 0; i--)
        {
          toPrepend.add(pending.get(i));
        }
        mNotes.addAll(0, toPrepend);
      }
    }
    catch (Exception ignored) {}
  }

  private boolean loadFromMarkdownUri(String uriStr, String targetTab)
  {
    try
    {
      Uri uri = Uri.parse(uriStr);
      try
      {
        mContext.getContentResolver().takePersistableUriPermission(
          uri, Intent.FLAG_GRANT_READ_URI_PERMISSION);
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
        else if ((trimmed.startsWith("- [ ]") || trimmed.startsWith("- [x]") || trimmed.startsWith("- [X]"))
                 && currentCategory.equalsIgnoreCase(targetTab))
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
    catch (Exception e) { }
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
    if (position < 0 || position >= mNotes.size()) return null;

    NoteItem item = mNotes.get(position);
    RemoteViews views = new RemoteViews(mContext.getPackageName(), R.layout.widget_item);

    SpannableString span = new SpannableString(item.text);
    if (item.completed)
    {
      span.setSpan(new StrikethroughSpan(), 0, span.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
    }
    span.setSpan(new TypefaceSpan(mFontFamily), 0, span.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);

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