-- Migration: Add 'personalizada' to class_type enum and custom_name column to open_class
-- This migration is additive and safe: ADD VALUE doesn't affect existing rows,
-- ADD COLUMN with nullable doesn't require table rewrite.

ALTER TYPE "class_type" ADD VALUE IF NOT EXISTS 'personalizada';--> statement-breakpoint
ALTER TABLE "open_class" ADD COLUMN "custom_name" VARCHAR(100);
