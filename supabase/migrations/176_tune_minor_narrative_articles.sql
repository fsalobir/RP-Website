UPDATE public.action_automation_configs AS config
SET article_profile = 'brief'
FROM public.state_action_types AS action_type
WHERE config.action_type_id = action_type.id
  AND action_type.key = 'insulte_diplomatique'
  AND config.article_profile IS DISTINCT FROM 'brief';
