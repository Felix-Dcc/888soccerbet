-- Generated matches carry a script (half-time and full-time score plus goal timings) that the
-- worker plays out live. Null for every feed and hand-entered game.
ALTER TABLE "Fixture" ADD COLUMN "script" JSONB;
