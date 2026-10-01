-- Full-text search index shared by Planner and Link Library.
-- entity_type: plan | node | collection | favorite
CREATE VIRTUAL TABLE `search_index` USING fts5(
  `workspace_id` UNINDEXED,
  `entity_type` UNINDEXED,
  `entity_id` UNINDEXED,
  `parent_id` UNINDEXED,
  `title`,
  `body`,
  `tags`,
  tokenize = 'unicode61 remove_diacritics 2'
);
