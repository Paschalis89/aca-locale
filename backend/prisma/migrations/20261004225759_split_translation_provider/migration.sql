CREATE TYPE "TranslationProvider" AS ENUM (
  'OPENAI',
  'ANTHROPIC',
  'GOOGLE',
  'DEEPL'
);

ALTER TABLE "AiConfiguration"
  ALTER COLUMN "translationProvider" DROP DEFAULT;

ALTER TABLE "AiConfiguration"
  ALTER COLUMN "translationProvider"
  TYPE "TranslationProvider"
  USING ("translationProvider"::text::"TranslationProvider");

ALTER TABLE "AiConfiguration"
  ALTER COLUMN "translationProvider"
  SET DEFAULT 'OPENAI';


ALTER TABLE "AiConfiguration"
  ALTER COLUMN "fallbackProvider" DROP DEFAULT;

ALTER TABLE "AiConfiguration"
  ALTER COLUMN "fallbackProvider"
  TYPE "TranslationProvider"
  USING ("fallbackProvider"::text::"TranslationProvider");

ALTER TABLE "AiConfiguration"
  ALTER COLUMN "fallbackProvider"
  SET DEFAULT 'OPENAI';


ALTER TABLE "TranslationJob"
  ALTER COLUMN "provider"
  TYPE "TranslationProvider"
  USING ("provider"::text::"TranslationProvider");


ALTER TABLE "TranslationJobItem"
  ALTER COLUMN "provider"
  TYPE "TranslationProvider"
  USING ("provider"::text::"TranslationProvider");