package io.github.ronynn.karui;

import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.os.Bundle;
import android.service.voice.VoiceInteractionSession;
import android.view.View;

public class KaruiSession extends VoiceInteractionSession
{
  public KaruiSession(Context context)
  {
    super(context);
  }

  /**
   * Return an empty transparent view. This is what prevents any extra
   * "white border" flash: the session's own window has no content to
   * paint, only the system's assist entry animation plays.
   */
  @Override
  public View onCreateContentView()
  {
    View v = new View(getContext());
    v.setBackgroundColor(Color.TRANSPARENT);
    return v;
  }

  @Override
  public void onShow(Bundle args, int showFlags)
  {
    super.onShow(args, showFlags);

    try
    {
      getContext().startService(
          new Intent(getContext(), FloatingWindowService.class));
    }
    catch (Exception ignored) {}

    // Hide immediately. Combined with the transparent content view above,
    // this means no additional surface flashes over the system animation.
    hide();
  }
}