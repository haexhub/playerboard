ALTER TABLE "veo_matches" DROP CONSTRAINT "veo_matches_veo_match_id_unique";--> statement-breakpoint
CREATE INDEX "point_entries_category_idx" ON "point_entries" USING btree ("category_id");--> statement-breakpoint
CREATE UNIQUE INDEX "veo_matches_team_match_uniq" ON "veo_matches" USING btree ("team_id","veo_match_id");