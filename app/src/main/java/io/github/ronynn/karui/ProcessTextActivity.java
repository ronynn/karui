package io.github.ronynn.karui;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

public class ProcessTextActivity extends Activity
{
  @Override
  protected void onCreate(Bundle savedInstanceState)
  {
    super.onCreate(savedInstanceState);
    handleIntent(getIntent());
    finish();
  }

  @Override
  protected void onNewIntent(Intent intent)
  {
    super.onNewIntent(intent);
    handleIntent(intent);
    finish();
  }

  private void handleIntent(Intent intent)
  {
    if (intent == null)
    {
      return;
    }

    String action = intent.getAction();
    CharSequence text = null;

    if (Intent.ACTION_PROCESS_TEXT.equals(action))
    {
      text = intent.getCharSequenceExtra(Intent.EXTRA_PROCESS_TEXT);
    }
    else if (Intent.ACTION_SEND.equals(action) && "text/plain".equals(intent.getType()))
    {
      text = intent.getCharSequenceExtra(Intent.EXTRA_TEXT);
      if (text == null)
      {
        text = intent.getStringExtra(Intent.EXTRA_TEXT);
      }
    }

    if (text != null && text.length() > 0)
    {
      String noteText = text.toString().trim();
      if (!noteText.isEmpty())
      {
        saveNoteToQueue(this, noteText);
        Toast.makeText(this, "Saved to Karui", Toast.LENGTH_SHORT).show();

        Intent updateIntent = new Intent(MainActivity.ACTION_NOTE_ADDED);
        updateIntent.setPackage(getPackageName());
        sendBroadcast(updateIntent);
      }
    }
  }

  public static void saveNoteToQueue(Context context, String noteText)
  {
    SharedPreferences prefs = context.getSharedPreferences("note_queue", Context.MODE_PRIVATE);
    String inboxTab = prefs.getString("inbox_tab_name", "Inbox");
    String jsonStr = prefs.getString("pending_notes_json", "[]");

    try
    {
      JSONArray array = new JSONArray(jsonStr);
      JSONObject obj = new JSONObject();
      obj.put("text", noteText);
      obj.put("tab", inboxTab);
      array.put(obj);

      prefs.edit().putString("pending_notes_json", array.toString()).apply();
    }
    catch (JSONException e)
    {
      e.printStackTrace();
    }
  }
}