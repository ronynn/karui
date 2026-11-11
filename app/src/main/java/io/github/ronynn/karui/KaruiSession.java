package io.github.ronynn.karui;

import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.service.voice.VoiceInteractionSession;

public class KaruiSession extends VoiceInteractionSession
{
  public KaruiSession(Context context)
  {
    super(context);
  }

  @Override
  public void onShow(Bundle args, int showFlags)
  {
    super.onShow(args, showFlags);

    // Start the floating note window directly — no activity.
    // This is what makes the overlay appear without any activity switch.
    try
    {
      getContext().startService(
          new Intent(getContext(), FloatingWindowService.class));
    }
    catch (Exception ignored) {}

    // Hide the session window itself — we don't need it.
    hide();
  }
}