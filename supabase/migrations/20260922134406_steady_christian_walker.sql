ALTER TABLE "invitations" DROP CONSTRAINT "invitations_invited_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "players" DROP CONSTRAINT "players_created_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "players" DROP CONSTRAINT "players_last_updated_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "point_categories" DROP CONSTRAINT "point_categories_created_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "point_categories" DROP CONSTRAINT "point_categories_last_updated_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "point_entries" DROP CONSTRAINT "point_entries_created_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "point_entries" DROP CONSTRAINT "point_entries_last_updated_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "team_settings" DROP CONSTRAINT "team_settings_updated_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "teams" DROP CONSTRAINT "teams_created_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "teams" DROP CONSTRAINT "teams_last_updated_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "training_photos" DROP CONSTRAINT "training_photos_uploaded_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "trainings" DROP CONSTRAINT "trainings_created_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "trainings" DROP CONSTRAINT "trainings_last_updated_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "invitations" ALTER COLUMN "invited_by" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "teams" ALTER COLUMN "created_by" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "training_photos" ALTER COLUMN "uploaded_by" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "players" ADD CONSTRAINT "players_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "players" ADD CONSTRAINT "players_last_updated_by_users_id_fk" FOREIGN KEY ("last_updated_by") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "point_categories" ADD CONSTRAINT "point_categories_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "point_categories" ADD CONSTRAINT "point_categories_last_updated_by_users_id_fk" FOREIGN KEY ("last_updated_by") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "point_entries" ADD CONSTRAINT "point_entries_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "point_entries" ADD CONSTRAINT "point_entries_last_updated_by_users_id_fk" FOREIGN KEY ("last_updated_by") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_settings" ADD CONSTRAINT "team_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_last_updated_by_users_id_fk" FOREIGN KEY ("last_updated_by") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_photos" ADD CONSTRAINT "training_photos_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trainings" ADD CONSTRAINT "trainings_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trainings" ADD CONSTRAINT "trainings_last_updated_by_users_id_fk" FOREIGN KEY ("last_updated_by") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;