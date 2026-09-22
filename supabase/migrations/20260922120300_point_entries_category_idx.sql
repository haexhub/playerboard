-- point_entries.category_id is checked on every category delete (FK
-- restrict) and by prevent_referenced_team_change(), but was the only
-- foreign key on the table without an index.

create index if not exists point_entries_category_idx
  on public.point_entries using btree (category_id);
