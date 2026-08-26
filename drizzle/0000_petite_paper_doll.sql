CREATE TYPE "public"."class_availability" AS ENUM('available', 'not_available', 'full');--> statement-breakpoint
CREATE TYPE "public"."class_status" AS ENUM('scheduled', 'cancelled', 'completed');--> statement-breakpoint
CREATE TYPE "public"."class_type" AS ENUM('yoga', 'mat_pilates', 'barre');--> statement-breakpoint
CREATE TYPE "public"."enrollment_status" AS ENUM('pending', 'attended', 'absent', 'late_cancelled', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."payment_type" AS ENUM('cash', 'transfer', 'card');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('pending', 'active', 'suspended', 'expired');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('client', 'coach', 'admin');--> statement-breakpoint
CREATE TABLE "class_enrolleds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"open_class_id" uuid NOT NULL,
	"user_suscription_id" uuid NOT NULL,
	"status" "enrollment_status" DEFAULT 'pending',
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "debit_cards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"card_name" varchar NOT NULL,
	"card_number" varchar NOT NULL,
	"card_bank" varchar NOT NULL,
	"active" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now(),
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "open_class" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"class_date" timestamp with time zone DEFAULT now(),
	"coach_user_id" uuid,
	"capacity" integer,
	"available" "class_availability" DEFAULT 'available',
	"class_type" "class_type",
	"status" "class_status" DEFAULT 'scheduled',
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "password_resets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token" varchar NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "password_resets_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_type" "payment_type" NOT NULL,
	"confirmend" boolean DEFAULT false,
	"date_confirmed" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "suscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar,
	"sessions" integer,
	"guest" boolean,
	"price" integer
);
--> statement-breakpoint
CREATE TABLE "user_suscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"days_remaining" integer DEFAULT 0,
	"payment_id" uuid NOT NULL,
	"suscription_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"active" boolean DEFAULT false,
	"status" "subscription_status" DEFAULT 'pending',
	"expiration_date" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "user_suscriptions_payment_id_unique" UNIQUE("payment_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" varchar NOT NULL,
	"email" varchar NOT NULL,
	"password" varchar NOT NULL,
	"role" "user_role" DEFAULT 'client' NOT NULL,
	"email_verified" boolean DEFAULT false,
	"email_verification_token" varchar,
	"created_at" timestamp with time zone DEFAULT now(),
	"deleted_at" timestamp with time zone,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "class_enrolleds" ADD CONSTRAINT "class_enrolleds_open_class_id_open_class_id_fk" FOREIGN KEY ("open_class_id") REFERENCES "public"."open_class"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "class_enrolleds" ADD CONSTRAINT "class_enrolleds_user_suscription_id_user_suscriptions_id_fk" FOREIGN KEY ("user_suscription_id") REFERENCES "public"."user_suscriptions"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "open_class" ADD CONSTRAINT "open_class_coach_user_id_users_id_fk" FOREIGN KEY ("coach_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "password_resets" ADD CONSTRAINT "password_resets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "user_suscriptions" ADD CONSTRAINT "user_suscriptions_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "user_suscriptions" ADD CONSTRAINT "user_suscriptions_suscription_id_suscriptions_id_fk" FOREIGN KEY ("suscription_id") REFERENCES "public"."suscriptions"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "user_suscriptions" ADD CONSTRAINT "user_suscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE UNIQUE INDEX "uk_class_user_enrollment" ON "class_enrolleds" USING btree ("open_class_id","user_suscription_id");