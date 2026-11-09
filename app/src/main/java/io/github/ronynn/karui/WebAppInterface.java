package io.github.ronynn.karui;

import android.Manifest;
import android.app.AlarmManager;
import android.app.NotificationManager;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.webkit.JavascriptInterface;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.OutputStream;
import java.lang.ref.WeakReference;

public class WebAppInterface
{
  private static final String PREFS_NOTE_QUEUE = "note_queue";

  private final WeakReference<MainActivity> mRef;

  WebAppInterface(MainActivity activity)
  {
    mRef = new WeakReference<>(activity);
  }

  private MainActivity act() { return mRef.get(); }

  // ── Sync file & import/export ───────────────────────────────────

  @JavascriptInterface
  public void setupSyncFile(String defaultFileName, String currentContent)
  {
    MainActivity a = act();
    if (a == null) return;

    a.pendingFileName = (defaultFileName != null && !defaultFileName.trim().isEmpty())
      ? defaultFileName : "file.md";
    a.pendingFileData = currentContent != null ? currentContent : "";

    Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
    intent.addCategory(Intent.CATEGORY_OPENABLE);
    intent.setType("text/markdown");
    intent.putExtra(Intent.EXTRA_TITLE, a.pendingFileName);

    try
      {
        a.startActivityForResult(intent, MainActivity.SYNC_FILE_REQUEST_CODE);
      }
    catch (ActivityNotFoundException e)
      {
        a.runOnUiThread(() -> Toast.makeText(a,
                                             "No document picker found on device.", Toast.LENGTH_SHORT).show());
      }
  }

  @JavascriptInterface
  public void saveFileSync(String filePath, String content)
  {
    MainActivity a = act();
    if (a == null || filePath == null || filePath.trim().isEmpty()) return;

    try
      {
        Uri uri = Uri.parse(filePath);
        OutputStream out = a.getContentResolver().openOutputStream(uri, "rwt");
        if (out == null) out = a.getContentResolver().openOutputStream(uri);
        if (out != null)
        {
          out.write(content.getBytes());
          out.close();

          Intent updateIntent = new Intent(MainActivity.ACTION_NOTE_ADDED);
          updateIntent.setPackage(a.getPackageName());
          a.sendBroadcast(updateIntent);
        }
      }
    catch (Exception e)
      {
        e.printStackTrace();
      }
  }

  @JavascriptInterface
  public void triggerManualReadSync()
  {
    MainActivity a = act();
    if (a == null) return;
    a.runOnUiThread(a::readSyncFileAndInject);
  }

  @JavascriptInterface
  public void importMarkdownFile()
  {
    MainActivity a = act();
    if (a == null) return;

    Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
    intent.addCategory(Intent.CATEGORY_OPENABLE);
    String[] mimeTypes = {"text/markdown", "text/plain", "text/x-markdown", "application/octet-stream"};
    intent.setType("*/*");
    intent.putExtra(Intent.EXTRA_MIME_TYPES, mimeTypes);

    try
      {
        a.startActivityForResult(intent, MainActivity.IMPORT_MD_FILE_REQUEST_CODE);
      }
    catch (ActivityNotFoundException e)
      {
        a.runOnUiThread(() -> Toast.makeText(a,
                                             "No document picker found", Toast.LENGTH_SHORT).show());
      }
  }

  @JavascriptInterface
  public void saveFile(String fileName, String fileData, String fileType)
  {
    MainActivity a = act();
    if (a == null) return;

    a.pendingFileName = fileName;
    a.pendingFileData = fileData;
    a.pendingFileType = fileType;

    Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
    intent.addCategory(Intent.CATEGORY_OPENABLE);
    intent.setType(fileType);
    intent.putExtra(Intent.EXTRA_TITLE, fileName);
    a.startActivityForResult(intent, MainActivity.CREATE_FILE_REQUEST_CODE);
  }

  @JavascriptInterface
  public void importJsonFile()
  {
    MainActivity a = act();
    if (a == null) return;

    Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
    intent.addCategory(Intent.CATEGORY_OPENABLE);
    intent.setType("application/json");
    a.startActivityForResult(intent, MainActivity.IMPORT_FILE_REQUEST_CODE);
  }

  // ── Notifications ───────────────────────────────────────────────

  @JavascriptInterface
  public void toggleNotification(boolean enable)
  {
    MainActivity a = act();
    if (a == null) return;

    a.runOnUiThread(() ->
                    {
                      if (enable)
                      {
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                            && a.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
                            != PackageManager.PERMISSION_GRANTED)
                        {
                          a.pendingQuickNoteEnable = true;
                          a.requestPermissions(
                            new String[]{Manifest.permission.POST_NOTIFICATIONS},
                            MainActivity.NOTIFICATION_PERMISSION_REQUEST);
                          return;
                        }
                        NotificationHelper.setEnabled(a, true);
                        NotificationHelper.show(a, false);
                      }
                      else
                      {
                        NotificationHelper.setEnabled(a, false);
                        NotificationHelper.cancel(a);
                      }
                    });
  }

  @JavascriptInterface
  public boolean isNotificationEnabled()
  {
    MainActivity a = act();
    return a != null && NotificationHelper.isEnabled(a);
  }

  // ── Tab / display settings ──────────────────────────────────────

  @JavascriptInterface
  public void setInboxTabName(String tabName)
  {
    MainActivity a = act();
    if (a == null) return;
    if (tabName == null || tabName.trim().isEmpty()) tabName = "Inbox";
    a.getSharedPreferences(PREFS_NOTE_QUEUE, Context.MODE_PRIVATE)
      .edit().putString("inbox_tab_name", tabName.trim()).apply();
  }

  @JavascriptInterface
  public void toggleScreenshots(boolean disable)
  {
    MainActivity a = act();
    if (a == null) return;
    a.runOnUiThread(() ->
                    {
                      if (disable) a.getWindow().addFlags(android.view.WindowManager.LayoutParams.FLAG_SECURE);
                      else         a.getWindow().clearFlags(android.view.WindowManager.LayoutParams.FLAG_SECURE);
                    });
  }

  // ── Bubble / overlay compatibility stubs ────────────────────────

  @JavascriptInterface
  public boolean isOverlayPermissionGranted()
  {
    MainActivity a = act();
    if (a == null) return false;
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M)
      return Settings.canDrawOverlays(a);
    return true;
  }

  @JavascriptInterface
  public void requestOverlayPermission()
  {
    // No-op: bubble API requires no overlay permission.
  }

  @JavascriptInterface
  public int getStatusBarHeight()
  {
    MainActivity a = act();
    if (a == null) return 0;
    int id = a.getResources().getIdentifier("status_bar_height", "dimen", "android");
    return id > 0 ? a.getResources().getDimensionPixelSize(id) : 0;
  }

  @JavascriptInterface
  public int getNavBarHeight()
  {
    MainActivity a = act();
    if (a == null) return 0;
    int id = a.getResources().getIdentifier("navigation_bar_height", "dimen", "android");
    return id > 0 ? a.getResources().getDimensionPixelSize(id) : 0;
  }

  // ── Calendar bridge ─────────────────────────────────────────────

  @JavascriptInterface
  public void updateCalendarEvents(String json)
  {
    MainActivity a = act();
    if (a == null) return;
    if (json == null) json = "[]";
    SharedPreferences prefs = a.getSharedPreferences(
      CalendarNotificationReceiver.PREFS, Context.MODE_PRIVATE);
    String oldJson = prefs.getString(CalendarNotificationReceiver.KEY_EVENTS_JSON, "[]");

    prefs.edit().putString(CalendarNotificationReceiver.KEY_EVENTS_JSON, json).apply();

    try
      {
        JSONArray oldArr = new JSONArray(oldJson);
        JSONArray newArr = new JSONArray(json);
        NotificationManager nm = (NotificationManager) a.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null)
        {
          for (int i = 0; i < oldArr.length(); i++)
            {
              JSONObject oldO = oldArr.getJSONObject(i);
              int oldId = oldO.optInt("id", 0);
              boolean stillActive = false;
              for (int j = 0; j < newArr.length(); j++)
                {
                  JSONObject newO = newArr.getJSONObject(j);
                  if (newO.optInt("id", 0) == oldId && !newO.optBoolean("completed", false))
                  {
                    stillActive = true;
                    break;
                  }
                }
              if (!stillActive)
              {
                nm.cancel(CalendarNotificationReceiver.EVENT_NOTIFICATION_BASE
                          + Math.abs(oldId % 100000));
              }
            }
        }
      }
    catch (Exception ignored) {}

    if (prefs.getBoolean(CalendarNotificationReceiver.KEY_ENABLED, false))
    {
      Intent refresh = new Intent(a, CalendarNotificationReceiver.class);
      refresh.setAction(CalendarNotificationReceiver.ACTION_REFRESH);
      a.sendBroadcast(refresh);
    }
  }

  @JavascriptInterface
  public void setCalendarNotificationsEnabled(final boolean enabled)
  {
    MainActivity a = act();
    if (a == null) return;

    SharedPreferences prefs = a.getSharedPreferences(
      CalendarNotificationReceiver.PREFS, Context.MODE_PRIVATE);
    boolean wasEnabled = prefs.getBoolean(CalendarNotificationReceiver.KEY_ENABLED, false);
    prefs.edit().putBoolean(CalendarNotificationReceiver.KEY_ENABLED, enabled).apply();

    final boolean justEnabled = enabled && !wasEnabled;

    a.runOnUiThread(() ->
                    {
                      if (enabled)
                      {
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                            && a.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
                            != PackageManager.PERMISSION_GRANTED)
                        {
                          a.requestPermissions(
                            new String[]{Manifest.permission.POST_NOTIFICATIONS},
                            MainActivity.NOTIFICATION_PERMISSION_REQUEST);
                        }

                        if (justEnabled && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S)
                        {
                          AlarmManager am = (AlarmManager) a.getSystemService(Context.ALARM_SERVICE);
                          if (am != null && !am.canScheduleExactAlarms())
                          {
                            Toast.makeText(a,
                                           "Allow 'Alarms & reminders' so calendar reminders fire on time.",
                                           Toast.LENGTH_LONG).show();
                            Intent i = new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM);
                            i.setData(Uri.parse("package:" + a.getPackageName()));
                            try { a.startActivity(i); } catch (Exception ignored) {}
                          }
                        }

                        CalendarNotificationReceiver.scheduleNext(a);
                        CalendarNotificationReceiver.scheduleEventReminders(a);

                        if (justEnabled)
                        {
                          Intent show = new Intent(a, CalendarNotificationReceiver.class);
                          a.sendBroadcast(show);
                        }
                      }
                      else
                      {
                        CalendarNotificationReceiver.cancel(a);
                      }
                    });
  }
}