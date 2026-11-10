package io.github.ronynn.karui;

import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.text.Editable;
import android.text.InputType;
import android.text.TextWatcher;
import android.util.DisplayMetrics;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.view.inputmethod.InputMethodManager;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

public class FloatingWindowService extends Service
{
  private static final String PREFS_NOTE_QUEUE = "note_queue";
  private static final String KEY_DRAFT = "quick_capture_draft";
  static final String KEY_OVERLAY_ACTIVE = "overlay_active";

  private static final String PANEL_BG_COLOR   = "#282828";
  private static final String HANDLE_BG_COLOR  = "#3C3836";
  private static final String PILL_COLOR       = "#928374";
  private static final String CLOSE_COLOR      = "#EBDBB2";
  private static final String TEXT_COLOR       = "#EBDBB2";
  private static final String HINT_COLOR       = "#928374";

  private static final long AUTOSAVE_INTERVAL_MS = 800L;
  private static final int INITIAL_WIDTH_DP   = 340;
  private static final int INITIAL_HEIGHT_DP  = 150;

  private final Handler mHandler = new Handler(Looper.getMainLooper());
  private WindowManager mWindowManager;
  private View mRootView;
  private WindowManager.LayoutParams mParams;
  private EditText mEditText;
  private SharedPreferences mPrefs;
  private Runnable mAutoSaveRunnable;

  private final BroadcastReceiver closeReceiver = new BroadcastReceiver()
  {
    @Override
    public void onReceive(Context context, Intent intent)
    {
      if (intent != null && MainActivity.ACTION_CLOSE_FLOATING.equals(intent.getAction()))
        saveAndClose();
    }
  };

  @Override
  public void onCreate()
  {
    super.onCreate();
    mWindowManager = (WindowManager) getSystemService(WINDOW_SERVICE);
    mPrefs = getSharedPreferences(PREFS_NOTE_QUEUE, MODE_PRIVATE);

    IntentFilter filter = new IntentFilter(MainActivity.ACTION_CLOSE_FLOATING);
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU)
      registerReceiver(closeReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
    else
      registerReceiver(closeReceiver, filter);
  }

  private int dp(float v)
  {
    return (int) TypedValue.applyDimension(
        TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics());
  }

  @Override
  public int onStartCommand(Intent intent, int flags, int startId)
  {
    if (mRootView == null)
    {
      try { buildWindow(); }
      catch (Exception e)
      {
        e.printStackTrace();
        Toast.makeText(this, "Could not open capture window", Toast.LENGTH_LONG).show();
        stopSelf();
        return START_NOT_STICKY;
      }
    }
    return START_NOT_STICKY;
  }

  private void buildWindow()
  {
    DisplayMetrics dm = new DisplayMetrics();
    mWindowManager.getDefaultDisplay().getMetrics(dm);
    int screenWidth = dm.widthPixels;

    int widthPx = Math.min(dp(INITIAL_WIDTH_DP), screenWidth - dp(32));

    FrameLayout rootLayout = new FrameLayout(this);
    GradientDrawable bg = new GradientDrawable();
    bg.setColor(Color.parseColor(PANEL_BG_COLOR));
    bg.setCornerRadius(dp(10));
    rootLayout.setBackground(bg);
    rootLayout.setClipToOutline(true);
    rootLayout.setElevation(dp(12));

    LinearLayout contentLayout = new LinearLayout(this);
    contentLayout.setOrientation(LinearLayout.VERTICAL);
    contentLayout.setLayoutParams(new FrameLayout.LayoutParams(
        FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));

    FrameLayout titleBar = new FrameLayout(this);
    GradientDrawable titleBg = new GradientDrawable();
    titleBg.setColor(Color.parseColor(HANDLE_BG_COLOR));
    titleBg.setCornerRadii(new float[]{ dp(10), dp(10), dp(10), dp(10), 0, 0, 0, 0 });
    titleBar.setBackground(titleBg);
    titleBar.setLayoutParams(new LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.MATCH_PARENT, dp(28)));

    View pill = new View(this);
    GradientDrawable pillShape = new GradientDrawable();
    pillShape.setColor(Color.parseColor(PILL_COLOR));
    pillShape.setCornerRadius(dp(1));
    pill.setBackground(pillShape);
    titleBar.addView(pill, new FrameLayout.LayoutParams(
        dp(28), dp(2), Gravity.CENTER));

    TextView closeBtn = new TextView(this);
    closeBtn.setText("×");
    closeBtn.setTextSize(20);
    closeBtn.setTextColor(Color.parseColor(CLOSE_COLOR));
    closeBtn.setGravity(Gravity.CENTER);
    closeBtn.setIncludeFontPadding(false);
    closeBtn.setLayoutParams(new FrameLayout.LayoutParams(
        dp(36), FrameLayout.LayoutParams.MATCH_PARENT,
        Gravity.END | Gravity.CENTER_VERTICAL));
    closeBtn.setOnClickListener(v -> saveAndClose());
    titleBar.addView(closeBtn);

    mEditText = new EditText(this);
    mEditText.setLayoutParams(new LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.MATCH_PARENT, 0, 1.0f));
    mEditText.setBackground(null);
    mEditText.setHint("Quick note...");
    mEditText.setHintTextColor(Color.parseColor(HINT_COLOR));
    mEditText.setTextColor(Color.parseColor(TEXT_COLOR));
    mEditText.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
    mEditText.setInputType(InputType.TYPE_CLASS_TEXT
        | InputType.TYPE_TEXT_FLAG_MULTI_LINE
        | InputType.TYPE_TEXT_FLAG_CAP_SENTENCES);
    mEditText.setGravity(Gravity.TOP | Gravity.START);
    mEditText.setPadding(dp(14), dp(10), dp(14), dp(10));
    mEditText.setMinLines(2);
    mEditText.setMaxLines(8);

    String draft = mPrefs.getString(KEY_DRAFT, "");
    if (!draft.isEmpty())
    {
      mEditText.setText(draft);
      mEditText.setSelection(draft.length());
    }

    mEditText.addTextChangedListener(new TextWatcher()
    {
      @Override public void beforeTextChanged(CharSequence s, int start, int count, int after) {}
      @Override public void onTextChanged(CharSequence s, int start, int before, int count) {}
      @Override public void afterTextChanged(Editable s)
      {
        if (s.toString().trim().isEmpty())
          mPrefs.edit().remove(KEY_DRAFT).apply();
      }
    });

    contentLayout.addView(titleBar);
    contentLayout.addView(mEditText);
    rootLayout.addView(contentLayout);

    // NOT_FOCUSABLE → BACK goes to Gallery
    // ALT_FOCUSABLE_IM → keyboard still reaches the EditText
    int flags = WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL
              | WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
              | WindowManager.LayoutParams.FLAG_ALT_FOCUSABLE_IM;

    mParams = new WindowManager.LayoutParams(
        widthPx,
        dp(INITIAL_HEIGHT_DP),
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
            : WindowManager.LayoutParams.TYPE_PHONE,
        flags, PixelFormat.TRANSLUCENT);

    mParams.gravity = Gravity.TOP | Gravity.CENTER_HORIZONTAL;
    mParams.y = dp(100);
    mParams.softInputMode = WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE;

    mRootView = rootLayout;
    mWindowManager.addView(mRootView, mParams);

    mPrefs.edit().putBoolean(KEY_OVERLAY_ACTIVE, true).apply();

    Intent opened = new Intent(MainActivity.ACTION_FLOATING_OPENED);
    opened.setPackage(getPackageName());
    sendBroadcast(opened);

    mEditText.post(() ->
    {
      mEditText.requestFocus();
      InputMethodManager imm = (InputMethodManager) getSystemService(INPUT_METHOD_SERVICE);
      if (imm != null) imm.showSoftInput(mEditText, InputMethodManager.SHOW_IMPLICIT);
    });

    mAutoSaveRunnable = new Runnable()
    {
      @Override
      public void run()
      {
        saveDraft();
        mHandler.postDelayed(this, AUTOSAVE_INTERVAL_MS);
      }
    };
    mHandler.postDelayed(mAutoSaveRunnable, AUTOSAVE_INTERVAL_MS);

    titleBar.setOnTouchListener(new View.OnTouchListener()
    {
      private int startX, startY;
      private float startTouchX, startTouchY;

      @Override
      public boolean onTouch(View v, MotionEvent e)
      {
        switch (e.getActionMasked())
        {
          case MotionEvent.ACTION_DOWN:
            startX = mParams.x;
            startY = mParams.y;
            startTouchX = e.getRawX();
            startTouchY = e.getRawY();
            return true;
          case MotionEvent.ACTION_MOVE:
            mParams.x = startX + (int) (e.getRawX() - startTouchX);
            mParams.y = startY + (int) (e.getRawY() - startTouchY);
            try { mWindowManager.updateViewLayout(mRootView, mParams); }
            catch (Exception ignored) {}
            return true;
        }
        return false;
      }
    });
  }

  private void saveDraft()
  {
    if (mEditText == null) return;
    String text = mEditText.getText().toString();
    if (text.trim().isEmpty()) mPrefs.edit().remove(KEY_DRAFT).apply();
    else mPrefs.edit().putString(KEY_DRAFT, text).apply();
  }

  private void saveAndClose()
  {
    if (mEditText != null)
    {
      String text = mEditText.getText().toString().trim();
      if (!text.isEmpty())
      {
        ProcessTextActivity.saveNoteToQueue(this, text);
        Intent update = new Intent(MainActivity.ACTION_NOTE_ADDED);
        update.setPackage(getPackageName());
        sendBroadcast(update);
      }
      mPrefs.edit().remove(KEY_DRAFT).apply();
    }
    dismiss();
  }

  private void dismiss()
  {
    if (mAutoSaveRunnable != null)
    {
      mHandler.removeCallbacks(mAutoSaveRunnable);
      mAutoSaveRunnable = null;
    }
    try
    {
      InputMethodManager imm = (InputMethodManager) getSystemService(INPUT_METHOD_SERVICE);
      if (imm != null && mEditText != null)
        imm.hideSoftInputFromWindow(mEditText.getWindowToken(), 0);
    }
    catch (Exception ignored) {}

    if (mRootView != null && mWindowManager != null)
    {
      try { mWindowManager.removeView(mRootView); } catch (Exception ignored) {}
      mRootView = null;
    }

    mPrefs.edit().putBoolean(KEY_OVERLAY_ACTIVE, false).apply();
    stopSelf();
  }

  @Override
  public void onDestroy()
  {
    if (mAutoSaveRunnable != null)
    {
      mHandler.removeCallbacks(mAutoSaveRunnable);
      mAutoSaveRunnable = null;
    }
    if (mRootView != null && mWindowManager != null)
    {
      try { mWindowManager.removeView(mRootView); } catch (Exception ignored) {}
      mRootView = null;
    }
    mPrefs.edit().putBoolean(KEY_OVERLAY_ACTIVE, false).apply();
    try { unregisterReceiver(closeReceiver); } catch (Exception ignored) {}
    super.onDestroy();
  }

  @Override
  public IBinder onBind(Intent intent) { return null; }
}