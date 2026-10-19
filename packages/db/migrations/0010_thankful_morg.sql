-- Add credit metadata in place; preserve period/payment foreign keys and all rows.
ALTER TABLE bill_periods ADD credit_cents integer NOT NULL DEFAULT 0 CHECK (credit_cents >= 0);
--> statement-breakpoint
ALTER TABLE bill_periods ADD notes text;
