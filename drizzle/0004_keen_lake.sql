CREATE TYPE "public"."event_registration_status" AS ENUM('pending', 'confirmed', 'refund_pending', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."special_event_status" AS ENUM('active', 'cancelled', 'completed');--> statement-breakpoint
CREATE TABLE "special_event_discounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"special_event_id" uuid NOT NULL,
	"subscription_id" uuid NOT NULL,
	"discount_amount" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "special_event_registrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"special_event_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"open_class_id" uuid NOT NULL,
	"payment_id" uuid NOT NULL,
	"amount_paid" integer NOT NULL,
	"status" "event_registration_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "special_event_registrations_payment_id_unique" UNIQUE("payment_id")
);
--> statement-breakpoint
CREATE TABLE "special_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(120) NOT NULL,
	"description" text NOT NULL,
	"short_description" varchar(150) NOT NULL,
	"price" integer NOT NULL,
	"start_date" timestamp with time zone NOT NULL,
	"end_date" timestamp with time zone NOT NULL,
	"status" "special_event_status" DEFAULT 'active' NOT NULL,
	"show_on_landing" boolean DEFAULT true NOT NULL,
	"created_by_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "open_class" ADD COLUMN "special_event_id" uuid;--> statement-breakpoint
ALTER TABLE "special_event_discounts" ADD CONSTRAINT "special_event_discounts_special_event_id_special_events_id_fk" FOREIGN KEY ("special_event_id") REFERENCES "public"."special_events"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "special_event_discounts" ADD CONSTRAINT "special_event_discounts_subscription_id_suscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."suscriptions"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "special_event_registrations" ADD CONSTRAINT "special_event_registrations_special_event_id_special_events_id_fk" FOREIGN KEY ("special_event_id") REFERENCES "public"."special_events"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "special_event_registrations" ADD CONSTRAINT "special_event_registrations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "special_event_registrations" ADD CONSTRAINT "special_event_registrations_open_class_id_open_class_id_fk" FOREIGN KEY ("open_class_id") REFERENCES "public"."open_class"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "special_event_registrations" ADD CONSTRAINT "special_event_registrations_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "special_events" ADD CONSTRAINT "special_events_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE UNIQUE INDEX "uk_event_discount_subscription" ON "special_event_discounts" USING btree ("special_event_id","subscription_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uk_event_user_registration" ON "special_event_registrations" USING btree ("special_event_id","user_id");--> statement-breakpoint
ALTER TABLE "open_class" ADD CONSTRAINT "open_class_special_event_id_special_events_id_fk" FOREIGN KEY ("special_event_id") REFERENCES "public"."special_events"("id") ON DELETE cascade ON UPDATE cascade;