CREATE TABLE "veo_player_match_stats" (
	"match_id" uuid NOT NULL,
	"veo_jersey_number" integer NOT NULL,
	"stat_type" text NOT NULL,
	"player_id" uuid,
	"matched_manually" boolean DEFAULT false NOT NULL,
	"category" text NOT NULL,
	"value" double precision NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "veo_player_match_stats_match_id_veo_jersey_number_stat_type_pk" PRIMARY KEY("match_id","veo_jersey_number","stat_type")
);
--> statement-breakpoint
ALTER TABLE "veo_player_match_stats" ADD CONSTRAINT "veo_player_match_stats_match_id_veo_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."veo_matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "veo_player_match_stats" ADD CONSTRAINT "veo_player_match_stats_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "veo_player_match_stats_player_idx" ON "veo_player_match_stats" USING btree ("player_id");