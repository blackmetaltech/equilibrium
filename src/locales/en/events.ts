// Shift event cards (DESIGN §2.6 lists the 14 event types). Stubs: the dynamic layer (task 1.13) uses these.
export const events: Record<string, string> = {
  'event.cw_pump_trip.title': 'Cooling water pump trip',
  'event.cw_pump_trip.body': 'The cooling water pump has tripped: heat-transfer area behind it drops to a third.',
  'event.feed_inerts.title': 'Inerts in the feed',
  'event.feed_inerts.body': 'The feed now carries {pct} more inert gas.',
};
