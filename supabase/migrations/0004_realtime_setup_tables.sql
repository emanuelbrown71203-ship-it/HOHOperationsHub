-- Pages also listen for changes to the setup lists, so publish them too.
alter publication supabase_realtime add table
  public.hoh_leads, public.checklist_templates, public.checklist_items, public.equipment, public.waste_items;
