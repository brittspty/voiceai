-- A person can mark a decision resolved and record what was done.
ALTER TYPE "RecommendationStatus" ADD VALUE IF NOT EXISTS 'resolved';
