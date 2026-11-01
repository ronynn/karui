package io.github.ronynn.karui;

import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.service.voice.VoiceInteractionSession;

/**
 * Session shown by the system when the assistant gesture fires.
 *
 * The session is purely a bridge: it starts {@link OverlayService}
 * (the actual floating panel) and then hides itself so the system
 * stops treating us as the focused task. Because VoiceInteractionSession
 * is drawn by the system ON TOP of the current task, the underlying
 * app is never paused — video keeps playing, games keep running.
 */
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

    Intent intent = new Intent(getContext(), OverlayService.class);
    try
    {
      getContext().startService(intent);
    }
    catch (Exception ignored) {}

    // Hide immediately — the overlay is now responsible for UI.
    // A tiny delay avoids a 1-frame flicker of the session window
    // before the overlay has been attached.
    new Handler(Looper.getMainLooper()).postDelayed(
        new Runnable()
        {
          @Override
          public void run()
          {
            hide();
          }
        }, 60);
  }
}