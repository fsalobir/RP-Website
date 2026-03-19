-- Suppression de la route problématique "Ishotii-Elbereth" (longue route nationale
-- qui faisait bloquer le calcul des tracés et empêchait la carte de s'afficher).
-- Les route_pathway_points sont supprimés en cascade.
delete from public.routes
where name = 'Ishotii-Elbereth';
