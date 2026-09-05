package io.github.ronynn.karui;

import android.content.Intent;
import android.widget.RemoteViewsService;

public class NotesWidgetService extends RemoteViewsService
{
  @Override
  public RemoteViewsFactory onGetViewFactory(Intent intent)
  {
    return new NotesRemoteViewsFactory(this.getApplicationContext(), intent);
  }
}