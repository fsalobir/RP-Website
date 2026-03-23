-- Wiki : pages hiérarchiques (contenu TipTap JSON) + bucket images.

CREATE TABLE public.wiki_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id uuid REFERENCES public.wiki_pages(id) ON DELETE CASCADE,
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  content jsonb NOT NULL DEFAULT '{"type":"doc","content":[{"type":"paragraph"}]}'::jsonb,
  search_text text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_wiki_pages_parent_sort ON public.wiki_pages (parent_id, sort_order);
CREATE INDEX idx_wiki_pages_search ON public.wiki_pages USING gin (to_tsvector('simple', coalesce(search_text, '') || ' ' || coalesce(title, '')));

CREATE TRIGGER wiki_pages_set_updated_at
  BEFORE UPDATE ON public.wiki_pages
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_updated_at();

ALTER TABLE public.wiki_pages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Wiki pages: lecture publique"
  ON public.wiki_pages FOR SELECT
  USING (true);

CREATE POLICY "Wiki pages: insertion admin"
  ON public.wiki_pages FOR INSERT
  WITH CHECK (public.is_admin());

CREATE POLICY "Wiki pages: mise à jour admin"
  ON public.wiki_pages FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Wiki pages: suppression admin"
  ON public.wiki_pages FOR DELETE
  USING (public.is_admin());

COMMENT ON TABLE public.wiki_pages IS 'Contenu du wiki (JSON TipTap), arborescence via parent_id.';

-- Bucket images wiki (lecture publique, écriture admins via app)
DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NOT NULL THEN
    INSERT INTO storage.buckets (id, name, public)
    VALUES ('wiki-images', 'wiki-images', true)
    ON CONFLICT (id) DO NOTHING;
  END IF;
END
$$;

DROP POLICY IF EXISTS "Wiki images: lecture publique" ON storage.objects;
CREATE POLICY "Wiki images: lecture publique"
ON storage.objects FOR SELECT
USING (bucket_id = 'wiki-images');

DROP POLICY IF EXISTS "Wiki images: upload admin" ON storage.objects;
CREATE POLICY "Wiki images: upload admin"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'wiki-images'
  AND EXISTS (SELECT 1 FROM public.admins a WHERE a.user_id = auth.uid())
);

DROP POLICY IF EXISTS "Wiki images: update admin" ON storage.objects;
CREATE POLICY "Wiki images: update admin"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'wiki-images')
WITH CHECK (bucket_id = 'wiki-images');

DROP POLICY IF EXISTS "Wiki images: delete admin" ON storage.objects;
CREATE POLICY "Wiki images: delete admin"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'wiki-images');
