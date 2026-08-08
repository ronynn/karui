package io.github.ronynn.karui;

import android.Manifest;
import android.animation.ObjectAnimator;
import android.annotation.SuppressLint;
import android.app.Activity;
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
  private static final int NOTIFICATION_PERMISSION_REQUEST = 100;
  private static final String CHANNEL_ID = "note_reply_channel";
  private static final int NOTIFICATION_ID = 1;

  private WebView mWebView;
  private View splashScreen;

  private String pendingFileName;
  private String pendingFileData;
  private String pendingFileType;

  private ValueCallback<Uri[]> mFilePathCallback;

  private boolean isNotificationActive = false;
  private boolean isPageLoaded = false;
  private String inboxTabName = "Inbox";

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

    SharedPreferences prefs = getSharedPreferences("note_queue", MODE_PRIVATE);
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
  }

  // ---------- NOTIFICATION HANDLING ----------

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

  private void showNotification()
  {
    createNotificationChannel();

    NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
    if (manager == null)
    {
      Toast.makeText(this, "Notification service unavailable", Toast.LENGTH_SHORT).show();
      return;
    }

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N && !manager.areNotificationsEnabled())
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
        replyFlags |= PendingIntent.FLAG_IMMUTABLE;
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

      builder.setContentTitle("Quick Note")
        .setContentText("Swipe down to add a note")
        .setContentIntent(openPendingIntent)
        .addAction(replyAction)
        .setOngoing(true);

      Notification notification = builder.build();
      manager.notify(NOTIFICATION_ID, notification);
      isNotificationActive = true;
    }
    catch (Exception e)
    {
      String msg = e.getClass().getSimpleName() + ": " + e.getMessage();
      if (e.getCause() != null)
      {
        msg += "\nCause: " + e.getCause().toString();
      }
      Toast.makeText(this, "Couldn't show notification:\n" + msg, Toast.LENGTH_LONG).show();
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

  // ---------- DATA INJECTION ----------

  private void injectPendingNotes()
  {
    if (!isPageLoaded)
    {
      return;
    }

    SharedPreferences prefs = getSharedPreferences("note_queue", MODE_PRIVATE);
    String jsonStr = prefs.getString("pending_notes_json", "[]");

    if (jsonStr.equals("[]") || jsonStr.isEmpty())
    {
      return;
    }

    prefs.edit().remove("pending_notes_json").apply();

    String js = "if(window.syncNotesArrayFromAndroid) window.syncNotesArrayFromAndroid(" + JSONObject.quote(jsonStr) + ");";
    mWebView.evaluateJavascript(js, null);
  }

  @Override
  protected void onResume()
  {
    super.onResume();
    if (isPageLoaded)
    {
      injectPendingNotes();
    }
  }

  // ---------- ACTIVITY RESULTS & LIFECYCLE ----------

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
    else if (requestCode == FILECHOOSER_RESULTCODE)
    {
      if (mFilePathCallback == null)
      {
        return;
      }
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

  // ---------- JAVASCRIPT INTERFACE ----------

  public class WebAppInterface
  {
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
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU)
          {
            if (checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED)
            {
              requestPermissions(
                new String[]{Manifest.permission.POST_NOTIFICATIONS},
                NOTIFICATION_PERMISSION_REQUEST);
              return;
            }
          }
          showNotification();
        }
        else
        {
          cancelNotification();
        }
      });
    }

    @JavascriptInterface
    public void setInboxTabName(String tabName)
    {
      if (tabName == null || tabName.trim().isEmpty())
      {
        tabName = "Inbox";
      }
      inboxTabName = tabName.trim();
      getSharedPreferences("note_queue", MODE_PRIVATE)
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
  }

  @Override
  public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults)
  {
    if (requestCode == NOTIFICATION_PERMISSION_REQUEST)
    {
      if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED)
      {
        showNotification();
      }
      else
      {
        Toast.makeText(this, "Notification permission denied", Toast.LENGTH_SHORT).show();
      }
    }
  }
}