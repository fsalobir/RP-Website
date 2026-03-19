-- Suppression de la route problématique "Elbereth-Ishotii" (longue route nationale
-- qui bloquait le calcul des tracés et empêchait la carte de s'afficher).
-- Le nom en base est "Elbereth-Ishotii", pas "Ishotii-Elbereth".
delete from public.routes
where name = 'Elbereth-Ishotii';
