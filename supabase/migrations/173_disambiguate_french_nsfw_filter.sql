-- « violé » est courant pour un traité et ne doit pas être confondu avec
-- le nom « viol », qui reste interdit.
DO $$
DECLARE
  v_function record;
  v_before text;
  v_after text;
BEGIN
  FOR v_function IN
    SELECT procedure.oid
    FROM pg_proc procedure
    WHERE procedure.pronamespace = 'public'::regnamespace
      AND procedure.proname IN (
        'enforce_engine_article_safety',
        'review_lore_article'
      )
  LOOP
    v_before := pg_get_functiondef(v_function.oid);
    v_after := replace(
      v_before,
      '|viol|violer|violé|viole|',
      '|viols?|'
    );
    IF v_after = v_before THEN
      RAISE EXCEPTION 'Motif NSFW français introuvable dans la fonction %.',
        v_function.oid::regprocedure;
    END IF;
    EXECUTE v_after;
  END LOOP;
END
$$;
