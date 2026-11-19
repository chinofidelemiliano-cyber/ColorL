CREATE UNIQUE INDEX IF NOT EXISTS records_active_ink_code
ON records (owner, json_extract(value,'$.codeKey'))
WHERE kind='tintas' AND status<>'Archivada';
