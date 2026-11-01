package io.github.ronynn.karui;

import android.Manifest;
import android.animation.ObjectAnimator;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.RemoteInput;
import android.content.ActivityNotFoundException;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.drawable.Icon;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.service.notification.StatusBarNotification;
import android.view.View;
import android.view.WindowManager;
import android.view.animation.DecelerateInterpolator;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;

public class MainActivity extends Activity
{
  public static final String ACTION_NOTE_ADDED = "io.github.ronynn.karui.ACTION_NOTE_ADDED";

  private static final int CREATE_FILE_REQUEST_CODE = 1;
  private static final int IMPORT_FILE_REQUEST_CODE = 2;
  private static final int FILECHOOSER_RESULTCODE = 3;
  private static final int SYNC_FILE_REQUEST_CODE = 4;
  private static final int IMPORT_MD_FILE_REQUEST_CODE = 5;
  private static final int NOTIFICATION_PERMISSION_REQUEST = 100;

  private static final String CHANNEL_ID = "note_reply_channel";
  private static final int NOTIFICATION_ID = 1;
  private static final String PREFS_SYNC = "sync_prefs";
  private static final String KEY_SYNC_URI = "sync_file_uri";

  private static final String PREFS_NOTE_QUEUE = "note_queue";
  private static final String KEY_NOTIFICATION_ENABLED = "notification_enabled";

  private WebView mWebView;
  private View splashScreen;

  private String pendingFileName;
  private String pendingFileData;
  private String pendingFileType;

  private ValueCallback<Uri[]> mFilePathCallback;

  private boolean isNotificationActive = false;
  private boolean isPageLoaded = false;
  private String inboxTabName = "Inbox";

  /** Set when the quick-note toggle requested the POST_NOTIFICATIONS permission,
   *  so onRequestPermissionsResult knows which flow to resume. */
  private boolean pendingQuickNoteEnable = false;

  private final BroadcastReceiver noteReceiver = new BroadcastReceiver()
  {
    @Override
    public void onReceive(Context context, Intent intent)
    {
      if (isPageLoaded)
      {
        injectPendingNotes();
      }
    }
  };

  @Override
  @SuppressLint({"SetJavaScriptEnabled", "AllowFileAccess"})
  protected void onCreate(Bundle savedInstanceState)
  {
    super.onCreate(savedInstanceState);
    setContentView(R.layout.activity_main);

    mWebView = findViewById(R.id.activity_main_webview);
    splashScreen = findViewById(R.id.splash_screen);

    mWebView.setOverScrollMode(View.OVER_SCROLL_NEVER);

    WebSettings webSettings = mWebView.getSettings();
    webSettings.setJavaScriptEnabled(true);
    webSettings.setDomStorageEnabled(true);
    webSettings.setAllowFileAccess(true);
    webSettings.setAllowContentAccess(true);
    webSettings.setAllowFileAccessFromFileURLs(true);
    webSettings.setAllowUniversalAccessFromFileURLs(true);

    CookieManager cookieManager = CookieManager.getInstance();
    cookieManager.setAcceptCookie(true);
    cookieManager.setAcceptThirdPartyCookies(mWebView, true);

    mWebView.addJavascriptInterface(new WebAppInterface(), "Android");

    mWebView.setWebViewClient(new WebViewClient()
                              {
                                @Override
                                public boolean shouldOverrideUrlLoading(WebView view, String url)
                                {
                                  Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                                  try
                                    {
                                      view.getContext().startActivity(intent);
                                    }
                                  catch (ActivityNotFoundException e)
                                    {
                                      Toast.makeText(view.getContext(), R.string.no_app_to_open_link, Toast.LENGTH_SHORT).show();
                                    }
                                  return true;
                                }

                                @Override
                                public void onPageFinished(WebView view, String url)
                                {
                                  ObjectAnimator fadeOut = ObjectAnimator.ofFloat(splashScreen, "alpha", 1f, 0f);
                                  fadeOut.setInterpolator(new DecelerateInterpolator());
                                  fadeOut.setDuration(500);
                                  fadeOut.start();

                                  splashScreen.setVisibility(View.GONE);
                                  mWebView.setVisibility(View.VISIBLE);

                                  isPageLoaded = true;
                                  injectPendingNotes();
                                  readSyncFileAndInject();

                                  // If the app was launched via the assistant gesture,
                                  // let the web layer focus whatever it wants.
                                  Intent launchIntent = getIntent();
                                  if (launchIntent != null
                                      && Intent.ACTION_ASSIST.equals(launchIntent.getAction()))
                                  {
                                    mWebView.evaluateJavascript(
                                      "if(window.onAssistantLaunched) window.onAssistantLaunched();", null);
                                  }
                                }
                              });

    mWebView.setWebChromeClient(new WebChromeClient()
                                {
                                  @Override
                                  public boolean onShowFileChooser(WebView webView, ValueCallback<Uri[]> filePathCallback, FileChooserParams fileChooserParams)
                                  {
                                    if (mFilePathCallback != null)
                                    {
                                      mFilePathCallback.onReceiveValue(null);
                                    }
                                    mFilePathCallback = filePathCallback;
                                    Intent intent = fileChooserParams.createIntent();
                                    try
                                      {
                                        startActivityForResult(intent, FILECHOOSER_RESULTCODE);
                                      }
                                    catch (Exception e)
                                      {
                                        mFilePathCallback = null;
                                        return false;
                                      }
                                    return true;
                                  }
                                });

    mWebView.loadUrl("file:///android_asset/index.html");

    SharedPreferences prefs = getSharedPreferences(PREFS_NOTE_QUEUE, MODE_PRIVATE);
    inboxTabName = prefs.getString("inbox_tab_name", "Inbox");

    createNotificationChannel();

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU)
    {
      registerReceiver(noteReceiver, new IntentFilter(ACTION_NOTE_ADDED), Context.RECEIVER_NOT_EXPORTED);
    }
    else
    {
      registerReceiver(noteReceiver, new IntentFilter(ACTION_NOTE_ADDED));
    }

    SharedPreferences calPrefs = getSharedPreferences(CalendarNotificationReceiver.PREFS, MODE_PRIVATE);
    if (calPrefs.getBoolean(CalendarNotificationReceiver.KEY_ENABLED, false))
    {
      CalendarNotificationReceiver.scheduleNext(this);
      CalendarNotificationReceiver.scheduleEventReminders(this);
    }
  }

  // Section: Notification Handling

  private void createNotificationChannel()
  {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
    {
      NotificationChannel channel = new NotificationChannel(
        CHANNEL_ID, "Quick Note", NotificationManager.IMPORTANCE_LOW);
      channel.setDescription("Add notes from status bar");
      NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
      if (manager != null)
      {
        manager.createNotificationChannel(channel);
      }
    }
  }

  /**
   * Post (or re-post) the quick-note notification.
   *
   * @param silent  When true, no Toast / settings prompts are shown. This is the
   *                path used by {@link #ensureNotificationMatchesPreference()}
   *                on every resume so the notification is re-created after a
   *                reboot / force-stop / memory kill without nagging the user.
   */
  private void showNotification(boolean silent)
  {
    createNotificationChannel();

    NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
    if (manager == null)
    {
      if (!silent) Toast.makeText(this, "Notification service unavailable", Toast.LENGTH_SHORT).show();
      return;
    }

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N && !manager.areNotificationsEnabled())
    {
      if (!silent)
      {
        Toast.makeText(this, "Notifications are disabled. Please enable them in system settings.", Toast.LENGTH_LONG).show();
        try
          {
            Intent intent = new Intent();
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
            {
              intent.setAction(android.provider.Settings.ACTION_APP_NOTIFICATION_SETTINGS);
              intent.putExtra(android.provider.Settings.EXTRA_APP_PACKAGE, getPackageName());
            }
            else
            {
              intent.setAction(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
              intent.setData(Uri.parse("package:" + getPackageName()));
            }
            startActivity(intent);
          }
        catch (Exception ignored)
          {
          }
      }
      return;
    }

    try
      {
        Intent openAppIntent = new Intent(this, MainActivity.class);
        int openFlags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M)
        {
          openFlags |= PendingIntent.FLAG_IMMUTABLE;
        }
        PendingIntent openPendingIntent = PendingIntent.getActivity(this, 0, openAppIntent, openFlags);

        RemoteInput remoteInput = new RemoteInput.Builder(NoteReplyReceiver.KEY_TEXT_REPLY)
          .setLabel("Add Note")
          .build();

        Intent replyIntent = new Intent(this, NoteReplyReceiver.class);
        int replyFlags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S)
        {
          replyFlags |= PendingIntent.FLAG_MUTABLE;
        }
        else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M)
        {
          replyFlags |= 0;
        }
        PendingIntent replyPendingIntent = PendingIntent.getBroadcast(this, 1, replyIntent, replyFlags);

        Notification.Action replyAction;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M)
        {
          replyAction = new Notification.Action.Builder(
            Icon.createWithResource(this, R.drawable.ic_note),
            "Add Note",
            replyPendingIntent)
            .addRemoteInput(remoteInput)
            .build();
        }
        else
        {
          replyAction = new Notification.Action.Builder(
            R.drawable.ic_note,
            "Add Note",
            replyPendingIntent)
            .addRemoteInput(remoteInput)
            .build();
        }

        Notification.Builder builder;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
        {
          builder = new Notification.Builder(this, CHANNEL_ID);
        }
        else
        {
          builder = new Notification.Builder(this);
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M)
        {
          builder.setSmallIcon(Icon.createWithResource(this, R.drawable.ic_note));
        }
        else
        {
          builder.setSmallIcon(R.drawable.ic_note);
        }

        builder.setContentTitle("Karui Quick Note")
          .setContentText("Swipe down to add a note")
          .setContentIntent(openPendingIntent)
          .addAction(replyAction)
          .setOngoing(true)
          .setOnlyAlertOnce(true);

        Notification notification = builder.build();
        manager.notify(NOTIFICATION_ID, notification);
        isNotificationActive = true;
      }
    catch (Exception e)
      {
        if (!silent)
        {
          String msg = e.getClass().getSimpleName() + ": " + e.getMessage();
          if (e.getCause() != null)
          {
            msg += "\nCause: " + e.getCause().toString();
          }
          Toast.makeText(this, "Couldn't show notification:\n" + msg, Toast.LENGTH_LONG).show();
        }
        e.printStackTrace();
      }
  }

  private void cancelNotification()
  {
    NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
    if (manager != null)
    {
      manager.cancel(NOTIFICATION_ID);
    }
    isNotificationActive = false;
  }

  // --- Quick-note state reconciliation -------------------------------------

  private void setNotificationEnabled(boolean enabled)
  {
    getSharedPreferences(PREFS_NOTE_QUEUE, MODE_PRIVATE)
      .edit().putBoolean(KEY_NOTIFICATION_ENABLED, enabled).apply();
  }

  /**
   * Returns true if a notification with our id is currently posted by this app.
   * Note: getActiveNotifications() returns StatusBarNotification[], so we must
   * iterate that type and read getId() from it (not from Notification).
   */
  private boolean isNotificationShowing()
  {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return false;
    NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
    if (manager == null) return false;
    for (StatusBarNotification sbn : manager.getActiveNotifications())
    {
      if (sbn.getId() == NOTIFICATION_ID) return true;
    }
    return false;
  }

  /**
   * On every resume: if the user had the quick-note toggle on, make sure the
   * notification actually exists. The OS can silently drop it after reboot,
   * force-stop, memory-kill of the app, or when the notification channel is
   * re-created — this brings it back without the user needing to untoggle
   * and re-toggle the switch in the app.
   */
  private void ensureNotificationMatchesPreference()
  {
    SharedPreferences prefs = getSharedPreferences(PREFS_NOTE_QUEUE, MODE_PRIVATE);
    if (!prefs.getBoolean(KEY_NOTIFICATION_ENABLED, false)) return;

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
        && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
           != PackageManager.PERMISSION_GRANTED)
    {
      // Permission was revoked while we weren't looking. Nothing we can do
      // silently — next time the user opens the toggle we'll re-prompt.
      return;
    }

    if (isNotificationShowing()) return;
    showNotification(true);
  }

  // Section: Data Injection & Sync

  private void injectPendingNotes()
  {
    if (!isPageLoaded) return;

    SharedPreferences prefs = getSharedPreferences(PREFS_NOTE_QUEUE, MODE_PRIVATE);
    String jsonStr = prefs.getString("pending_notes_json", "[]");
    if (jsonStr.equals("[]") || jsonStr.isEmpty()) return;

    prefs.edit().remove("pending_notes_json").apply();

    String js = "if(window.syncNotesArrayFromAndroid) window.syncNotesArrayFromAndroid(" + JSONObject.quote(jsonStr) + ");";
    mWebView.evaluateJavascript(js, null);
  }

  private void readSyncFileAndInject()
  {
    if (!isPageLoaded) return;

    SharedPreferences prefs = getSharedPreferences(PREFS_SYNC, MODE_PRIVATE);
    String uriStr = prefs.getString(KEY_SYNC_URI, null);
    if (uriStr == null || uriStr.isEmpty()) return;

    try
      {
        Uri uri = Uri.parse(uriStr);
        InputStream inputStream = getContentResolver().openInputStream(uri);
        if (inputStream == null) return;

        BufferedReader reader = new BufferedReader(new InputStreamReader(inputStream));
        StringBuilder sb = new StringBuilder();
        String line;
        while ((line = reader.readLine()) != null)
          {
            sb.append(line).append("\n");
          }
        reader.close();

        String mdContent = sb.toString();
        String js = "if(window.importMarkdownFromAndroid) window.importMarkdownFromAndroid(" + JSONObject.quote(mdContent) + ");";
        mWebView.evaluateJavascript(js, null);
      }
    catch (SecurityException se)
      {
        Toast.makeText(this, "Sync file permission lost. Please re-select file.", Toast.LENGTH_LONG).show();
      }
    catch (IOException e)
      {
        e.printStackTrace();
      }
  }

  private void triggerAppCloseSync()
  {
    if (mWebView != null && isPageLoaded)
    {
      mWebView.evaluateJavascript("if(window.exportMarkdownSilent) window.exportMarkdownSilent();", null);
      mWebView.evaluateJavascript("if(window.syncCalendarEventsToAndroid) window.syncCalendarEventsToAndroid();", null);
    }
  }

  @Override
  protected void onResume()
  {
    super.onResume();

    // Re-create the status-bar note input if the user had it on but the OS
    // dropped the notification (reboot, force-stop, memory kill, …).
    ensureNotificationMatchesPreference();

    if (isPageLoaded)
    {
      injectPendingNotes();
      readSyncFileAndInject();
    }

    SharedPreferences calPrefs = getSharedPreferences(CalendarNotificationReceiver.PREFS, MODE_PRIVATE);
    if (calPrefs.getBoolean(CalendarNotificationReceiver.KEY_ENABLED, false))
    {
      Intent refresh = new Intent(this, CalendarNotificationReceiver.class);
      refresh.setAction(CalendarNotificationReceiver.ACTION_REFRESH);
      sendBroadcast(refresh);
    }
  }

  @Override
  protected void onNewIntent(Intent intent)
  {
    super.onNewIntent(intent);
    setIntent(intent);

    if (intent != null
        && Intent.ACTION_ASSIST.equals(intent.getAction())
        && isPageLoaded
        && mWebView != null)
    {
      mWebView.evaluateJavascript(
        "if(window.onAssistantLaunched) window.onAssistantLaunched();", null);
    }
  }

  @Override
  protected void onStop()
  {
    super.onStop();
    triggerAppCloseSync();
  }

  @Override
  protected void onActivityResult(int requestCode, int resultCode, Intent data)
  {
    super.onActivityResult(requestCode, resultCode, data);

    if (requestCode == CREATE_FILE_REQUEST_CODE && resultCode == RESULT_OK)
    {
      if (data != null && data.getData() != null && pendingFileData != null)
      {
        try
          {
            OutputStream outputStream = getContentResolver().openOutputStream(data.getData());
            if (outputStream != null)
            {
              outputStream.write(pendingFileData.getBytes());
              outputStream.close();
            }
          }
        catch (IOException e)
          {
            e.printStackTrace();
          }
      }
    }
    else if (requestCode == IMPORT_FILE_REQUEST_CODE && resultCode == RESULT_OK)
    {
      if (data != null && data.getData() != null)
      {
        try
          {
            InputStream inputStream = getContentResolver().openInputStream(data.getData());
            BufferedReader reader = new BufferedReader(new InputStreamReader(inputStream));
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null)
              {
                sb.append(line);
              }
            reader.close();
            String jsonContent = sb.toString();

            String jsCode = "if(window.setAndroidNotes) window.setAndroidNotes(" + JSONObject.quote(jsonContent) + ");";
            mWebView.evaluateJavascript(jsCode, null);
          }
        catch (IOException e)
          {
            e.printStackTrace();
          }
      }
    }
    else if (requestCode == IMPORT_MD_FILE_REQUEST_CODE && resultCode == RESULT_OK)
    {
      if (data != null && data.getData() != null)
      {
        try
          {
            InputStream inputStream = getContentResolver().openInputStream(data.getData());
            BufferedReader reader = new BufferedReader(new InputStreamReader(inputStream));
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null)
              {
                sb.append(line).append("\n");
              }
            reader.close();
            String mdContent = sb.toString();

            String jsCode = "if(window.importMarkdownFromAndroid) window.importMarkdownFromAndroid(" + JSONObject.quote(mdContent) + ");";
            mWebView.evaluateJavascript(jsCode, null);
          }
        catch (IOException e)
          {
            e.printStackTrace();
          }
      }
    }
    else if (requestCode == SYNC_FILE_REQUEST_CODE && resultCode == RESULT_OK)
    {
      if (data != null && data.getData() != null)
      {
        Uri uri = data.getData();
        try
          {
            int takeFlags = data.getFlags()
              & (Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
            getContentResolver().takePersistableUriPermission(uri, takeFlags);

            SharedPreferences prefs = getSharedPreferences(PREFS_SYNC, MODE_PRIVATE);
            prefs.edit().putString(KEY_SYNC_URI, uri.toString()).apply();

            InputStream inputStream = getContentResolver().openInputStream(uri);
            StringBuilder sb = new StringBuilder();
            if (inputStream != null)
            {
              BufferedReader reader = new BufferedReader(new InputStreamReader(inputStream));
              String line;
              while ((line = reader.readLine()) != null)
                {
                  sb.append(line).append("\n");
                }
              reader.close();
            }

            String existingContent = sb.toString().trim();

            if (!existingContent.isEmpty())
            {
              String jsCode = "if(window.importMarkdownFromAndroid) window.importMarkdownFromAndroid(" + JSONObject.quote(existingContent) + ");";
              mWebView.evaluateJavascript(jsCode, null);
              Toast.makeText(this, "Imported notes from sync file!", Toast.LENGTH_SHORT).show();
            }
            else if (pendingFileData != null && !pendingFileData.isEmpty())
            {
              OutputStream outputStream = getContentResolver().openInputStream(uri) != null ?
                getContentResolver().openOutputStream(uri, "rwt") : getContentResolver().openOutputStream(uri);
              if (outputStream != null)
              {
                outputStream.write(pendingFileData.getBytes());
                outputStream.close();
              }
              Toast.makeText(this, "Sync file connected!", Toast.LENGTH_SHORT).show();
            }

            String jsCode = "if(window.onSyncFileSelected) window.onSyncFileSelected(" + JSONObject.quote(uri.toString()) + ");";
            mWebView.evaluateJavascript(jsCode, null);
          }
        catch (Exception e)
          {
            Toast.makeText(this, "Failed to initialize sync file: " + e.getMessage(), Toast.LENGTH_LONG).show();
            e.printStackTrace();
          }
      }
    }
    else if (requestCode == FILECHOOSER_RESULTCODE)
    {
      if (mFilePathCallback == null) return;
      Uri[] results = null;
      if (resultCode == Activity.RESULT_OK && data != null)
      {
        String dataString = data.getDataString();
        if (dataString != null)
        {
          results = new Uri[]{Uri.parse(dataString)};
        }
        else if (data.getClipData() != null)
        {
          int count = data.getClipData().getItemCount();
          results = new Uri[count];
          for (int i = 0; i < count; i++)
            {
              results[i] = data.getClipData().getItemAt(i).getUri();
            }
        }
      }
      mFilePathCallback.onReceiveValue(results);
      mFilePathCallback = null;
    }
  }

  @Override
  public void onBackPressed()
  {
    if (mWebView.canGoBack())
    {
      mWebView.goBack();
    }
    else
    {
      super.onBackPressed();
    }
  }

  @Override
  protected void onDestroy()
  {
    triggerAppCloseSync();
    super.onDestroy();
    try
      {
        unregisterReceiver(noteReceiver);
      }
    catch (Exception ignored)
      {
      }

    if (mWebView != null)
    {
      mWebView.destroy();
    }
  }

  // Section: JavaScript Interface

  public class WebAppInterface
  {
    @JavascriptInterface
    public void setupSyncFile(String defaultFileName, String currentContent)
    {
      pendingFileName = (defaultFileName != null && !defaultFileName.trim().isEmpty()) ? defaultFileName : "file.md";
      pendingFileData = currentContent != null ? currentContent : "";

      Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
      intent.addCategory(Intent.CATEGORY_OPENABLE);
      intent.setType("text/markdown");
      intent.putExtra(Intent.EXTRA_TITLE, pendingFileName);

      try
        {
          startActivityForResult(intent, SYNC_FILE_REQUEST_CODE);
        }
      catch (ActivityNotFoundException e)
        {
          runOnUiThread(() -> Toast.makeText(MainActivity.this, "No document picker found on device.", Toast.LENGTH_SHORT).show());
        }
    }

    @JavascriptInterface
    public void saveFileSync(String filePath, String content)
    {
      if (filePath == null || filePath.trim().isEmpty()) return;

      try
        {
          Uri uri = Uri.parse(filePath);
          OutputStream outputStream = getContentResolver().openOutputStream(uri, "rwt");
          if (outputStream == null)
          {
            outputStream = getContentResolver().openOutputStream(uri);
          }
          if (outputStream != null)
          {
            outputStream.write(content.getBytes());
            outputStream.close();

            Intent updateIntent = new Intent(MainActivity.ACTION_NOTE_ADDED);
            updateIntent.setPackage(getPackageName());
            sendBroadcast(updateIntent);
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
      runOnUiThread(() -> readSyncFileAndInject());
    }

    @JavascriptInterface
    public void importMarkdownFile()
    {
      Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
      intent.addCategory(Intent.CATEGORY_OPENABLE);

      String[] mimeTypes = {"text/markdown", "text/plain", "text/x-markdown", "application/octet-stream"};
      intent.setType("*/*");
      intent.putExtra(Intent.EXTRA_MIME_TYPES, mimeTypes);

      try
        {
          startActivityForResult(intent, IMPORT_MD_FILE_REQUEST_CODE);
        }
      catch (ActivityNotFoundException e)
        {
          runOnUiThread(() -> Toast.makeText(MainActivity.this, "No document picker found", Toast.LENGTH_SHORT).show());
        }
    }

    @JavascriptInterface
    public void saveFile(String fileName, String fileData, String fileType)
    {
      pendingFileName = fileName;
      pendingFileData = fileData;
      pendingFileType = fileType;

      Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
      intent.addCategory(Intent.CATEGORY_OPENABLE);
      intent.setType(fileType);
      intent.putExtra(Intent.EXTRA_TITLE, fileName);
      startActivityForResult(intent, CREATE_FILE_REQUEST_CODE);
    }

    @JavascriptInterface
    public void importJsonFile()
    {
      Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
      intent.addCategory(Intent.CATEGORY_OPENABLE);
      intent.setType("application/json");
      startActivityForResult(intent, IMPORT_FILE_REQUEST_CODE);
    }

    @JavascriptInterface
    public void toggleNotification(boolean enable)
    {
      runOnUiThread(() -> {
        if (enable)
        {
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
              && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
                 != PackageManager.PERMISSION_GRANTED)
          {
            pendingQuickNoteEnable = true;
            requestPermissions(
              new String[]{Manifest.permission.POST_NOTIFICATIONS},
              NOTIFICATION_PERMISSION_REQUEST);
            return; // persisted after the grant in onRequestPermissionsResult
          }
          setNotificationEnabled(true);
          showNotification(false);
        }
        else
        {
          setNotificationEnabled(false);
          cancelNotification();
        }
      });
    }

    /** True if the user has the quick-note toggle enabled.
     *  Use this from JS to restore the switch state on app start. */
    @JavascriptInterface
    public boolean isNotificationEnabled()
    {
      return getSharedPreferences(PREFS_NOTE_QUEUE, MODE_PRIVATE)
        .getBoolean(KEY_NOTIFICATION_ENABLED, false);
    }

    @JavascriptInterface
    public void setInboxTabName(String tabName)
    {
      if (tabName == null || tabName.trim().isEmpty())
      {
        tabName = "Inbox";
      }
      inboxTabName = tabName.trim();
      getSharedPreferences(PREFS_NOTE_QUEUE, MODE_PRIVATE)
        .edit().putString("inbox_tab_name", inboxTabName).apply();
    }

    @JavascriptInterface
    public void toggleScreenshots(boolean disable)
    {
      runOnUiThread(() -> {
        if (disable)
        {
          getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
        }
        else
        {
          getWindow().clearFlags(WindowManager.LayoutParams.FLAG_SECURE);
        }
      });
    }

    // ---------------------------------------------------------------
    //  Calendar-event bridge
    // ---------------------------------------------------------------

    @JavascriptInterface
    public void updateCalendarEvents(String json)
    {
      if (json == null) json = "[]";
      SharedPreferences prefs = getSharedPreferences(CalendarNotificationReceiver.PREFS, MODE_PRIVATE);
      String oldJson = prefs.getString(CalendarNotificationReceiver.KEY_EVENTS_JSON, "[]");

      prefs.edit().putString(CalendarNotificationReceiver.KEY_EVENTS_JSON, json).apply();

      try
      {
        JSONArray oldArr = new JSONArray(oldJson);
        JSONArray newArr = new JSONArray(json);
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
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
              nm.cancel(CalendarNotificationReceiver.EVENT_NOTIFICATION_BASE + Math.abs(oldId % 100000));
            }
          }
        }
      }
      catch (Exception ignored) {}

      if (prefs.getBoolean(CalendarNotificationReceiver.KEY_ENABLED, false))
      {
        Intent refresh = new Intent(MainActivity.this, CalendarNotificationReceiver.class);
        refresh.setAction(CalendarNotificationReceiver.ACTION_REFRESH);
        sendBroadcast(refresh);
      }
    }

    @JavascriptInterface
    public void setCalendarNotificationsEnabled(final boolean enabled)
    {
      SharedPreferences prefs = getSharedPreferences(CalendarNotificationReceiver.PREFS, MODE_PRIVATE);
      boolean wasEnabled = prefs.getBoolean(CalendarNotificationReceiver.KEY_ENABLED, false);
      prefs.edit().putBoolean(CalendarNotificationReceiver.KEY_ENABLED, enabled).apply();

      final boolean justEnabled = enabled && !wasEnabled;

      runOnUiThread(() ->
      {
        if (enabled)
        {
          // 1. Notification runtime permission (Android 13+).
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
              && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
                 != PackageManager.PERMISSION_GRANTED)
          {
            // Deliberately NOT setting pendingQuickNoteEnable — this is the
            // calendar flow, so onRequestPermissionsResult must not post the
            // quick-note notification.
            requestPermissions(
              new String[]{Manifest.permission.POST_NOTIFICATIONS},
              NOTIFICATION_PERMISSION_REQUEST);
          }

          // 2. Exact-alarm capability.
          if (justEnabled && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S)
          {
            AlarmManager am = (AlarmManager) getSystemService(Context.ALARM_SERVICE);
            if (am != null && !am.canScheduleExactAlarms())
            {
              Toast.makeText(MainActivity.this,
                "Allow 'Alarms & reminders' so calendar reminders fire on time.",
                Toast.LENGTH_LONG).show();
              Intent i = new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM);
              i.setData(Uri.parse("package:" + getPackageName()));
              try { startActivity(i); } catch (Exception ignored) {}
            }
          }

          CalendarNotificationReceiver.scheduleNext(MainActivity.this);
          CalendarNotificationReceiver.scheduleEventReminders(MainActivity.this);

          if (justEnabled)
          {
            Intent show = new Intent(MainActivity.this, CalendarNotificationReceiver.class);
            sendBroadcast(show);
          }
        }
        else
        {
          CalendarNotificationReceiver.cancel(MainActivity.this);
        }
      });
    }
  }

  @Override
  public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults)
  {
    if (requestCode != NOTIFICATION_PERMISSION_REQUEST) return;

    boolean granted = grantResults.length > 0
      && grantResults[0] == PackageManager.PERMISSION_GRANTED;

    boolean wasQuickNote = pendingQuickNoteEnable;
    pendingQuickNoteEnable = false;

    if (wasQuickNote)
    {
      if (granted)
      {
        setNotificationEnabled(true);
        showNotification(false);
      }
      else
      {
        setNotificationEnabled(false);
        Toast.makeText(this, "Notification permission denied", Toast.LENGTH_SHORT).show();
      }
    }
    else if (!granted)
    {
      // Calendar flow, permission denied.
      Toast.makeText(this, "Notification permission denied", Toast.LENGTH_SHORT).show();
    }
    // else: calendar flow granted — setCalendarNotificationsEnabled already
    // handled scheduling; nothing to do here.
  }
}