CREATE OR REPLACE FUNCTION public.enforce_engine_article_safety()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_text text;
BEGIN
  IF NEW.source_platform <> 'engine' THEN
    RETURN NEW;
  END IF;

  v_text := lower(
    COALESCE(NEW.title, '') || E'\n' ||
    COALESCE(NEW.description, '') || E'\n' ||
    COALESCE(NEW.clean_content, '') || E'\n' ||
    COALESCE(NEW.sections::text, '')
  );

  IF v_text ~ '(@everyone|@here|<@!?[&]?[0-9]+>|<#[0-9]+>|```)' THEN
    RAISE EXCEPTION 'Mention Discord ou bloc de code interdit.';
  END IF;
  IF v_text ~* (
    '[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}'
    || '|[0-9]{15,20}'
  ) THEN
    RAISE EXCEPTION 'Identifiant interne ou Discord interdit.';
  END IF;
  IF v_text ~ (
    '\m(d100|jet de (dé|dés)|modificateur|execution_version|consequence_plan|'
    || 'base de données|moteur de jeu|succès (mineur|majeur|critique)|'
    || 'échec (mineur|majeur|critique))\M'
  ) THEN
    RAISE EXCEPTION 'Fait mécanique interdit.';
  END IF;
  IF v_text ~ (
    '\m(nsfw|xxx|porn|porno|pornographie|sexuel|sexuelle|sexuellement|sexe|nudité|nudite|nue?|'
    || 'érotique|erotique|viol|violer|violé|viole|inceste|pédophil(e|ie)|pedophil(e|ie)|'
    || 'masturbation|fellation|sodomie|éjaculation|ejaculation|pénétration|penetration|'
    || 'génital|génitaux|genital|genitals?|pénis|penis|vagin|vagina|vulve|clitoris|sperme|semen|'
    || 'hentai|onlyfans|sexual|intercourse|copulation|bondage|fétiche|fetiche|'
    || 'prostitution|nude|naked|rape|pedophil(e|ia|ic)|masturbat(e|ion)|'
    || 'blowjob|sodomy|erotic|orgasm(e|s)?|orgie|coït|coit)\M'
  ) THEN
    RAISE EXCEPTION 'Contenu NSFW interdit.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_engine_article_safety
ON public.lore_articles;

CREATE TRIGGER trg_enforce_engine_article_safety
BEFORE INSERT OR UPDATE OF title, description, clean_content, sections, source_platform
ON public.lore_articles
FOR EACH ROW
EXECUTE FUNCTION public.enforce_engine_article_safety();
