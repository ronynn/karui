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
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewTreeObserver;
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
  private static final String RESIZE_COLOR     = "#504945";

  private static final long AUTOSAVE_INTERVAL_MS = 800L;
  private static final int INITIAL_WIDTH_DP  = 340;
  private static final int INITIAL_HEIGHT_DP = 150;
  private static final int MIN_WIDTH_DP      = 200;
  private static final int MIN_HEIGHT_DP     = 120;
  private static final int MIN_VISIBLE_DP    = 48;
  private static final int COLLAPSED_WIDTH_DP  = 140;
  private static final int COLLAPSED_HEIGHT_DP = 28;

  /**
   * InputManager refuses IME for windows whose obscuring alpha exceeds
   * getMaximumObscuringOpacityForTouch() (~0.8). Keep this strictly
   * below 0.8 so the keyboard can appear over the overlay.
   */
  private static final float WINDOW_ALPHA = 0.78f;

  private final Handler mHandler = new Handler(Looper.getMainLooper());
  private WindowManager mWindowManager;
  private View mRootView;
  private WindowManager.LayoutParams mParams;
  private EditText mEditText;
  private TextView mMinimizeBtn;
  private View mResizeHandle;
  private SharedPreferences mPrefs;
  private Runnable mAutoSaveRunnable;

  private int mScreenWidth;
  private int mScreenHeight;
  private int mPreOffscreenX, mPreOffscreenY;
  private boolean mMostlyOffscreen = false;
  private boolean mCollapsed = false;
  private int mExpandedWidth, mExpandedHeight;

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
    else if (mMostlyOffscreen)
    {
      restoreOnScreen();
    }
    return START_NOT_STICKY;
  }

  private void buildWindow()
  {
    DisplayMetrics realMetrics = new DisplayMetrics();
    mWindowManager.getDefaultDisplay().getRealMetrics(realMetrics);
    mScreenWidth = realMetrics.widthPixels;
    mScreenHeight = realMetrics.heightPixels;

    final int minVisible = dp(MIN_VISIBLE_DP);
    final int minW = dp(MIN_WIDTH_DP);
    final int minH = dp(MIN_HEIGHT_DP);

    int initialW = Math.min(dp(INITIAL_WIDTH_DP), mScreenWidth - dp(32));
    int initialH = dp(INITIAL_HEIGHT_DP);

    mExpandedWidth = initialW;
    mExpandedHeight = initialH;

    FrameLayout rootLayout = new FrameLayout(this);
    GradientDrawable bg = new GradientDrawable();
    bg.setColor(Color.parseColor(PANEL_BG_COLOR));
    bg.setCornerRadius(dp(10));
    rootLayout.setBackground(bg);
    rootLayout.setClipToOutline(true);
    // Focusable by default — required so EditText can receive keys.
    // When collapsed we toggle FLAG_NOT_FOCUSABLE to release focus.
    rootLayout.setFocusable(true);
    rootLayout.setFocusableInTouchMode(true);

    LinearLayout contentLayout = new LinearLayout(this);
    contentLayout.setOrientation(LinearLayout.VERTICAL);
    contentLayout.setLayoutParams(new FrameLayout.LayoutParams(
        FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));

    // Title bar
    FrameLayout titleBar = new FrameLayout(this);
    GradientDrawable titleBg = new GradientDrawable();
    titleBg.setColor(Color.parseColor(HANDLE_BG_COLOR));
    titleBg.setCornerRadii(new float[]{ dp(10), dp(10), dp(10), dp(10), 0, 0, 0, 0 });
    titleBar.setBackground(titleBg);
    titleBar.setLayoutParams(new LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.MATCH_PARENT, dp(28)));

    mMinimizeBtn = new TextView(this);
    mMinimizeBtn.setText("−");
    mMinimizeBtn.setTextSize(18);
    mMinimizeBtn.setTextColor(Color.parseColor(CLOSE_COLOR));
    mMinimizeBtn.setGravity(Gravity.CENTER);
    mMinimizeBtn.setIncludeFontPadding(false);
    mMinimizeBtn.setLayoutParams(new FrameLayout.LayoutParams(
        dp(36), FrameLayout.LayoutParams.MATCH_PARENT,
        Gravity.START | Gravity.CENTER_VERTICAL));
    mMinimizeBtn.setOnClickListener(v -> toggleCollapse());
    titleBar.addView(mMinimizeBtn);

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

    // EditText
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
    mEditText.setPadding(dp(14), dp(10), dp(14), dp(24));
    mEditText.setMinLines(2);
    mEditText.setMaxLines(8);
    mEditText.setFocusable(true);
    mEditText.setFocusableInTouchMode(true);

    String draft = mPrefs.getString(KEY_DRAFT, "");
    if (!draft.isEmpty())
    {
      mEditText.setText(draft);
      mEditText.setSelection(draft.length());
    }

    mEditText.addTextChangedListener(new TextWatcher()
    {
      @Override public void beforeTextChanged(CharSequence s, int a, int b, int c) {}
      @Override public void onTextChanged(CharSequence s, int a, int b, int c) {}
      @Override public void afterTextChanged(Editable s)
      {
        if (s.toString().trim().isEmpty())
          mPrefs.edit().remove(KEY_DRAFT).apply();
      }
    });

    contentLayout.addView(titleBar);
    contentLayout.addView(mEditText);
    rootLayout.addView(contentLayout);

    // Resize handle
    mResizeHandle = new View(this);
    GradientDrawable resizeShape = new GradientDrawable();
    resizeShape.setColor(Color.parseColor(RESIZE_COLOR));
    resizeShape.setCornerRadius(dp(3));
    mResizeHandle.setBackground(resizeShape);
    FrameLayout.LayoutParams rhParams = new FrameLayout.LayoutParams(
        dp(20), dp(20), Gravity.BOTTOM | Gravity.END);
    rhParams.setMargins(0, 0, dp(4), dp(4));
    mResizeHandle.setLayoutParams(rhParams);
    rootLayout.addView(mResizeHandle);

    // Window flags — focusable (no FLAG_NOT_FOCUSABLE) so EditText works.
    int flags = WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL
              | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS;

    mParams = new WindowManager.LayoutParams(
        initialW, initialH,
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
            : WindowManager.LayoutParams.TYPE_PHONE,
        flags, PixelFormat.TRANSLUCENT);

    mParams.gravity = Gravity.TOP | Gravity.CENTER_HORIZONTAL;
    mParams.y = dp(100);
    mParams.softInputMode = WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE
                          | WindowManager.LayoutParams.SOFT_INPUT_STATE_VISIBLE;
    // Critical for IME: alpha must be ≤ 0.8
    mParams.alpha = WINDOW_ALPHA;

    mRootView = rootLayout;
    mWindowManager.addView(mRootView, mParams);

    mPreOffscreenX = mParams.x;
    mPreOffscreenY = mParams.y;

    mPrefs.edit().putBoolean(KEY_OVERLAY_ACTIVE, true).apply();

    mRootView.setOnKeyListener((v, keyCode, event) ->
    {
      if (keyCode == KeyEvent.KEYCODE_BACK && event.getAction() == KeyEvent.ACTION_UP)
      {
        if (mCollapsed) expandWindow();
        else saveAndClose();
        return true;
      }
      return false;
    });

    // Show keyboard AFTER layout — onGlobalLayout is the reliable hook
    mRootView.getViewTreeObserver().addOnGlobalLayoutListener(
        new ViewTreeObserver.OnGlobalLayoutListener()
        {
          @Override public void onGlobalLayout()
          {
            mRootView.getViewTreeObserver().removeOnGlobalLayoutListener(this);
            mHandler.postDelayed(() -> focusAndShowKeyboard(), 150);
          }
        });

    mAutoSaveRunnable = new Runnable()
    {
      @Override public void run()
      {
        saveDraft();
        mHandler.postDelayed(this, AUTOSAVE_INTERVAL_MS);
      }
    };
    mHandler.postDelayed(mAutoSaveRunnable, AUTOSAVE_INTERVAL_MS);

    // Drag + tap-to-expand
    titleBar.setOnTouchListener(new View.OnTouchListener()
    {
      private int startX, startY;
      private float startTouchX, startTouchY;
      private boolean moved;

      @Override public boolean onTouch(View v, MotionEvent e)
      {
        switch (e.getActionMasked())
        {
          case MotionEvent.ACTION_DOWN:
            startX = mParams.x; startY = mParams.y;
            startTouchX = e.getRawX(); startTouchY = e.getRawY();
            moved = false;
            return true;

          case MotionEvent.ACTION_MOVE:
            float dx = e.getRawX() - startTouchX;
            float dy = e.getRawY() - startTouchY;
            if (Math.abs(dx) > dp(3) || Math.abs(dy) > dp(3)) moved = true;
            if (moved)
            {
              int newX = Math.max(-mParams.width + minVisible,
                       Math.min(mScreenWidth - minVisible, startX + (int) dx));
              int newY = Math.max(0,
                       Math.min(mScreenHeight - dp(60), startY + (int) dy));
              mParams.x = newX; mParams.y = newY;
              mWindowManager.updateViewLayout(mRootView, mParams);
              updateOffscreenState();
            }
            return true;

          case MotionEvent.ACTION_UP:
          case MotionEvent.ACTION_CANCEL:
            if (moved && !mMostlyOffscreen)
            { mPreOffscreenX = mParams.x; mPreOffscreenY = mParams.y; }
            else if (!moved && mCollapsed) expandWindow();
            return true;
        }
        return false;
      }
    });

    // Resize handle
    mResizeHandle.setOnTouchListener(new View.OnTouchListener()
    {
      private int startW, startH;
      private float startTouchX, startTouchY;

      @Override public boolean onTouch(View v, MotionEvent e)
      {
        switch (e.getActionMasked())
        {
          case MotionEvent.ACTION_DOWN:
            startW = mParams.width; startH = mParams.height;
            startTouchX = e.getRawX(); startTouchY = e.getRawY();
            return true;
          case MotionEvent.ACTION_MOVE:
            int newW = startW + (int) (e.getRawX() - startTouchX);
            int newH = startH + (int) (e.getRawY() - startTouchY);
            newW = Math.max(minW, Math.min(mScreenWidth - mParams.x, newW));
            newH = Math.max(minH, Math.min(mScreenHeight - mParams.y, newH));
            if (newW != mParams.width || newH != mParams.height)
            {
              mParams.width = newW; mParams.height = newH;
              mWindowManager.updateViewLayout(mRootView, mParams);
            }
            return true;
        }
        return false;
      }
    });
  }

  private void toggleCollapse()
  {
    if (mCollapsed) expandWindow(); else collapseWindow();
  }

  private void collapseWindow()
  {
    if (mCollapsed || mParams == null) return;
    mExpandedWidth = mParams.width;
    mExpandedHeight = mParams.height;

    // Release focus → other apps can use the keyboard again.
    mParams.flags |= WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE;
    mParams.flags &= ~WindowManager.LayoutParams.FLAG_ALT_FOCUSABLE_IM;
    mParams.width = dp(COLLAPSED_WIDTH_DP);
    mParams.height = dp(COLLAPSED_HEIGHT_DP);

    if (mEditText != null) mEditText.setVisibility(View.GONE);
    if (mResizeHandle != null) mResizeHandle.setVisibility(View.GONE);
    if (mMinimizeBtn != null) mMinimizeBtn.setText("+");

    hideKeyboard();
    mCollapsed = true;
    try { mWindowManager.updateViewLayout(mRootView, mParams); }
    catch (Exception ignored) {}
  }

  private void expandWindow()
  {
    if (!mCollapsed || mParams == null) return;
    mParams.flags &= ~WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE;
    mParams.width = mExpandedWidth;
    mParams.height = mExpandedHeight;

    if (mEditText != null) mEditText.setVisibility(View.VISIBLE);
    if (mResizeHandle != null) mResizeHandle.setVisibility(View.VISIBLE);
    if (mMinimizeBtn != null) mMinimizeBtn.setText("−");

    mCollapsed = false;
    try { mWindowManager.updateViewLayout(mRootView, mParams); }
    catch (Exception ignored) {}

    mHandler.postDelayed(() -> focusAndShowKeyboard(), 100);
  }

  /**
   * Reliable keyboard-show sequence for TYPE_APPLICATION_OVERLAY:
   *   1. requestFocus on both root and EditText
   *   2. showSoftInput with SHOW_IMPLICIT
   *   3. toggleSoftInput as fallback (some ROMs ignore step 2)
   */
  private void focusAndShowKeyboard()
  {
    if (mEditText == null || mCollapsed) return;
    try
    {
      mRootView.requestFocus();
      mEditText.requestFocus();

      InputMethodManager imm =
          (InputMethodManager) getSystemService(INPUT_METHOD_SERVICE);
      if (imm == null) return;

      boolean shown = imm.showSoftInput(mEditText, InputMethodManager.SHOW_IMPLICIT);
      if (!shown)
      {
        // Fallback for OEMs that reject showSoftInput on overlays.
        imm.toggleSoftInput(InputMethodManager.SHOW_IMPLICIT, 0);
      }
    }
    catch (Exception ignored) {}
  }

  private void hideKeyboard()
  {
    try
    {
      InputMethodManager imm = (InputMethodManager) getSystemService(INPUT_METHOD_SERVICE);
      if (imm != null && mEditText != null)
        imm.hideSoftInputFromWindow(mEditText.getWindowToken(), 0);
    }
    catch (Exception ignored) {}
  }

  private void updateOffscreenState()
  {
    int visLeft = Math.max(0, mParams.x);
    int visRight = Math.min(mScreenWidth, mParams.x + mParams.width);
    mMostlyOffscreen = (visRight - visLeft) < mParams.width / 2;
  }

  private void restoreOnScreen()
  {
    if (mRootView == null) return;
    mParams.x = mPreOffscreenX;
    mParams.y = mPreOffscreenY;
    try { mWindowManager.updateViewLayout(mRootView, mParams); }
    catch (Exception ignored) {}
    mMostlyOffscreen = false;
    focusAndShowKeyboard();
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
    { mHandler.removeCallbacks(mAutoSaveRunnable); mAutoSaveRunnable = null; }
    hideKeyboard();
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
    { mHandler.removeCallbacks(mAutoSaveRunnable); mAutoSaveRunnable = null; }
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