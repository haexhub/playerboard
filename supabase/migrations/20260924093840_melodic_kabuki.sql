CREATE TABLE "player_email_change_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid NOT NULL,
	"linked_user_id" uuid NOT NULL,
	"requested_email" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "player_email_change_requests_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "players" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "player_email_change_requests" ADD CONSTRAINT "player_email_change_requests_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_email_change_requests" ADD CONSTRAINT "player_email_change_requests_linked_user_id_users_id_fk" FOREIGN KEY ("linked_user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "player_email_change_requests_player_idx" ON "player_email_change_requests" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "player_email_change_requests_linked_user_idx" ON "player_email_change_requests" USING btree ("linked_user_id");
-- players_email_per_team_uniq is created by the follow-up migration, after the
-- backfill below — creating it here would fail deployment on any pre-existing
-- duplicate legacy address (data-model.md "Migration/backfill").