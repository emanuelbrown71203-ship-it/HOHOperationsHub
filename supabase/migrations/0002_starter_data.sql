-- Starter data. Everything here can be edited or removed in the app's Setup screen.

-- Checklists
with t as (
  insert into public.checklist_templates (name, shift, sort_order) values
    ('Opening', 'Opening', 1),
    ('Mid-Shift', 'Mid', 2),
    ('Closing', 'Closing', 3),
    ('Weekly Deep Clean', 'Any', 4)
  returning id, name
)
insert into public.checklist_items (template_id, label, sort_order)
select t.id, i.label, i.ord
from t
join (values
  ('Opening', 'Turn on fryers and verify oil level', 1),
  ('Opening', 'Check walk-in cooler and freezer temps', 2),
  ('Opening', 'Calibrate thermometers', 3),
  ('Opening', 'Set up breading table', 4),
  ('Opening', 'Verify thawed product for today', 5),
  ('Opening', 'Set up and test sanitizer buckets', 6),
  ('Opening', 'Stock hand sinks (soap and towels)', 7),
  ('Opening', 'Stock line with packaging and supplies', 8),
  ('Mid-Shift', 'Filter fryers', 1),
  ('Mid-Shift', 'Restock breading station', 2),
  ('Mid-Shift', 'Change sanitizer buckets', 3),
  ('Mid-Shift', 'Check hold times and discard expired product', 4),
  ('Mid-Shift', 'Sweep and spot-mop kitchen floor', 5),
  ('Mid-Shift', 'Empty trash', 6),
  ('Closing', 'Filter and cover fryers', 1),
  ('Closing', 'Break down and clean breading table', 2),
  ('Closing', 'Clean grill', 3),
  ('Closing', 'Wrap, label and date all product', 4),
  ('Closing', 'Run dishes and clean dish area', 5),
  ('Closing', 'Clean and sanitize all prep surfaces', 6),
  ('Closing', 'Final walk-in temp check', 7),
  ('Closing', 'Sweep and mop floors', 8),
  ('Closing', 'Take out trash and recycling', 9),
  ('Weekly Deep Clean', 'Clean hood filters', 1),
  ('Weekly Deep Clean', 'Delime dish machine', 2),
  ('Weekly Deep Clean', 'Clean walk-in shelving', 3),
  ('Weekly Deep Clean', 'Clean behind and under equipment', 4)
) as i(template, label, ord) on i.template = t.name;

-- Equipment
insert into public.equipment (name, category, sort_order) values
  ('Fryer 1', 'Fryer', 1),
  ('Fryer 2', 'Fryer', 2),
  ('Fryer 3', 'Fryer', 3),
  ('Fryer 4', 'Fryer', 4),
  ('Grill', 'Cooking', 10),
  ('Holding Cabinet', 'Holding', 20),
  ('Breading Table', 'Prep', 30),
  ('Walk-in Cooler', 'Refrigeration', 40),
  ('Walk-in Freezer', 'Refrigeration', 41),
  ('Dish Machine', 'Cleaning', 50),
  ('Ice Machine', 'Other', 60);

-- Waste items
insert into public.waste_items (name, default_unit, sort_order) values
  ('Filets', 'each', 1),
  ('Spicy Filets', 'each', 2),
  ('Nuggets', 'each', 3),
  ('Strips', 'each', 4),
  ('Grilled Filets', 'each', 5),
  ('Grilled Nuggets', 'each', 6),
  ('Waffle Fries', 'orders', 7),
  ('Mac & Cheese', 'pans', 8),
  ('Buns', 'each', 9),
  ('Biscuits', 'each', 10),
  ('Hash Browns', 'orders', 11),
  ('Raw Chicken', 'lbs', 12);
