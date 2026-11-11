package io.github.ronynn.karui;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;

public class GhostActivity extends Activity
{
  @Override
  protected void onCreate(Bundle savedInstanceState)
  {
    super.onCreate(savedInstanceState);
    startService(new Intent(this, FloatingWindowService.class));
    finishAndRemoveTask();
    overridePendingTransition(0, 0);
  }
}