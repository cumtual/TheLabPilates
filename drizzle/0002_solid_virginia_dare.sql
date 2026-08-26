CREATE TYPE "public"."guest_origin" AS ENUM('user', 'admin');--> statement-breakpoint
CREATE TABLE "guest_credits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"user_subscription_id" uuid NOT NULL,
	"credits_used" integer DEFAULT 0 NOT NULL,
	"guest_enrollment_id" uuid,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "guest_enrollments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"open_class_id" uuid NOT NULL,
	"guest_name" varchar(100) NOT NULL,
	"origin" "guest_origin" NOT NULL,
	"registered_by_id" uuid NOT NULL,
	"status" "enrollment_status" DEFAULT 'pending',
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "guest_credits" ADD CONSTRAINT "guest_credits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "guest_credits" ADD CONSTRAINT "guest_credits_user_subscription_id_user_suscriptions_id_fk" FOREIGN KEY ("user_subscription_id") REFERENCES "public"."user_suscriptions"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "guest_credits" ADD CONSTRAINT "guest_credits_guest_enrollment_id_guest_enrollments_id_fk" FOREIGN KEY ("guest_enrollment_id") REFERENCES "public"."guest_enrollments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guest_enrollments" ADD CONSTRAINT "guest_enrollments_open_class_id_open_class_id_fk" FOREIGN KEY ("open_class_id") REFERENCES "public"."open_class"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "guest_enrollments" ADD CONSTRAINT "guest_enrollments_registered_by_id_users_id_fk" FOREIGN KEY ("registered_by_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE cascade;