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

    // Start the floating note window directly. No activity, no task switch.
    // The system is already displaying us on top of the current task
    // because we are a VoiceInteractionSession.
    try
    {
      getContext().startService(
          new Intent(getContext(), FloatingWindowService.class));
    }
    catch (Exception ignored) {}

    // Hide the session's own window. We only needed it to get the
    // system-level overlay layer; the actual UI is our Service window.
    hide();
  }
}